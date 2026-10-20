"""Malformed model replies must recover once or leave a clean, unchanged draft."""
from copy import deepcopy

import pytest

from app import database as db
from app.services import llm
from test_assistant import client, request_for  # noqa: F401 - shared pytest fixture


def assert_no_proposal_or_saved_changes(original):
    assert db.project_get('ai-test') == original
    with db.connection() as conn:
        assert conn.execute('SELECT COUNT(*) FROM assistant_proposals').fetchone()[0] == 0


def assert_friendly_format_error(response):
    assert response.status_code == 502, response.text
    detail = response.json()['detail']
    assert 'формат' in detail
    assert 'черновик не изменён' in detail
    assert len(detail) < 250
    for technical in ('ValidationError', 'AssistantPlan', 'input_value', 'input_type',
                      'errors.pydantic.dev', 'Field required', 'PRIVATE_MODEL_DETAIL'):
        assert technical not in detail


@pytest.mark.parametrize('action', ['edit', 'repair'])
def test_flat_reply_is_corrected_once_into_a_reviewable_proposal(client, monkeypatch, action):
    original = deepcopy(db.project_get('ai-test'))
    body = request_for(client, action=action)
    body['content']['slides'][0].update(title='Пилот', body='Пилот охватил 30 участников. Подробный комментарий.')
    malformed = {'/': 'PRIVATE_MODEL_DETAIL', 'body': '30 участников.', 'bullets': []}
    calls = []

    async def answer(system, payload):
        calls.append(deepcopy(payload))
        if len(calls) == 1:
            return deepcopy(malformed)
        assert payload['pass'] == 2
        assert payload['previous_draft'] == malformed
        assert payload['presentation']['slides'][0]['body'] == body['content']['slides'][0]['body']
        correction = payload['format_correction']
        assert 'summary' in correction
        assert 'body' in correction
        assert 'PRIVATE_MODEL_DETAIL' not in correction
        assert 'input_value' not in correction
        assert 'errors.pydantic.dev' not in correction
        return {'summary': 'Предлагаю сократить текст.', 'changes': [{'slide': 0, 'body': '30 участников.'}]}

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=body)
    assert response.status_code == 200, response.text
    assert len(calls) == 2
    assert calls[0]['pass'] == 1
    assert 'previous_draft' not in calls[0]
    example = calls[0]['response_example']
    assert example['summary'] and example['changes'][0]['slide'] == 0
    assert response.json()['project'] is None
    proposal = response.json()['proposal']
    assert proposal
    assert any(change['field'] == 'body' and change['after'] == '30 участников.'
               for change in proposal['changes'])
    # A successful retry still awaits the user's explicit apply action.
    assert db.project_get('ai-test') == original
    with db.connection() as conn:
        assert conn.execute('SELECT COUNT(*) FROM assistant_proposals').fetchone()[0] == 1


def test_repeated_flat_reply_stops_after_two_calls_without_technical_error(client, monkeypatch):
    original = deepcopy(db.project_get('ai-test'))
    calls = []

    async def answer(system, payload):
        calls.append(deepcopy(payload))
        return {'/': 'PRIVATE_MODEL_DETAIL', 'body': 'PRIVATE_MODEL_DETAIL', 'bullets': []}

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=request_for(client))
    assert_friendly_format_error(response)
    assert len(calls) == 2
    assert_no_proposal_or_saved_changes(original)


def test_response_example_uses_the_selected_slide_index(client, monkeypatch):
    original = deepcopy(db.project_get('ai-test'))
    calls = []

    async def answer(system, payload):
        calls.append(deepcopy(payload))
        assert payload['allowed_slides'] == [1]
        assert payload['response_example']['changes'][0]['slide'] == 1
        return {'summary': 'Предлагаю уточнить заголовок.', 'changes': [{'slide': 1, 'title': 'Результат пилота'}]}

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=request_for(client, slide=1))
    assert response.status_code == 200, response.text
    assert len(calls) == 1
    assert response.json()['changed_slides'] == [1]
    assert response.json()['proposal']['slide'] == 1
    assert db.project_get('ai-test') == original


@pytest.mark.parametrize('reply', [
    {'summary': 'Правка', 'body': 'PRIVATE_MODEL_DETAIL', 'changes': []},
    {'summary': 'Правка', 'changes': [{'slide': 0, 'unexpected': 'PRIVATE_MODEL_DETAIL'}]},
    {'summary': 'Правка', 'changes': [{'slide': 1, 'body': 'Не разрешено'}]},
])
def test_retry_does_not_relax_unknown_fields_or_slide_scope(client, monkeypatch, reply):
    original = deepcopy(db.project_get('ai-test'))
    calls = 0

    async def answer(system, payload):
        nonlocal calls
        calls += 1
        return deepcopy(reply)

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=request_for(client))
    assert response.status_code == 502, response.text
    assert calls == 2
    assert 'PRIVATE_MODEL_DETAIL' not in response.json()['detail']
    assert 'input_value' not in response.json()['detail']
    assert_no_proposal_or_saved_changes(original)


def test_malformed_json_error_is_retried_and_never_exposed(client, monkeypatch):
    original = deepcopy(db.project_get('ai-test'))
    calls = 0

    async def answer(system, payload):
        nonlocal calls
        calls += 1
        if calls == 2:
            assert payload['pass'] == 2
            assert 'previous_draft' not in payload
        raise llm.LLMFormatError('PRIVATE_MODEL_DETAIL: malformed provider JSON')

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=request_for(client))
    assert_friendly_format_error(response)
    assert calls == 2
    assert_no_proposal_or_saved_changes(original)


def test_oversized_invalid_reply_is_not_replayed_to_the_model(client, monkeypatch):
    original = deepcopy(db.project_get('ai-test'))
    calls = 0

    async def answer(system, payload):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {'summary': 'Правка', 'unexpected': 'x' * 160001}
        assert payload['pass'] == 2
        assert 'previous_draft' not in payload
        assert len(payload['format_correction']) < 8000
        return {'summary': 'Изменения не нужны.', 'changes': []}

    monkeypatch.setattr(llm, 'complete_json', answer)
    response = client.post('/api/projects/ai-test/assistant', json=request_for(client))
    assert response.status_code == 200, response.text
    assert calls == 2
    assert response.json()['proposal'] is None
    assert response.json()['changed_slides'] == []
    assert_no_proposal_or_saved_changes(original)
