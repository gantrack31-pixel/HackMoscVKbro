"""A fresh layout must preserve content, ownership and the previous presentation."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app import database as db
from app.services import llm
from app.models import DeckContent, Slide, ChartData


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'regeneration.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'app_env', 'development')
    with TestClient(app) as client:
        yield client


def register(client, email='layout@example.test'):
    response = client.post('/api/auth/register', json={
        'email': email, 'password': 'Layout-Example-1964',
        'first_name': 'Тест', 'last_name': 'Оформления',
    })
    assert response.status_code == 201
    client.headers['X-CSRF-Token'] = response.json()['csrf']


def project(client):
    content = DeckContent(title='История роста', slides=[
        Slide(title='Результаты', body='Рост команды: 12 человек.', kind='title',
              source_quote='12 человек', notes='Заметки автора'),
        Slide(title='По кварталам', body='Проверенные данные', kind='chart',
              chart=ChartData(labels=['I', 'II'], values=[12, 18], unit='чел.')),
    ])
    response = client.post('/api/generate', json={
        'template_id': 'tech', 'content': content.model_dump(), 'source_text': '12 человек',
    })
    job = client.get('/api/jobs/' + response.json()['job_id']).json()
    assert job['state'] == 'complete', job
    return client.get('/api/projects/' + job['project_id']).json()


def regenerate(client, pid, instruction='Больше воздуха'):
    response = client.post(f'/api/projects/{pid}/regenerate', json={'instruction': instruction})
    assert response.status_code == 202, response.text
    return client.get('/api/jobs/' + response.json()['job_id']).json()


def test_demo_regeneration_is_distinct_copy_with_identical_content(client):
    register(client)
    original = project(client)
    job = regenerate(client, original['id'])
    assert job['state'] == 'complete', job
    fresh = client.get('/api/projects/' + job['project_id']).json()
    assert fresh['id'] != original['id']
    assert fresh['template_id'] == original['template_id']
    assert fresh['source_text'] == original['source_text']
    for before, after in zip(original['content']['slides'], fresh['content']['slides']):
        assert after['design'] is not None
        assert {k: v for k, v in before.items() if k != 'design'} == {
            k: v for k, v in after.items() if k != 'design'
        }
    assert fresh['variants']['a'] != original['variants']['a']
    assert fresh['variants']['a'] != fresh['variants']['b']
    assert client.get('/api/projects/' + original['id']).json() == original
    second_job = regenerate(client, fresh['id'])
    second = client.get('/api/projects/' + second_job['project_id']).json()
    assert second['variants']['a'] != fresh['variants']['a']
    for extension in ['pptx', 'pdf', 'html']:
        response = client.get(f"/api/projects/{fresh['id']}/export/{extension}")
        assert response.status_code == 200 and len(response.content) > 500


def test_live_regeneration_uses_validated_plan_not_rewritten_content(client, monkeypatch):
    register(client)
    original = project(client)
    calls = []

    async def model(system, payload):
        calls.append(payload)
        return {'slides': [
            {'slide': i, 'design': {'composition': 'editorial', 'density': 'compact', 'layout_shift': i}}
            for i in range(2)
        ]}

    monkeypatch.setattr(settings, 'mode', 'live')
    monkeypatch.setattr(settings, 'api_key', 'test-key')
    monkeypatch.setattr(llm, 'complete_json', model)
    job = regenerate(client, original['id'], 'Спокойная редакционная композиция')
    assert job['state'] == 'complete', job
    assert calls[0]['instruction'] == 'Спокойная редакционная композиция'
    assert calls[0]['template']['name'] == original['template']['name']
    fresh = client.get('/api/projects/' + job['project_id']).json()
    assert fresh['content']['slides'][1]['chart'] == original['content']['slides'][1]['chart']
    assert fresh['content']['slides'][0]['notes'] == 'Заметки автора'
    assert fresh['content']['slides'][0]['design']['density'] == 'compact'


def test_invalid_model_plan_fails_without_partial_save(client, monkeypatch):
    register(client)
    original = project(client)
    attempts = []

    async def model(system, payload):
        attempts.append(True)
        return {'slides': [
            {'slide': 0, 'design': {'composition': 'grid'}},
            {'slide': 0, 'design': {'composition': 'grid'}},
        ]}

    monkeypatch.setattr(settings, 'mode', 'live')
    monkeypatch.setattr(settings, 'api_key', 'test-key')
    monkeypatch.setattr(llm, 'complete_json', model)
    job = regenerate(client, original['id'])
    assert job['state'] == 'failed' and job['project_id'] is None
    assert len(attempts) == 2
    assert len(client.get('/api/projects').json()) == 1
    assert client.get('/api/projects/' + original['id']).json() == original


def test_regeneration_requires_owner_csrf_and_bounded_input(client):
    register(client)
    original = project(client)
    path = f"/api/projects/{original['id']}/regenerate"
    assert client.post(path, json={}, headers={'X-CSRF-Token': 'wrong'}).status_code == 403
    assert client.post(path, json={'instruction': 'x' * 1001}).status_code == 422
    register(client, 'another-owner@example.test')
    assert client.post(path, json={}).status_code == 404
    assert client.get('/api/projects').json() == []
