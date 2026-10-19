"""User-directed AI structure changes, bounded inference and source validation."""
import asyncio
from io import BytesIO
import json

import httpx
from PIL import Image
from pptx import Presentation
import pytest

from app import database as db, main
from app.config import settings
from app.models import AssistantPlan, AssistantRequest, DeckContent, OutlineRequest, Slide
from app.services import assistant, llm, operations
from app.services.materials import image_data
from test_assistant import client, request_for


def answer(monkeypatch, plan):
    async def respond(*args, **kwargs):
        return {'summary': 'Предлагаю изменения.', **plan}
    monkeypatch.setattr(llm, 'complete_with_template', respond)


def test_add_reorder_delete_preview_apply_export_and_undo(client, monkeypatch):
    body = request_for(client, slide=None, instruction='Добавь вывод, убери первый слайд и поставь вывод в начало')
    answer(monkeypatch, {'added_slides': [{'slide': 2, 'title': 'Conclusion', 'body': '30 участников.'}],
                        'slide_order': [2, 1], 'title': 'New title', 'audience': 'Investors'})
    original = client.get('/api/projects/ai-test').json()
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    proposal = response.json()['proposal']
    assert [s['title'] for s in proposal['content']['slides']] == ['Conclusion', 'Итог']
    assert proposal['content']['title'] == 'New title' and proposal['content']['audience'] == 'Investors'
    assert any(change['field'] == 'audience' for change in proposal['changes'])
    assert client.get('/api/projects/ai-test').json() == original
    preview = client.post('/api/projects/ai-test/preview', json={'content': proposal['content'], 'variant': 'a'})
    assert preview.status_code == 200 and len(preview.json()['scenes']) == 2
    applied = client.post(f'/api/projects/ai-test/assistant/proposals/{proposal["id"]}/apply', json=body)
    assert applied.status_code == 200, applied.text
    pptx = client.get('/api/projects/ai-test/export/pptx')
    assert len(Presentation(BytesIO(pptx.content)).slides) == 2
    restored = client.post('/api/projects/ai-test/undo', json={'base_updated_at': applied.json()['project']['updated_at']})
    assert restored.json()['content'] == body['content']


@pytest.mark.parametrize('plan, options', [
    ({'slide_order': [1, 1]}, {}),
    ({'slide_order': [-1, 0]}, {}),
    ({'slide_order': [5]}, {}),
    ({'slide_order': []}, {}),
    ({'slide_order': [1]}, {'locked_fields': [{'slide': 0, 'field': 'title'}]}),
    ({'slide_order': [0]}, {'locked_facts': ['30 участников.']}),
    ({'slide_order': [1, 0]}, {'allow_structure': False}),
    ({'slide_order': [1, 0]}, {'slide': 0}),
    ({'title': 'New deck title'}, {'slide': 0}),
    ({'added_slides': [{'slide': 3, 'title': 'Skipped index'}]}, {}),
    ({'added_slides': [{'slide': 2, 'title': 'Fake', 'body': '999 посетителей.'}]}, {}),
])
def test_invalid_structural_changes_never_publish(client, monkeypatch, plan, options):
    body = request_for(client, **{'slide': None, **options})
    answer(monkeypatch, plan)
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 502, response.text
    assert client.get('/api/projects/ai-test').json()['content'] == body['content']


def test_delete_last_slide_is_visible_in_review(client, monkeypatch):
    body = request_for(client, slide=None, instruction='Удали последний слайд')
    answer(monkeypatch, {'slide_order': [0]})
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['changed_slides'] == [1]
    assert any(c['field'] == 'slide' and c['before'] and c['after'] is None for c in response.json()['proposal']['changes'])


def test_instruction_can_supply_new_figures_and_literal_quote(client, monkeypatch):
    text = 'Добавь в начало: План на следующий год — 42 участника.'
    body = request_for(client, instruction=text)
    answer(monkeypatch, {'changes': [{'slide': 0, 'title': 'План', 'body': 'План на следующий год — 42 участника.',
                                     'source_quote': 'План на следующий год — 42 участника.'}]})
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert any(s['text'] == text for s in response.json()['proposal']['content']['evidence_sources'])


