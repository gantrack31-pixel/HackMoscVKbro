"""A retry uses the original project evidence after its source/style is removed."""
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from app import database as db
from app.config import settings
from app.main import app
from app.services.llm import LLMError


async def interrupted_design(*args, **kwargs):
    raise LLMError('Synthetic interruption before publication.')


def test_regeneration_retry_keeps_original_brand_and_source_snapshot(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'style-recovery.sqlite')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'demo')
    monkeypatch.setattr(settings, 'app_env', 'development')
    monkeypatch.setattr(settings, 'email_verification_required', False)
    with TestClient(app) as client:
        auth = client.post('/api/auth/register', json={
            'email': 'style-recovery@example.test', 'password': 'Style-Recovery-1947',
            'first_name': 'Тест', 'last_name': 'Восстановления',
        })
        assert auth.status_code == 201, auth.text
        client.headers['X-CSRF-Token'] = auth.json()['csrf']
        owner = auth.json()['user']['id']
        brand = client.post('/api/brands/upload', files={'file': (
            'synthetic-style.json', json.dumps({'name': 'Synthetic brand', 'colors': {
                'accent': '#008877', 'background': '#FFFDF2', 'text': '#192A44',
            }}).encode(), 'application/json',
        )})
        assert brand.status_code == 201, brand.text
        brand_id = brand.json()['id']
        created = client.post('/api/generate', json={
            'template_id': 'tech', 'source_text': 'Original immutable source 123.',
            'content': {'title': 'Original story', 'brand_style_id': brand_id, 'slides': [
                {'title': 'Original finding', 'body': 'Original immutable source 123.',
                 'source_quote': 'Original immutable source 123.'},
            ]},
        })
        assert created.status_code == 202, created.text
        job = client.get('/api/jobs/' + created.json()['job_id']).json()
        assert job['state'] == 'complete', job
        original = client.get('/api/projects/' + job['project_id']).json()
        style = original['provenance']['effective_style']
        assert style['metadata']['accent'] == '#008877'
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr('app.main.create_design_variants', interrupted_design)
            failed = client.post('/api/projects/' + original['id'] + '/regenerate',
                                 json={'instruction': 'Больше свободного пространства'})
        assert failed.status_code == 202, failed.text
        failed_id = failed.json()['job_id']
        assert client.get('/api/jobs/' + failed_id).json()['state'] == 'failed'
        frozen = db.job_get(failed_id)['payload']['original']
        assert frozen['user_id'] == owner
        assert frozen['provenance']['effective_style'] == style

        # Neither a changed source project nor a deleted brand may alter the
        # queued request; deleting the source project also rules out a refetch.
        changed = deepcopy(original['content'])
        changed['title'] = 'Newer unrelated draft'
        changed['slides'][0]['title'] = 'Newer finding'
        saved = client.put('/api/projects/' + original['id'], json={
            'content': changed, 'variant': original['variant'],
            'base_updated_at': original['updated_at'],
        })
        assert saved.status_code == 200, saved.text
        assert saved.json()['updated_at'] != original['updated_at']
        assert client.delete('/api/projects/' + original['id']).status_code == 204
        deleted_brand = client.delete('/api/brands/' + brand_id)
        assert deleted_brand.status_code == 200, deleted_brand.text

        retry = client.post('/api/jobs/' + failed_id + '/retry')
        assert retry.status_code == 202, retry.text
        completed = client.get('/api/jobs/' + retry.json()['job_id']).json()
        assert completed['state'] == 'complete', completed
        recovered = client.get('/api/projects/' + completed['project_id']).json()
        assert recovered['id'] != original['id']
        assert recovered['content']['title'] == original['content']['title']
        assert recovered['content']['slides'][0]['title'] == 'Original finding'
        assert recovered['source_text'] == original['source_text']
        assert recovered['provenance']['effective_style'] == style
        assert recovered['template']['metadata']['accent'] == '#008877'
        assert recovered['template']['metadata']['background'] == '#FFFDF2'
        assert client.get('/api/projects/' + recovered['id'] + '/export/pdf').content.startswith(b'%PDF')
        assert client.post('/api/jobs/' + failed_id + '/retry').json()['job_id'] == retry.json()['job_id']
        assert len(client.get('/api/projects').json()) == 1
