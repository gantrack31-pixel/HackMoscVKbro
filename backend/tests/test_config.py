"""Публичная конфигурация проверяется до запуска сервера и БД."""
from dataclasses import replace

import pytest

from app.config import Settings, validate_settings


def production_settings(**overrides):
    values = {
        'app_env': 'production',
        'mode': 'live',
        'api_key': 'test-provider-key',
        'public_url': 'https://deckly.example',
        'cookie_secure': True,
        'origins': ['https://deckly.example', 'https://www.deckly.example'],
    }
    values.update(overrides)
    return replace(Settings(), **values)


def test_development_profile_keeps_local_demo_defaults():
    config = Settings(app_env='development')

    validate_settings(config)

    assert config.mode == 'demo'
    assert config.cookie_secure is False


def test_production_profile_accepts_secure_live_configuration():
    validate_settings(production_settings())


@pytest.mark.parametrize('overrides', [
    {'public_url': 'http://deckly.example'},
    {'cookie_secure': False},
    {'origins': []},
    {'origins': ['http://deckly.example']},
    {'origins': ['https://localhost:5173']},
    {'origins': ['*']},
])
def test_production_profile_rejects_insecure_or_incomplete_web_settings(overrides):
    with pytest.raises(ValueError):
        validate_settings(production_settings(**overrides))


def test_production_profile_requires_explicit_demo_opt_in():
    with pytest.raises(ValueError, match='demo'):
        validate_settings(production_settings(mode='demo'))

    validate_settings(production_settings(mode='demo', allow_demo_in_production=True))


def test_live_production_requires_provider_api_key():
    with pytest.raises(ValueError, match='LLM_API_KEY'):
        validate_settings(production_settings(api_key=''))


def test_yandex_oauth_must_use_public_https_origin_when_enabled():
    config = production_settings(
        yandex_id='public-client-id',
        yandex_redirect='https://deckly.example/api/auth/yandex/callback',
    )
    validate_settings(config)

    with pytest.raises(ValueError, match='YANDEX_REDIRECT_URI'):
        validate_settings(replace(config, yandex_redirect='http://deckly.example/api/auth/yandex/callback'))

    with pytest.raises(ValueError, match='YANDEX_REDIRECT_URI'):
        validate_settings(replace(config, yandex_redirect='https://other.example/api/auth/yandex/callback'))


def test_production_startup_validation_runs_before_database_init(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app import database
    from app.config import settings
    from app.main import app

    monkeypatch.setattr(settings, 'app_env', 'production')
    monkeypatch.setattr(settings, 'public_url', 'http://deckly.example')
    monkeypatch.setattr(settings, 'origins', ['https://deckly.example'])
    monkeypatch.setattr(settings, 'cookie_secure', True)
    monkeypatch.setattr(settings, 'mode', 'live')
    monkeypatch.setattr(settings, 'api_key', 'provider-key')
    monkeypatch.setattr(settings, 'database', tmp_path / 'not-created.sqlite3')
    initialized = False

    def mark_initialized():
        nonlocal initialized
        initialized = True

    monkeypatch.setattr(database, 'initialize', mark_initialized)

    with pytest.raises(ValueError, match='PUBLIC_BASE_URL'):
        with TestClient(app):
            pass

    assert not initialized
    assert not (tmp_path / 'not-created.sqlite3').exists()


def test_secure_cookie_setting_applies_to_session_and_yandex_oauth(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import app

    monkeypatch.setattr(settings, 'database', tmp_path / 'cookies.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'storage')
    monkeypatch.setattr(settings, 'cookie_secure', True)
    monkeypatch.setattr(settings, 'yandex_id', 'public-client-id')

    with TestClient(app) as client:
        session = client.post('/api/auth/register', json={
            'email': 'cookie@example.test',
            'password': 'Example-Password-1947',
            'first_name': 'Test',
            'last_name': 'Cookie',
        })
        assert session.status_code == 201
        assert 'deckly_session=' in session.headers['set-cookie']
        assert 'secure' in session.headers['set-cookie'].lower()

        oauth = client.get('/api/auth/yandex/start', follow_redirects=False)
        assert oauth.status_code == 302
        oauth_cookie = next(cookie for cookie in oauth.headers.get_list('set-cookie') if 'deckly_oauth=' in cookie)
        assert 'secure' in oauth_cookie.lower()