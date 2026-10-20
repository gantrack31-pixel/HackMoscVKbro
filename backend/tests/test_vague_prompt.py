import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.services import llm
from app.services.narrative import is_vague_prompt


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'vague.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'app_env', 'development')
    monkeypatch.setattr(settings, 'email_verification_required', False)
    with TestClient(app) as client:
        response = client.post('/api/auth/register', json={'email': 'vague@example.test', 'password': 'Vague-Test-2026!',
                                                            'first_name': 'Test', 'last_name': 'Vague'})
        assert response.status_code == 201
        client.headers['X-CSRF-Token'] = response.json()['csrf']
        yield client


@pytest.mark.parametrize('prompt', [
    'Презентация', 'презентацию', 'Сделай презентацию на тему', 'Создай слайды пожалуйста',
    'Презентация проекта', 'Нужна красивая презентация на любую тему', 'make a presentation about', '   '])
def test_requests_without_a_topic_are_vague(prompt):
    assert is_vague_prompt(prompt)


@pytest.mark.parametrize('prompt', [
    'Экология', 'Презентация о кошках', 'Презентация про ИИ', 'AI in healthcare', 'HR-процессы',
    'Проектирование мостов', 'Температура в Москве', 'Любовь в литературе', 'Тестирование ПО',
    'Отчёт за 2025', 'Plan', 'Client proposal'])
def test_any_real_topic_is_enough(prompt):
    assert not is_vague_prompt(prompt)


def test_outline_asks_to_clarify_without_calling_the_model(client, monkeypatch):
    async def must_not_run(*args, **kwargs):
        raise AssertionError('model must not be called for a vague request')
    monkeypatch.setattr('app.main.make_outline', must_not_run)
    response = client.post('/api/outline', json={'template_id': 'tech', 'prompt': 'Презентация', 'count': 5})
    assert response.status_code == 422
    detail = response.json()['detail']
    assert detail['code'] == 'PROMPT_TOO_VAGUE'
    assert 'Уточните тему' in detail['message']


def test_outline_with_a_topic_still_reaches_the_model(client, monkeypatch):
    called = []
    async def fake_outline(request, template, resources):
        called.append(request.prompt)
        return llm.demo_outline(request)
    monkeypatch.setattr('app.main.make_outline', fake_outline)
    response = client.post('/api/outline', json={'template_id': 'tech', 'prompt': 'Презентация о кошках', 'count': 3})
    assert response.status_code == 200, response.text
    assert called == ['Презентация о кошках']
