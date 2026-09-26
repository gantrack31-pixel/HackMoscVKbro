"""Generation jobs remain recoverable without duplicating completed projects."""
import pytest
from fastapi.testclient import TestClient

from app import database as db
from app.config import settings
from app.main import app
from app.models import DeckContent, Slide


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'generation.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'app_env', 'development')
    with TestClient(app) as client:
        yield client


def register(client, email='recover@example.test'):
    response = client.post('/api/auth/register', json={
        'email': email,
        'password': 'Recovery-Example-1947',
        'first_name': 'Тест',
        'last_name': 'Повтора',
    })
    assert response.status_code == 201, response.text
    client.headers['X-CSRF-Token'] = response.json()['csrf']
    return response.json()['user']


def create_failed_job(client):
    content = DeckContent(title='Восстанавливаемая презентация', slides=[
        Slide(title='Слайд для повтора', body='Подтверждённый текст', source_quote='Подтверждённый текст'),
    ])
    response = client.post('/api/generate', json={
        'template_id': 'tech',
        'content': content.model_dump(),
        'source_text': 'Подтверждённый текст',
    })
    assert response.status_code == 202, response.text
    job_id = response.json()['job_id']
    completed = client.get(f'/api/jobs/{job_id}').json()
    if completed.get('project_id'):
        db.project_delete(completed['project_id'])
    db.job_set(job_id, 'failed', 'failed', error='Сервер перезапущен. Повторите создание.')
    return job_id


def test_retry_is_owner_scoped_and_repeated_requests_do_not_duplicate_projects(client):
    register(client)
    failed_job_id = create_failed_job(client)
    retry_url = f'/api/jobs/{failed_job_id}/retry'

    first = client.post(retry_url)
    second = client.post(retry_url)

    assert first.status_code == 202, first.text
    assert second.status_code == 202, second.text
    assert first.json()['job_id'] == second.json()['job_id']
    retry_job = client.get(f"/api/jobs/{first.json()['job_id']}").json()
    assert retry_job['state'] == 'complete', retry_job
    assert retry_job['project_id']
    assert len(client.get('/api/projects').json()) == 1
    assert client.post(retry_url).json()['job_id'] == first.json()['job_id']

    register(client, 'different-owner@example.test')
    assert client.post(retry_url).status_code == 404


def test_interrupted_job_keeps_retry_payload_after_startup_recovery(client):
    register(client)
    job_id = create_failed_job(client)
    db.job_set(job_id, 'running', 'export')
    before = db.job_get(job_id)
    assert before['task_type'] == 'generate'
    assert before['payload']

    db.initialize()

    recovered = client.get(f'/api/jobs/{job_id}').json()
    after = db.job_get(job_id)
    assert recovered['state'] == 'failed'
    assert recovered['can_retry'] is True
    assert after['payload'] == before['payload']


def test_successful_job_cannot_be_retried(client):
    register(client)
    content = DeckContent(title='Готовая презентация', slides=[
        Slide(title='Завершено', body='Текст', source_quote='Текст'),
    ])
    response = client.post('/api/generate', json={
        'template_id': 'tech', 'content': content.model_dump(), 'source_text': 'Текст',
    })
    job_id = response.json()['job_id']
    assert client.get(f'/api/jobs/{job_id}').json()['state'] == 'complete'

    retry = client.post(f'/api/jobs/{job_id}/retry')

    assert retry.status_code == 409
    assert len(client.get('/api/projects').json()) == 1


def test_retry_of_retry_reuses_reserved_result_project_id(client):
    user = register(client)
    failed_job_id = create_failed_job(client)
    first_status, retry_id = db.job_retry_claim(failed_job_id, user['id'])
    assert first_status == 'claimed'
    db.job_set(failed_job_id, 'retrying', 'retrying', user_id=user['id'])
    concurrent_status, concurrent_retry_id = db.job_retry_claim(failed_job_id, user['id'])
    assert concurrent_status == 'existing'
    assert concurrent_retry_id == retry_id
    retry = db.job_get(retry_id)
    db.job_set(retry_id, 'running', 'audit', user_id=user['id'])
    payload = retry['payload']

    db.job_complete_with_project(retry_id, payload['result_project_id'], 'tech',
                                 payload['request']['content'], payload['request']['source_text'], user['id'])
    retry_status, same_retry_id = db.job_retry_claim(failed_job_id, user['id'])

    assert retry_status == 'existing'
    assert same_retry_id == retry_id
    assert len(db.projects_list(user['id'])) == 1


def test_regeneration_retry_uses_saved_source_project_and_produces_one_copy(client):
    user = register(client)
    content = DeckContent(title='Исходная история', slides=[
        Slide(title='Исходный тезис', body='Содержание не меняется', source_quote='Содержание не меняется'),
    ])
    created = client.post('/api/generate', json={
        'template_id': 'tech', 'content': content.model_dump(), 'source_text': 'Содержание не меняется',
    })
    original_job = client.get(f"/api/jobs/{created.json()['job_id']}").json()
    original = client.get(f"/api/projects/{original_job['project_id']}").json()
    response = client.post(f"/api/projects/{original['id']}/regenerate", json={'instruction': 'Больше воздуха'})
    regeneration_id = response.json()['job_id']
    regeneration = client.get(f'/api/jobs/{regeneration_id}').json()
    db.job_set(regeneration_id, 'failed', 'failed', error='Тестовое прерывание')

    retry = client.post(f'/api/jobs/{regeneration_id}/retry')
    retry_job = client.get(f"/api/jobs/{retry.json()['job_id']}").json()
    recovered_project = client.get(f"/api/projects/{retry_job['project_id']}").json()

    assert retry.status_code == 202
    assert recovered_project['id'] != original['id']
    assert recovered_project['source_text'] == original['source_text']
    assert [s['title'] for s in recovered_project['content']['slides']] == [
        s['title'] for s in original['content']['slides']
    ]
    assert len(client.get('/api/projects').json()) == 2
    assert client.get(f'/api/jobs/{regeneration_id}').json()['state'] == 'complete'