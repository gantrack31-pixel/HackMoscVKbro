"""Immutable recipes, run evidence and a wall-clock deadline for generation."""
from functools import wraps
from hashlib import sha256
import json
from ..config import BASE, settings

BUDGET_SECONDS = 300
OUTLINE_BUDGET_SECONDS = None  # standalone AI: no business deadline
ASSEMBLY_BUDGET_SECONDS = 300
RECIPE_VERSION = '2026.09.29.2'
VARIANT_AXES = [
    {'id': 'a', 'title': 'Классический', 'layout': 'Спокойная иерархия и широкое поле текста', 'density': 'balanced'},
    {'id': 'b', 'title': 'Акцентный', 'layout': 'Контрастная боковая зона и компактные блоки', 'density': 'compact'},
    {'id': 'c', 'title': 'Минималистичный', 'layout': 'Тонкие акценты, крупные поля и короткие блоки', 'density': 'airy'},
]
STAGES = [
    {'id': 'normalize', 'name': 'Нормализация шаблона и пакета', 'type': 'deterministic'},
    {'id': 'outline', 'name': 'Структура и содержание', 'type': 'model'},
    {'id': 'design', 'name': 'Три композиции', 'type': 'model'},
    {'id': 'images', 'name': 'Иллюстрации FLUX.1-schnell (опционально)', 'type': 'model'},
    {'id': 'layout', 'name': 'Размещение нативных объектов', 'type': 'deterministic'},
    {'id': 'audit', 'name': 'Геометрия, читаемость, источники', 'type': 'deterministic'},
    {'id': 'semantic', 'name': 'Смысловая проверка по запросу', 'type': 'model'},
    {'id': 'export', 'name': 'PPTX / PDF / HTML по запросу', 'type': 'deterministic'},
]

def recipe():
    snippets = []
    for name in ('outline', 'design', 'audit', 'assistant'):
        text = (BASE / 'prompts' / f'{name}.txt').read_text('utf-8')
        snippets.append({'id': name, 'version': sha256(text.encode()).hexdigest()[:12], 'text': text})
    code = []
    for name in ('main.py', 'models.py', 'icon_catalog.py', 'services/operations.py', 'services/provider_http.py', 'services/icons.py', 'services/workflow.py', 'services/templates.py',
                 'services/materials.py', 'services/llm.py', 'services/images.py', 'services/assistant.py', 'services/template_context.py',
                 'services/layout.py', 'services/visuals.py', 'services/audit.py', 'services/export.py',
                 'services/sources.py', 'services/template_package.py', 'services/template_parser.py', 'services/palette.py'):
        path = BASE / 'app' / name
        code.append({'id': name, 'sha256': sha256(path.read_bytes()).hexdigest()})
    fingerprint = sha256(json.dumps({'snippets': snippets, 'code': code}, sort_keys=True).encode()).hexdigest()
    return {'version': RECIPE_VERSION, 'fingerprint': fingerprint, 'stages': STAGES, 'snippets': snippets,
            'components': code, 'variants': VARIANT_AXES, 'budget_seconds': BUDGET_SECONDS,
            'outline_budget_seconds': OUTLINE_BUDGET_SECONDS, 'assembly_budget_seconds': ASSEMBLY_BUDGET_SECONDS,
            'native_exports': ['text', 'chart', 'table', 'shape', 'connector', 'picture']}

def manifest(template, content, source, audit_counts, duration, jid, timings=None):
    clean_model = settings.model
    return {'job_id': jid, 'recipe': recipe(), 'mode': settings.mode, 'model': clean_model,
            'template': {'id': template['id'], 'name': template['name'],
                         'fingerprint': sha256(json.dumps(template['metadata'], sort_keys=True).encode()).hexdigest()},
            'source_sha256': sha256(source.encode()).hexdigest(), 'slides': len(content.slides),
            'audit': audit_counts, 'duration_seconds': round(duration, 2), 'within_budget': duration <= BUDGET_SECONDS,
            'timings':{**{k:round(v,4) for k,v in (timings or {}).items()},'total':round(duration,4)}}

def generation_budget(function):
    @wraps(function)
    async def bounded(jid, *args, **kwargs):
        from .operations import run_operation
        return await run_operation(jid,lambda:function(jid,*args,**kwargs),business_limit=BUDGET_SECONDS)
    return bounded
