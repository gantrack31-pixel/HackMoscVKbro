"""Assistant schema transport stays scoped to explicitly enabled OpenRouter calls."""
import asyncio
from copy import deepcopy
import json

import httpx
import pytest

from app.config import settings
from app.models import AssistantPlan
from app.services import llm


REPLY = {'summary': 'Предлагаю краткий текст.', 'changes': [{'slide': 1, 'body': 'Короткий текст.'}]}


@pytest.fixture(autouse=True)
def configure_assistant_transport(monkeypatch):
    monkeypatch.setattr(settings, 'base_url', 'https://openrouter.ai/api/v1')
    monkeypatch.setattr(settings, 'api_key', 'test-only-assistant-key')
    monkeypatch.setattr(settings, 'model', 'test-only-model')
    monkeypatch.setattr(settings, 'json_mode', True)
    monkeypatch.setattr(settings, 'assistant_json_schema', True)
    monkeypatch.setattr(settings, 'reasoning_enabled', False)
    monkeypatch.setattr(settings, 'vision', False)
    monkeypatch.setattr(settings, 'extra_body', {})


def complete(payload=None):
    captured = []
    payload = payload if payload is not None else {'schema': llm.compact_schema(AssistantPlan)}

    def respond(request):
        captured.append(json.loads(request.content))
        assert request.method == 'POST'
        assert request.url.path.endswith('/chat/completions')
        return httpx.Response(200, json={
            'choices': [{'finish_reason': 'stop', 'message': {
                'content': json.dumps(REPLY, ensure_ascii=False),
            }}],
        })

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
            result = await llm.complete_json('Верни JSON.', payload, client=transport)
            assert not transport.is_closed
            return result

    result = asyncio.run(run())
    assert result == REPLY
    assert len(captured) == 1
    return captured[0]


def test_openrouter_assistant_sends_strict_schema_without_changing_patch_semantics():
    schema = deepcopy(llm.compact_schema(AssistantPlan))
    original_schema = deepcopy(schema)
    body = complete({'schema': schema, 'allowed_slides': [1]})
    response_format = body['response_format']
    assert response_format['type'] == 'json_schema'
    contract = response_format['json_schema']
    assert contract['name'] == 'AssistantPlan'
    assert contract['strict'] is True
    assert contract['schema'] == original_schema
    assert schema == original_schema
    assert body['provider']['require_parameters'] is True
    assert body['max_tokens'] == settings.assistant_max_tokens

    sent_schema = contract['schema']
    assert sent_schema['additionalProperties'] is False
    assert set(sent_schema['required']) == {'summary'}
    patch_schema = sent_schema['$defs']['SlidePatch']
    assert patch_schema['additionalProperties'] is False
    assert set(patch_schema['required']) == {'slide'}
    for name in ('body', 'chart', 'design'):
        assert {'type': 'null'} in patch_schema['properties'][name]['anyOf']
    # An omitted field remains distinct from an explicit null that clears it.
    omitted = AssistantPlan.model_validate({'summary': 'Сохранить', 'changes': [{'slide': 1}]}).changes[0]
    cleared = AssistantPlan.model_validate({
        'summary': 'Очистить диаграмму', 'changes': [{'slide': 1, 'chart': None}],
    }).changes[0]
    assert 'chart' not in omitted.model_fields_set
    assert 'chart' in cleared.model_fields_set and cleared.chart is None


def test_strict_assistant_merges_provider_preferences_without_mutating_settings(monkeypatch):
    preferences = {
        'provider': {'order': ['example-provider'], 'allow_fallbacks': False, 'require_parameters': False},
        'reasoning': {'enabled': True},
        'top_p': 0.8,
    }
    original = deepcopy(preferences)
    monkeypatch.setattr(settings, 'extra_body', preferences)
    body = complete()
    assert body['provider'] == {
        'order': ['example-provider'], 'allow_fallbacks': False, 'require_parameters': True,
    }
    assert body['reasoning'] == {'enabled': True}
    assert body['top_p'] == 0.8
    assert settings.extra_body == original


def test_assistant_schema_can_be_disabled_without_changing_provider_preferences(monkeypatch):
    monkeypatch.setattr(settings, 'assistant_json_schema', False)
    monkeypatch.setattr(settings, 'extra_body', {'provider': {'allow_fallbacks': True}})
    body = complete()
    assert body['response_format'] == {'type': 'json_object'}
    assert body['provider'] == {'allow_fallbacks': True}


@pytest.mark.parametrize('base_url', [
    'https://api.example.test/v1',
    'http://127.0.0.1:8001/v1',
])
def test_other_hosts_keep_json_object_transport(monkeypatch, base_url):
    monkeypatch.setattr(settings, 'base_url', base_url)
    body = complete()
    assert body['response_format'] == {'type': 'json_object'}
    assert 'provider' not in body


@pytest.mark.parametrize('task', ['DeckContent', 'ThreeDesignPlans', 'ImagePromptTranslation', None])
def test_other_tasks_keep_json_object_transport(task):
    payload = {'schema': {'title': task, 'type': 'object'}} if task else {'source_chunks': []}
    body = complete(payload)
    assert body['response_format'] == {'type': 'json_object'}
    assert 'provider' not in body


def test_json_mode_off_does_not_force_response_format_or_provider_routing(monkeypatch):
    monkeypatch.setattr(settings, 'json_mode', False)
    body = complete()
    assert 'response_format' not in body
    assert 'provider' not in body
