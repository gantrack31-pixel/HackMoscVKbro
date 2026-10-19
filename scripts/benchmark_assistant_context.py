"""Offline request/build-count comparison; not an inference latency benchmark.

Run: PYTHONPATH=backend python scripts/benchmark_assistant_context.py
Requires the baseline commit in local git history and backend dependencies.
"""
import argparse
import asyncio
import json
from pathlib import Path
import subprocess
import sys
import types
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.models import AssistantRequest, DeckContent, Slide  # noqa: E402
from app.config import settings  # noqa: E402
from app.services import assistant, audit, llm, layout  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', default='6b032ef92d14a6b81ceabc4749d07f511565c5e4')
    args = parser.parse_args()
    baseline = types.ModuleType('app.services.assistant_baseline')
    baseline.__package__ = 'app.services'
    code = subprocess.check_output(['git', 'show', f'{args.baseline}:backend/app/services/assistant.py'], cwd=ROOT, text=True)
    exec(compile(code, '<baseline-assistant>', 'exec'), baseline.__dict__)
    request = AssistantRequest(content=DeckContent(title='Проверка', slides=[
        Slide(title=f'Раздел {i}', body='Содержимое текущего материала. '*25) for i in range(20)]),
        base_updated_at='v1', slide=5, instruction='Объясни ограничения')
    source = ('Материал об истории проекта и сценариях использования. '*30+'\n')*30
    original = layout.build_scene
    results = {}
    for name, module in [('before', baseline), ('after', assistant)]:
        counts = {'scene_builds': 0}
        payloads = []

        def counted(*args, **kwargs):
            counts['scene_builds'] += 1
            return original(*args, **kwargs)

        async def answer(system, payload, template):
            payloads.append(len(json.dumps(payload, ensure_ascii=False).encode()))
            return {'summary': 'Изменения не нужны.', 'changes': []}

        with patch.object(settings, 'vision', False), patch.object(llm, 'complete_with_template', answer), \
                patch.object(module, 'build_scene', counted), patch.object(audit, 'build_scene', counted):
            asyncio.run(module.edit_presentation(request, {'name': 'Test', 'metadata': {'ratio': 16/9}}, source))
        results[name] = {**counts, 'request_json_bytes': payloads[0], 'model_calls': len(payloads)}
    results['request_reduction_percent'] = round((1-results['after']['request_json_bytes']/results['before']['request_json_bytes'])*100, 1)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
