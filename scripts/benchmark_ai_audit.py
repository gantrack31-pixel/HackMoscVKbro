"""Offline comparison against HEAD; no .env, provider requests or user data."""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from time import perf_counter
import types
from unittest.mock import patch

os.environ['PYTHON_DOTENV_DISABLED'] = '1'
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))

from app.config import settings
from app.models import AssistantPlan, AssistantRequest, DeckContent, Slide
from app.services import assistant, audit, llm, sources


def baseline(name):
    code = subprocess.check_output(['git', 'show', f'HEAD:backend/app/services/{name}.py'], cwd=ROOT).decode('utf-8')
    module = types.ModuleType(f'app.services.audit_baseline_{name}')
    module.__package__ = 'app.services'
    exec(compile(code, f'<baseline-{name}>', 'exec'), module.__dict__)
    return module


def main():
    old_assistant, old_llm, old_sources = [baseline(name) for name in ('assistant', 'llm', 'sources')]
    old_assistant.llm = old_llm
    template = {'name': 'Synthetic', 'metadata': {'ratio': 16 / 9, 'assets': []}}
    content = DeckContent(title='Synthetic', slides=[Slide(title='Обзор проекта',
        body='Очень длинный подробный текст. ' * 70,
        bullets=['Подробный тезис. ' * 12] * 10) for _ in range(8)])
    request = AssistantRequest(content=content, base_updated_at='test', instruction='Уточни заголовок',
                               action='repair', slide=None)
    source = ('Исходный материал проекта описывает стратегию развития команды и итоги обсуждения. ' * 600)[:48000]
    result = {'kind': 'offline_synthetic_no_provider', 'slides': 8, 'source_characters': len(source)}
    result['baseline_commit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
    for name, module, model in [('before', old_assistant, old_llm), ('after', assistant, llm)]:
        counts = {'model_calls': 0, 'source_binding_calls': 0, 'request_bytes': []}
        bind = old_sources.slide_binding if name == 'before' else sources.slide_binding
        def binding(*args, **kwargs):
            counts['source_binding_calls'] += 1
            return bind(*args, **kwargs)
        async def response(system, payload, template):
            counts['model_calls'] += 1
            counts['request_bytes'].append(len(json.dumps(payload, ensure_ascii=False).encode()))
            return {'summary': 'Заголовок уточнён; плотность ещё требует проверки.',
                    'changes': [{'slide': 0, 'title': 'Результаты проекта'}]}
        started = perf_counter()
        with patch.object(settings, 'vision', False), patch.object(model, 'complete_with_template', response), \
                patch.object(audit, 'slide_binding', binding), patch.object(assistant, 'slide_binding', binding):
            proposed, report = asyncio.run(module.edit_presentation(request, template, source))
        counts['local_seconds'] = round(perf_counter() - started, 4)
        counts['first_request_bytes'] = counts.pop('request_bytes')[0]
        counts['schema_bytes'] = len(json.dumps(model.compact_schema(AssistantPlan), ensure_ascii=False).encode())
        counts['remaining_errors'] = sum(item['severity'] == 'error' for item in report['issues'])
        result[name] = counts
    result['first_request_reduction_percent'] = round(100 * (1 - result['after']['first_request_bytes'] / result['before']['first_request_bytes']), 1)
    result['local_speedup'] = round(result['before']['local_seconds'] / result['after']['local_seconds'], 2)
    output = ROOT / 'docs' / 'project-audit' / 'ai-audit-performance-2026-10-19.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
