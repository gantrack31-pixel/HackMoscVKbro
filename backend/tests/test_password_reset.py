"""Password recovery uses private, one-time tokens and invalidates old sessions."""
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import database as db
from app.auth import (
    build_password_reset_email,
    deliver_password_reset_email,
    digest,
    password_hash,
    password_valid,
)
from app.config import settings
from app.main import app


@pytest.fixture
def reset_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "password-reset.sqlite3")
    monkeypatch.setattr(settings, "storage", tmp_path / "storage")
    monkeypatch.setattr(settings, "mode", "demo")
    monkeypatch.setattr(settings, "email_verification_required", True, raising=False)
    monkeypatch.setattr(settings, "public_url", "http://127.0.0.1:8000")
    deliveries = []
    monkeypatch.setattr("app.auth.deliver_verification_email", lambda email, url: "sent")
    monkeypatch.setattr(
        "app.auth.deliver_password_reset_email",
        lambda email, url: deliveries.append((email, url)) or "sent",
        raising=False,
    )
    with TestClient(app) as client:
        yield client, deliveries


def add_account(email="recover@example.test", password="Original-password-387"):
    user_id = "recovery-user-1"
    with db.connection() as connection:
        connection.execute(
            """INSERT INTO users
            (id,email,first_name,last_name,password_hash,yandex_id,created_at,email_verified)
            VALUES (?,?,?,?,?,?,?,1)""",
            (user_id, email, "Анна", "Тестовая", password_hash(password), None, db.now()),
        )
    return user_id


def request_reset(client, email="recover@example.test"):
    return client.post("/api/auth/password-reset/request", json={"email": email})


def token_from(deliveries):
    return parse_qs(urlparse(deliveries[-1][1]).fragment)["reset-password"][0]


def test_password_reset_email_has_plain_text_and_html_with_short_lived_link(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "email_from", "sender@example.test")
    message = build_password_reset_email(
        "person@example.test", "https://deckly.example/#reset-password=one-time-token"
    )

    assert message["To"] == "person@example.test"
    assert "Сброс пароля" in message["Subject"]
    assert message.is_multipart()
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert "1 час" in plain
    assert "Если вы не запрашивали сброс" in plain
    assert "Сбросить пароль" in html
    assert "one-time-token" in html


def test_password_reset_email_uses_configured_smtp_transport(monkeypatch):
    from app.config import settings

    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            captured["connection"] = (host, port, timeout)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def login(self, username, password):
            captured["credentials"] = (username, password)

        def send_message(self, message):
            captured["message"] = message

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_port", 465)
    monkeypatch.setattr(settings, "smtp_username", "sender@example.test")
    monkeypatch.setattr(settings, "smtp_password", "smtp-test-password")
    monkeypatch.setattr(settings, "email_from", "sender@example.test")
    monkeypatch.setattr("app.auth.smtplib.SMTP_SSL", FakeSMTP)

    delivered = deliver_password_reset_email("person@example.test", "https://deckly.test/#reset-password=test-token")

    assert delivered == "sent"
    assert captured["connection"] == ("smtp.example.test", 465, 15)
    assert captured["credentials"] == ("sender@example.test", "smtp-test-password")
    assert captured["message"]["To"] == "person@example.test"


def test_new_reset_link_replaces_previous_token_after_cooldown(reset_client):
    client, deliveries = reset_client
    add_account()
    request_reset(client)
    old_token = token_from(deliveries)
    with db.connection() as connection:
        connection.execute("UPDATE password_resets SET last_sent_at=0")

    request_reset(client)
    new_token = token_from(deliveries)

    assert len(deliveries) == 2
    assert old_token != new_token
    assert client.post(
        "/api/auth/password-reset/confirm",
        json={"token": old_token, "password": "Replacement-password-531"},
    ).status_code == 400
    assert client.post(
        "/api/auth/password-reset/confirm",
        json={"token": new_token, "password": "Replacement-password-531"},
    ).status_code == 200


def test_reset_request_is_generic_and_only_sends_for_verified_password_account(reset_client):
    client, deliveries = reset_client
    add_account()

    known = request_reset(client)
    unknown = request_reset(client, "absent@example.test")

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json() == {"ok": True}
    assert [email for email, _ in deliveries] == ["recover@example.test"]


def test_reset_token_is_hashed_in_database_and_one_time(reset_client):
    client, deliveries = reset_client
    add_account()
    request_reset(client)
    token = token_from(deliveries)

    with db.connection() as connection:
        row = connection.execute("SELECT token_hash FROM password_resets").fetchone()
    assert row["token_hash"] == digest(token)
    assert token not in row["token_hash"]

    changed = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "password": "Replacement-password-531"},
    )
    repeated = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "password": "Another-password-531"},
    )

    assert changed.status_code == 200
    assert repeated.status_code == 400
    with db.connection() as connection:
        user = connection.execute("SELECT password_hash FROM users WHERE id=?", ("recovery-user-1",)).fetchone()
    assert password_valid("Replacement-password-531", user["password_hash"])


