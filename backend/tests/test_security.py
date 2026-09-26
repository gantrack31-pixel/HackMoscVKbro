"""Regression checks for private errors, browser isolation and model transport."""
import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services.llm import complete_json, LLMError


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'private.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'app_env', 'development')
    with TestClient(app) as client:
        yield client


def test_validation_never_echoes_credentials(client):
    secret = 'private-password-' * 12
    response = client.post('/api/auth/login', json={'email': 'private@example.test', 'password': secret})
    assert response.status_code == 422
    assert secret not in response.text and 'private@example.test' not in response.text
    assert 'input' not in response.text and 'ctx' not in response.text
    assert response.headers['cache-control'] == 'no-store'
    malformed = client.post('/api/auth/login', content='{"password":"private-material",',
                            headers={'Content-Type': 'application/json'})
    assert malformed.status_code == 422 and 'private-material' not in malformed.text


def test_security_headers_and_private_downloads(client, monkeypatch):
    response = client.get('/api/health')
    policy = response.headers['content-security-policy']
    assert "script-src 'self';" in policy and "connect-src 'self';" in policy
    assert "frame-ancestors 'none'" in policy and "object-src 'none'" in policy
    assert response.headers['permissions-policy'].endswith('fullscreen=(self)')
    assert 'strict-transport-security' not in response.headers
    monkeypatch.setattr(settings, 'app_env', 'production')
    assert client.get('/api/health').headers['strict-transport-security'] == 'max-age=31536000'
    for path in ['/api/projects/unknown/export/html', '/api/projects/unknown', '/api/jobs/unknown']:
        response = client.get(path)
        assert response.status_code == 401 and response.headers['cache-control'] == 'no-store'
    for path in ['/.env', '/backend/.env', '/data/deckly.sqlite3', '/backend/data/deckly.sqlite3']:
        assert client.get(path).status_code == 404


@pytest.mark.parametrize('url', ['http://model.example/v1', 'https://model.example/v1#private-key'])
def test_model_rejects_unsafe_transport_before_sending_data(monkeypatch, url):
    monkeypatch.setattr(settings, 'base_url', url)
    monkeypatch.setattr(settings, 'api_key', 'test-private-key')
    calls = []

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: calls.append(request))) as client:
            with pytest.raises(LLMError):
                await complete_json('system', {'materials': 'private text'}, client)
    asyncio.run(run())
    assert calls == []
