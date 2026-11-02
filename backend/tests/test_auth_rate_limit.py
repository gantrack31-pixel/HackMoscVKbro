"""Auth attempts are limited per visitor, not per reverse proxy, and successful sign-ins are free."""
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

PASSWORD = 'Example-password-387'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'auth.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'storage')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'email_verification_required', False, raising=False)
    monkeypatch.setattr(settings, 'trusted_proxy_hops', 1)
    with TestClient(app) as client:
        assert client.post('/api/auth/register', json={
            'email': 'user@example.test', 'password': PASSWORD, 'first_name': 'Анна', 'last_name': 'Тестовая',
        }, headers={'X-Forwarded-For': '198.51.100.1'}).status_code == 201
        yield client


def login(client, ip, password=PASSWORD):
    return client.post('/api/auth/login', json={'email': 'user@example.test', 'password': password},
                       headers={'X-Forwarded-For': ip})


def test_successful_logins_do_not_consume_the_limit(client):
    assert all(login(client, '198.51.100.2').status_code == 200 for _ in range(20))


def test_failed_logins_are_limited_per_forwarded_ip(client):
    for _ in range(15):
        assert login(client, '198.51.100.3', 'Wrong-password-000').status_code == 401
    assert login(client, '198.51.100.3').status_code == 429
    # Another visitor behind the same proxy is not affected.
    assert login(client, '198.51.100.4').status_code == 200


def test_client_supplied_forwarded_entries_are_ignored(client):
    for i in range(15):
        login(client, f'203.0.113.{i}, 198.51.100.5', 'Wrong-password-000')
    assert login(client, '203.0.113.99, 198.51.100.5').status_code == 429
