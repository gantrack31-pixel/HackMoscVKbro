"""Email confirmation is one-time, expiring, and does not create a session early."""
from urllib.parse import urlparse, parse_qs

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app import database as db
from app.auth import (
    build_verification_email,
    deliver_verification_email as real_deliver_verification_email,
    digest,
)


@pytest.fixture
def verification_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'verification.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'storage')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'email_verification_required', True, raising=False)
    sent = []
    def capture(email, url):
        sent.append((email, url))
        return 'sent'
    monkeypatch.setattr('app.auth.deliver_verification_email', capture)
    with TestClient(app) as client:
        yield client, sent


def register(client, email='new@example.test'):
    return client.post('/api/auth/register', json={
        'email': email,
        'password': 'Example-password-387',
        'first_name': 'Анна',
        'last_name': 'Тестовая',
    })


def test_verification_email_has_branded_html_and_plain_text_fallback():
    url = 'https://deckly.example/#verify-email=abc&source=<test>'

    message = build_verification_email('person@example.test', url)

    assert message['Subject'] == 'Подтвердите адрес электронной почты — Deckly.Ai'
    assert message['To'] == 'person@example.test'
    assert message.is_multipart()
    plain = message.get_body(preferencelist=('plain',)).get_content()
    html = message.get_body(preferencelist=('html',)).get_content()
    assert url in plain
    assert '24 часа' in plain
    assert 'Если вы не создавали аккаунт Deckly.Ai' in plain
    assert 'Deckly.Ai' in html
    assert 'Подтвердить почту' in html
    assert 'background-color:#0f172a' in html
    assert 'href="https://deckly.example/#verify-email=abc&amp;source=&lt;test&gt;"' in html
    assert 'Если вы не создавали аккаунт Deckly.Ai' in html


def test_registration_requires_email_confirmation_before_login(verification_client):
    client, sent = verification_client

    response = register(client)

    assert response.status_code == 201
    assert response.json()['verification_required'] is True
    assert response.json()['email'] == 'new@example.test'
    assert response.json()['delivery_pending'] is False
    assert client.get('/api/auth/me').json()['user'] is None
    assert client.post('/api/auth/login', json={
        'email': 'new@example.test', 'password': 'Example-password-387'
    }).status_code == 403
    assert len(sent) == 1


def test_development_without_smtp_does_not_log_or_return_confirmation_token(verification_client, caplog, monkeypatch):
    monkeypatch.setattr(settings, 'smtp_host', '')
    monkeypatch.setattr(settings, 'smtp_username', '')
    monkeypatch.setattr(settings, 'smtp_password', '')
    monkeypatch.setattr(settings, 'email_from', '')

    result = real_deliver_verification_email(
        'new@example.test', 'http://localhost/#verify-email=super-secret-token'
    )

    assert result == 'unavailable'
    assert 'super-secret-token' not in caplog.text


def test_confirmation_link_is_one_time_and_enables_login(verification_client):
    client, sent = verification_client
    register(client)
    url = sent[0][1]
    token = parse_qs(urlparse(url).fragment)['verify-email'][0]

    confirmed = client.post('/api/auth/verify-email', json={'token': token})

    assert confirmed.status_code == 200
    assert confirmed.json()['verified'] is True
    assert client.post('/api/auth/verify-email', json={'token': token}).status_code == 400
    login = client.post('/api/auth/login', json={
        'email': 'new@example.test', 'password': 'Example-password-387'
    })
    assert login.status_code == 200
    assert login.json()['user']['email_verified'] is True


def test_expired_confirmation_token_is_rejected(verification_client):
    client, sent = verification_client
    register(client)
    token = parse_qs(urlparse(sent[0][1]).fragment)['verify-email'][0]
    with db.connection() as connection:
        connection.execute('UPDATE email_verifications SET expires_at=0')

    assert client.post('/api/auth/verify-email', json={'token': token}).status_code == 400


def test_confirmation_token_consumption_is_rate_limited(verification_client):
    client, sent = verification_client
    register(client)
    token = parse_qs(urlparse(sent[0][1]).fragment)['verify-email'][0]
    with db.connection() as connection:
        connection.executemany(
            'INSERT INTO auth_attempts (ip_hash,time) VALUES (?,?)',
            [(digest('testclient'), 9999999999)] * 15,
        )

    response = client.post('/api/auth/verify-email', json={'token': token})

    assert response.status_code == 429
    with db.connection() as connection:
        user = connection.execute('SELECT email_verified FROM users WHERE email=?', ('new@example.test',)).fetchone()
    assert user['email_verified'] == 0


def test_resend_is_generic_and_replaces_previous_token(verification_client):
    client, sent = verification_client
    register(client)
    old_token = parse_qs(urlparse(sent[0][1]).fragment)['verify-email'][0]
    with db.connection() as connection:
        connection.execute('UPDATE email_verifications SET last_sent_at=0')

    response = client.post('/api/auth/verification/resend', json={'email': 'new@example.test'})

    assert response.status_code == 200
    assert response.json()['ok'] is True
    assert len(sent) == 2
    new_token = parse_qs(urlparse(sent[1][1]).fragment)['verify-email'][0]
    assert client.post('/api/auth/verify-email', json={'token': old_token}).status_code == 400
    assert client.post('/api/auth/verify-email', json={'token': new_token}).status_code == 200
    assert client.post('/api/auth/verification/resend', json={'email': 'unknown@example.test'}).json() == response.json()


def test_legacy_account_without_verification_field_remains_verified(verification_client):
    client, _ = verification_client
    with db.connection() as connection:
        connection.execute('''INSERT INTO users
          (id,email,first_name,last_name,password_hash,yandex_id,created_at)
          VALUES ('legacy','legacy@example.test','Old','User',NULL,'yandex-legacy','2020-01-01')''')

    with db.connection() as connection:
        user = connection.execute('SELECT email_verified FROM users WHERE id=?', ('legacy',)).fetchone()
    assert user['email_verified'] == 1


def test_resend_is_rate_limited_per_email(verification_client):
    client, sent = verification_client
    register(client)

    first = client.post('/api/auth/verification/resend', json={'email': 'new@example.test'})
    second = client.post('/api/auth/verification/resend', json={'email': 'new@example.test'})

    assert first.json() == second.json() == {'ok': True}
    assert len(sent) == 1


def test_delivery_failure_keeps_account_pending_and_allows_retry(verification_client, monkeypatch):
    client, sent = verification_client
    register(client)
    monkeypatch.setattr('app.auth.deliver_verification_email', lambda email, url: (_ for _ in ()).throw(OSError('SMTP offline')))

    retry = client.post('/api/auth/verification/resend', json={'email': 'new@example.test'})

    assert retry.status_code == 200
    assert client.post('/api/auth/login', json={
        'email': 'new@example.test', 'password': 'Example-password-387'
    }).status_code == 403


def test_delivery_failure_does_not_log_exception_text_or_bearer_token(verification_client, caplog, monkeypatch):
    client, _ = verification_client
    token = 'private-email-confirmation-token'
    monkeypatch.setattr(
        'app.auth.deliver_verification_email',
        lambda *_: (_ for _ in ()).throw(OSError(f'failed while sending {token}')),
    )

    response = register(client)

    assert response.status_code == 201
    assert token not in caplog.text
    assert 'failed while sending' not in caplog.text