def test_repair_uses_one_call_even_with_remaining_old_errors(client, monkeypatch):
    calls = []
    async def respond(*args, **kwargs):
        calls.append(1)
        return {'summary': 'Заменил заголовок. Переполнение ещё требует сокращения.', 'changes': [{'slide': 0, 'title': 'Пилот'}]}
    monkeypatch.setattr(llm, 'complete_with_template', respond)
    body = request_for(client, action='repair')
    body['content']['slides'][0]['body'] = 'Очень длинный подробный текст. ' * 70
    body['content']['slides'][0]['bullets'] = ['Подробный тезис. ' * 12] * 10
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert len(calls) == 1
    assert any(i['code'] == 'overflow' for i in response.json()['issues'])


def test_absolute_inference_timeout_closes_request(monkeypatch):
    monkeypatch.setattr(settings, 'base_url', 'http://127.0.0.1:8001/v1')
    monkeypatch.setattr(settings, 'timeout', .02)
    stopped = []
    async def respond(request):
        try:
            await asyncio.Future()
        finally:
            stopped.append(True)
    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
            with pytest.raises(llm.LLMError, match='лимита времени'):
                await llm.complete_json('JSON', {}, client=transport)
            assert stopped and not transport.is_closed
    asyncio.run(check())


def test_direct_deadline_includes_queue_and_releases_job(client, monkeypatch):
    original = db.project_get('ai-test')
    monkeypatch.setattr(settings, 'operation_timeout', .03)
    async def check():
        monkeypatch.setattr(main, 'generation_slots', asyncio.Semaphore(0))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url='http://testserver',
                                     cookies=client.cookies, headers=dict(client.headers)) as api:
            jid = (await api.post('/api/ai/operations')).json()['job_id']
            response = await api.post('/api/outline', json={'template_id': 'tech', 'prompt': 'Plan', 'count': 3},
                                      headers={'X-AI-Operation-ID': jid})
            assert response.status_code == 504 and response.json()['detail']['code'] == 'AI_TIMEOUT'
            assert db.job_get(jid)['state'] == 'failed'
    asyncio.run(check())
    assert db.project_get('ai-test') == original


def test_reasoning_defaults_and_explicit_provider_overrides(monkeypatch):
    monkeypatch.setattr(settings, 'reasoning_enabled', False)
    monkeypatch.setattr(settings, 'extra_body', {})
    monkeypatch.setattr(settings, 'base_url', 'https://openrouter.ai/api/v1')
    assert llm.inference_options() == {'reasoning': {'enabled': False}}
    monkeypatch.setattr(settings, 'extra_body', {'reasoning': {'enabled': True}})
    assert llm.inference_options() == settings.extra_body
    monkeypatch.setattr(settings, 'base_url', 'http://127.0.0.1:8001/v1')
    monkeypatch.setattr(settings, 'model', 'Qwen/Qwen3.8-27B')
    monkeypatch.setattr(settings, 'extra_body', {})
    assert llm.inference_options()['chat_template_kwargs']['enable_thinking'] is False
    monkeypatch.setattr(settings, 'extra_body', {'chat_template_kwargs': {'enable_thinking': True, 'custom': 1}})
    assert llm.inference_options()['chat_template_kwargs'] == {'enable_thinking': True, 'custom': 1}
    monkeypatch.setattr(settings, 'reasoning_enabled', True)
    monkeypatch.setattr(settings, 'extra_body', {})
    assert llm.inference_options() == {}


def test_outline_has_only_one_correction_and_no_growth_for_validation(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'live')
    calls = []
    async def respond(*args, **kwargs):
        calls.append(kwargs.get('max_tokens', settings.outline_max_tokens))
        raise llm.LLMFormatError('bad JSON')
    monkeypatch.setattr(llm, 'complete_with_template', respond)
    with pytest.raises(llm.LLMError, match='двух попыток'):
        asyncio.run(llm.make_outline(OutlineRequest(template_id='test', prompt='Topic', count=3), {'name': 'Test', 'metadata': {'ratio': 16/9}}))
    assert calls == [settings.outline_max_tokens] * 2


def test_large_imported_image_matches_slide_contract(tmp_path):
    path = tmp_path / 'image.png'
    Image.new('RGB', (1600, 1200), '#ff8800').save(path)
    slide = Slide(title='Photo', kind='image', image_data=image_data(path))
    assert slide.image_data.startswith('data:image/png;base64,')


