"""Support contact messages are authenticated, validated, rate-limited and delivered safely."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def support_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'support.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'storage')
    monkeypatch.setattr(settings, 'smtp_host', 'smtp.example.test')
    monkeypatch.setattr(settings, 'smtp_username', 'sender@example.test')
    monkeypatch.setattr(settings, 'smtp_password', 'test-password')
    monkeypatch.setattr(settings, 'email_from', 'support@example.test')
    monkeypatch.setattr(settings, 'email_verification_required', False)
    monkeypatch.setattr(settings, 'support_rate_limit', 3)
    monkeypatch.setattr(settings, 'support_to', '')
    deliveries = []

    def capture(email, message, user):
        deliveries.append((email, message, user['email']))

    monkeypatch.setattr('app.main.deliver_support_message', capture)
    with TestClient(app) as client:
        registered = client.post('/api/auth/register', json={
            'email': 'customer@example.test',
            'password': 'Example-password-387',
            'first_name': 'Анна',
            'last_name': 'Тестовая',
        })
        assert registered.status_code == 201
        client.headers['X-CSRF-Token'] = registered.json()['csrf']
        yield client, deliveries


def payload(**overrides):
    return {
        'email': 'reply@example.test',
        'message': 'Не удаётся сохранить презентацию.',
        **overrides,
    }


def test_support_message_is_delivered_to_configured_sender(support_client):
    client, deliveries = support_client

    response = client.post('/api/support/messages', json=payload())

    assert response.status_code == 202
    assert response.json() == {'sent': True}
    assert deliveries == [(
        'reply@example.test',
        'Не удаётся сохранить презентацию.',
        'customer@example.test',
    )]


def test_support_message_requires_login_and_csrf(support_client):
    client, deliveries = support_client

    client.headers.pop('X-CSRF-Token')
    assert client.post('/api/support/messages', json=payload()).status_code == 403
    assert deliveries == []

    client.headers['X-CSRF-Token'] = client.get('/api/auth/me').json()['csrf']
    client.post('/api/auth/logout')
    assert client.post('/api/support/messages', json=payload()).status_code == 401
    assert deliveries == []


def test_support_message_rejects_invalid_email_and_short_or_oversized_message(support_client):
    client, deliveries = support_client

    assert client.post('/api/support/messages', json=payload(email='not-an-email')).status_code == 422
    assert client.post('/api/support/messages', json=payload(message='   short   ')).status_code == 422
    assert client.post('/api/support/messages', json=payload(message='x' * 4001)).status_code == 422
    assert deliveries == []


def test_support_message_rate_limit_applies_to_account(support_client):
    client, deliveries = support_client

    for _ in range(3):
        assert client.post('/api/support/messages', json=payload()).status_code == 202

    limited = client.post('/api/support/messages', json=payload())
    assert limited.status_code == 429
    assert len(deliveries) == 3


def test_support_message_delivery_failure_does_not_claim_success(support_client, monkeypatch):
    client, _ = support_client

    def fail_delivery(*_args):
        raise OSError('SMTP is unavailable')

    monkeypatch.setattr('app.main.deliver_support_message', fail_delivery)
    response = client.post('/api/support/messages', json=payload())

    assert response.status_code == 503
    assert response.json()['detail'] == 'Не удалось отправить сообщение. Попробуйте позже.'


def test_support_delivery_requires_complete_smtp_configuration(monkeypatch):
    from app.main import deliver_support_message

    monkeypatch.setattr(settings, 'smtp_host', '')
    monkeypatch.setattr(settings, 'smtp_username', '')
    monkeypatch.setattr(settings, 'smtp_password', '')
    monkeypatch.setattr(settings, 'email_from', '')

    with pytest.raises(RuntimeError, match='SMTP для обращений'):
        deliver_support_message(
            'reply@example.test', 'Не удаётся сохранить презентацию.',
            {'email': 'customer@example.test', 'first_name': 'Анна', 'last_name': 'Тестовая'},
        )


def test_failed_deliveries_do_not_exhaust_long_quota_but_have_burst_protection(support_client,monkeypatch):
    client,_=support_client
    def fail(*args): raise OSError('provider-secret-not-for-user')
    monkeypatch.setattr('app.main.deliver_support_message',fail)
    for _ in range(10):
        response=client.post('/api/support/messages',json=payload())
        assert response.status_code==503 and 'provider-secret' not in response.text
    assert client.post('/api/support/messages',json=payload()).status_code==429


def test_starttls_sender_reply_recipient_and_refusal(monkeypatch):
    import smtplib
    from app.main import deliver_support_message
    for key,value in {'smtp_host':'smtp.example.test','smtp_port':587,'smtp_security':'auto',
                      'smtp_username':'sender@example.test','smtp_password':'test','email_from':'sender@example.test',
                      'support_to':'help@example.test'}.items(): monkeypatch.setattr(settings,key,value)
    events=[]
    class SMTP:
        def __enter__(self): return self
        def __exit__(self,*args): return False
        def ehlo(self): events.append('ehlo')
        def starttls(self,context):
            assert context.check_hostname
            events.append('tls')
        def login(self,*args): events.append('login')
        def send_message(self,message):
            assert message['From']=='sender@example.test' and message['To']=='help@example.test'
            assert message['Reply-To']=='reply@example.test'
            return {'help@example.test':(550,b'refused')}
    monkeypatch.setattr('app.main.smtplib.SMTP',lambda *args,**kwargs:SMTP())
    with pytest.raises(smtplib.SMTPRecipientsRefused):
        deliver_support_message('reply@example.test','Question about export',{'email':'account@example.test','first_name':'Test','last_name':'User'})
    assert events==['ehlo','tls','ehlo','login']


def test_support_email_uses_configured_recipient_and_reply_to(monkeypatch):
    from app.main import deliver_support_message

    captured = {}

    class FakeSMTP:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def login(self, username, password):
            captured['login'] = (username, password)

        def send_message(self, message):
            captured['message'] = message

    monkeypatch.setattr(settings, 'smtp_host', 'smtp.example.test')
    monkeypatch.setattr(settings, 'smtp_port', 465)
    monkeypatch.setattr(settings, 'smtp_security', 'ssl')
    monkeypatch.setattr(settings, 'support_to', '')
    monkeypatch.setattr(settings, 'smtp_username', 'sender@example.test')
    monkeypatch.setattr(settings, 'smtp_password', 'server-secret')
    monkeypatch.setattr(settings, 'email_from', 'support@example.test')
    monkeypatch.setattr('app.main.smtplib.SMTP_SSL', lambda *args, **kwargs: FakeSMTP())

    deliver_support_message(
        'reply@example.test', 'Не удаётся сохранить презентацию.',
        {'email': 'customer@example.test', 'first_name': 'Анна', 'last_name': 'Тестовая'},
    )

    assert captured['login'] == ('sender@example.test', 'server-secret')
    assert captured['message']['To'] == 'support@example.test'
    assert captured['message']['Reply-To'] == 'reply@example.test'
    assert 'Не удаётся сохранить презентацию.' in captured['message'].get_content()
