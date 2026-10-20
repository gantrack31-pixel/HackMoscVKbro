import asyncio
import logging

import httpx
import pytest

from app.config import settings
from app.services import llm

ADMIN_HINTS = ('HTTP', '.env', 'LLM_', 'URI', 'URL', 'JSON', 'ключ', 'провайдер')


def configure(monkeypatch):
    monkeypatch.setattr(settings, 'api_key', 'test-key')
    monkeypatch.setattr(settings, 'model', 'test-model')
    monkeypatch.setattr(settings, 'base_url', 'https://model.example/v1')
    monkeypatch.setattr(settings, 'stream', False)


def call(status, monkeypatch, message='upstream overloaded for test-key'):
    configure(monkeypatch)
    transport = httpx.MockTransport(lambda request: httpx.Response(status, json={'error': {'message': message}}))

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await llm.complete_json('system', {'task': 'x'}, client=client)
    with pytest.raises(llm.LLMError) as error:
        asyncio.run(run())
    return str(error.value)


@pytest.mark.parametrize('status,expected', [
    (429, 'перегружен'), (500, 'временно недоступен'), (502, 'временно недоступен'),
    (503, 'временно недоступен'), (401, 'поддержку'), (403, 'поддержку'), (404, 'поддержку')])
def test_user_message_has_no_admin_hints(status, expected, monkeypatch):
    text = call(status, monkeypatch)
    assert expected in text
    assert not any(hint.lower() in text.lower() for hint in ADMIN_HINTS), text
    assert 'test-key' not in text


def test_technical_details_go_to_log_without_key(monkeypatch, caplog):
    with caplog.at_level(logging.WARNING, logger='app.services.llm'):
        call(503, monkeypatch)
    logged = caplog.text
    assert 'provider HTTP 503' in logged and 'upstream overloaded' in logged
    assert 'test-key' not in logged and 'redacted' in logged


def test_connection_failure_is_user_friendly_and_logged(monkeypatch, caplog):
    configure(monkeypatch)

    def refuse(request):
        raise httpx.ConnectError('refused', request=request)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(refuse)) as client:
            return await llm.complete_json('system', {'task': 'x'}, client=client)
    with caplog.at_level(logging.WARNING, logger='app.services.llm'), pytest.raises(llm.LLMError) as error:
        asyncio.run(run())
    assert str(error.value) == llm.PROVIDER_UNAVAILABLE
    assert 'connection failed' in caplog.text