def test_verified_analytical_slide_cannot_be_deleted():
    from app.analytics_models import AnalyticalVisual, AnalyticalSeries
    visual = AnalyticalVisual(chart_type='bar', labels=['A', 'B'],
                              series=[AnalyticalSeries(name='Revenue', values=[12, 18], unit='₽')])
    content = DeckContent(title='Analysis', slides=[Slide(title='Overview'), Slide(title='Verified', kind='analysis', analytics=visual)])
    request = AssistantRequest(content=content, base_updated_at='test')
    plan = AssistantPlan(summary='Delete', slide_order=[0])
    with pytest.raises(ValueError, match='аналитические'):
        assistant.apply_structure(content.model_copy(deep=True), plan, request, '', {'metadata': {}})


def test_context_audit_omits_binary_and_analytical_payload(monkeypatch):
    monkeypatch.setattr(settings, 'mode', 'live')
    monkeypatch.setattr(settings, 'context_audit', True)
    from app.analytics_models import AnalyticalVisual, AnalyticalSeries
    visual = AnalyticalVisual(chart_type='bar', labels=['A', 'B'],
                              series=[AnalyticalSeries(name='Revenue', values=[12, 18], unit='₽')])
    deck = DeckContent(title='Audit', slides=[Slide(title='Verified', kind='analysis', analytics=visual,
                                                resource_icon_data=['PRIVATE_BINARY_PAYLOAD'])])
    async def response(system, payload):
        assert 'PRIVATE_BINARY_PAYLOAD' not in json.dumps(payload)
        analytical = payload['presentation']['slides'][0]['analytics']
        assert analytical['read_only'] and 'series' not in analytical
        return {'issues': []}
    monkeypatch.setattr(llm, 'complete_json', response)
    assert asyncio.run(llm.review_content(deck.model_dump(), 'Source material.')) == []


def test_assistant_binds_owned_image_resource(client, monkeypatch):
    buffer = BytesIO()
    Image.new('RGB', (1600, 1200), '#ff8800').save(buffer, format='PNG')
    uploaded = client.post('/api/materials/import', files={'files': ('owned.png', buffer.getvalue(), 'image/png')})
    assert uploaded.status_code == 200, uploaded.text
    resource_id = uploaded.json()['resource_ids'][0]
    body = request_for(client, instruction='Используй загруженное изображение')
    body['content']['resource_ids'] = [resource_id]
    answer(monkeypatch, {'changes': [{'slide': 0, 'kind': 'image', 'resource_id': resource_id, 'body': ''}]})
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['proposal']['content']['slides'][0]['image_data'].startswith('data:image/png;base64,')


def test_compact_schema_has_no_dangling_references_or_binary_fields():
    schema = llm.compact_schema(AssistantPlan)
    properties = schema['$defs']['SlidePatch']['properties']
    assert not {'analytics', 'image_data', 'resource_icon_data'} & properties.keys()
    def visit(value):
        if isinstance(value, dict):
            if '$ref' in value:
                assert value['$ref'].rsplit('/', 1)[-1] in schema['$defs']
            for child in value.values(): visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    visit(schema)


def test_formatting_instruction_does_not_consume_evidence_quota(client, monkeypatch):
    body = request_for(client, instruction='Переформулируй заголовок')
    answer(monkeypatch, {'changes': [{'slide': 0, 'title': 'Пилот'}]})
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['proposal']['content']['evidence_sources'] == []


def test_proposal_expiring_during_preparation_cannot_publish(client, monkeypatch):
    from uuid import uuid4
    from app.services import assistant_proposals
    body = AssistantRequest.model_validate(request_for(client))
    uid = db.project_get('ai-test')['user_id']
    jid = str(uuid4())
    db.job_create(jid, uid, 'ai', {})
    db.job_start(jid, uid)
    original = assistant_proposals.fingerprint
    def expired(value):
        result = original(value)
        operations.operation_deadline.set(0)
        return result
    monkeypatch.setattr(assistant_proposals, 'fingerprint', expired)
    token = operations.operation_deadline.set(None)
    try:
        with pytest.raises(TimeoutError):
            assistant_proposals.create_proposal('ai-test', uid, body, body.content, '', {}, jid)
    finally:
        operations.operation_deadline.reset(token)
    with db.connection() as connection:
        assert connection.execute('SELECT COUNT(*) FROM assistant_proposals').fetchone()[0] == 0
    assert db.job_get(jid)['state'] == 'running'
