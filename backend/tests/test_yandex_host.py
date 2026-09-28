from urllib.parse import parse_qs, urlparse
from test_workflow import client


def test_yandex_callback_returns_to_the_host_used_to_start_oauth(client, monkeypatch):
    monkeypatch.setattr(__import__('app.config', fromlist=['settings']).settings, 'yandex_id', 'test-client')
    client.base_url = 'http://localhost:8000'
    start = client.get('/api/auth/yandex/start', follow_redirects=False)
    query = parse_qs(urlparse(start.headers['location']).query)
    callback = client.get('/api/auth/yandex/callback', params={'state': query['state'][0], 'error': 'access_denied'}, follow_redirects=False)
    assert callback.status_code == 302
    assert callback.headers['location'].startswith('http://localhost:8000/#auth-error=cancelled')


def test_yandex_callback_uses_configured_public_host_in_production(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'app_env', 'production')
    monkeypatch.setattr(settings, 'public_url', 'https://deckly.example')
    monkeypatch.setattr(settings, 'yandex_id', 'test-client')
    client.base_url = 'http://localhost:8000'
    start = client.get('/api/auth/yandex/start', follow_redirects=False)
    query = parse_qs(urlparse(start.headers['location']).query)
    callback = client.get('/api/auth/yandex/callback', params={'state': query['state'][0], 'error': 'access_denied'}, follow_redirects=False)
    assert callback.headers['location'].startswith('https://deckly.example/#auth-error=cancelled')