def test_invalid_and_expired_reset_tokens_do_not_change_password(reset_client):
    client, deliveries = reset_client
    add_account()
    request_reset(client)
    token = token_from(deliveries)
    with db.connection() as connection:
        connection.execute("UPDATE password_resets SET expires_at=0")

    expired = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "password": "Replacement-password-531"},
    )
    invalid = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": "x" * 48, "password": "Replacement-password-531"},
    )

    assert expired.status_code == invalid.status_code == 400
    with db.connection() as connection:
        user = connection.execute("SELECT password_hash FROM users WHERE id=?", ("recovery-user-1",)).fetchone()
    assert password_valid("Original-password-387", user["password_hash"])


def test_password_reset_invalidates_all_existing_sessions(reset_client):
    client, deliveries = reset_client
    add_account()
    first_session = client.post(
        "/api/auth/login", json={"email": "recover@example.test", "password": "Original-password-387"}
    )
    second_client = TestClient(app)
    second_session = second_client.post(
        "/api/auth/login", json={"email": "recover@example.test", "password": "Original-password-387"}
    )
    assert first_session.status_code == second_session.status_code == 200
    request_reset(client)
    token = token_from(deliveries)

    changed = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "password": "Replacement-password-531"},
    )

    assert changed.status_code == 200
    assert client.get("/api/auth/me").json()["user"] is None
    assert second_client.get("/api/auth/me").json()["user"] is None
    assert client.post(
        "/api/auth/login", json={"email": "recover@example.test", "password": "Original-password-387"}
    ).status_code == 401
    assert client.post(
        "/api/auth/login", json={"email": "recover@example.test", "password": "Replacement-password-531"}
    ).status_code == 200
    second_client.close()


def test_reset_request_is_rate_limited_per_ip(reset_client):
    client, deliveries = reset_client

    responses = [request_reset(client, f"person-{index}@example.test") for index in range(16)]

    assert all(response.json() == {"ok": True} for response in responses[:15])
    assert responses[-1].status_code == 429
    assert deliveries == []


def test_reset_email_cooldown_is_generic_and_preserves_current_token(reset_client):
    client, deliveries = reset_client
    add_account()
    request_reset(client)
    token = token_from(deliveries)

    second = request_reset(client)

    assert second.status_code == 200
    assert second.json() == {"ok": True}
    assert len(deliveries) == 1
    assert token_from(deliveries) == token


def test_reset_token_consumption_is_rate_limited(reset_client):
    client, deliveries = reset_client
    add_account()
    request_reset(client)
    token = token_from(deliveries)
    with db.connection() as connection:
        connection.executemany(
            "INSERT INTO auth_attempts (ip_hash,time) VALUES (?,?)",
            [(digest("testclient"), 9999999999)] * 15,
        )

    response = client.post(
        "/api/auth/password-reset/confirm",
        json={"token": token, "password": "Replacement-password-531"},
    )

    assert response.status_code == 429
    with db.connection() as connection:
        user = connection.execute("SELECT password_hash FROM users WHERE id=?", ("recovery-user-1",)).fetchone()
    assert password_valid("Original-password-387", user["password_hash"])


def test_unknown_or_oauth_only_accounts_do_not_receive_reset_mail(reset_client):
    client, deliveries = reset_client
    with db.connection() as connection:
        connection.execute(
            """INSERT INTO users
            (id,email,first_name,last_name,password_hash,yandex_id,created_at,email_verified)
            VALUES ('oauth-user','oauth@example.test','Яндекс','Аккаунт',NULL,'yandex-id',?,1)""",
            (db.now(),),
        )

    response = request_reset(client, "oauth@example.test")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert deliveries == []


def test_reset_email_delivery_does_not_include_token_in_application_logs(reset_client, caplog, monkeypatch):
    client, _ = reset_client
    add_account()
    token = "sensitive-reset-token-that-must-not-appear"
    monkeypatch.setattr("app.auth.secrets.token_urlsafe", lambda _: token)
    monkeypatch.setattr(
        "app.auth.deliver_password_reset_email",
        lambda *_: (_ for _ in ()).throw(OSError(f"delivery failed for {token}")),
    )

    response = request_reset(client)

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert token not in caplog.text


def test_reset_request_returns_without_waiting_for_mail_delivery(reset_client, monkeypatch):
    client, deliveries = reset_client
    add_account()
    queued = []
    monkeypatch.setattr(
        "app.auth.BackgroundTasks.add_task",
        lambda _tasks, function, *args, **kwargs: queued.append((function, args, kwargs)),
    )

    response = request_reset(client)

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(queued) == 1
    assert deliveries == []
    queued[0][0](*queued[0][1], **queued[0][2])
    assert [email for email, _ in deliveries] == ["recover@example.test"]