import time
from copy import deepcopy
from pathlib import Path
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from app import database as db
from app.auth import digest, COOKIE
from app.config import settings
from app.analytics_routes import router
from app.models import Slide
from app.services import analytics_store as store
from app.services.analytics_ingest import AnalysisError


def test_analysis_authenticated_csrf_owner_scoped_profile_rows_source_and_choices(tmp_path,monkeypatch):
    monkeypatch.setattr(settings,'database',tmp_path/'api.sqlite')
    db.initialize()
    with db.connection() as conn:
        for user in ('alice','bob'):
            conn.execute('INSERT INTO users (id,email,first_name,last_name,created_at) VALUES (?,?,?,?,?)',(user,user+'@example.test',user,'',db.now()))
            conn.execute('INSERT INTO sessions VALUES (?,?,?,?)',(digest(user+'-token'),user,user+'-csrf',int(time.time())+3600))
    app=FastAPI();app.include_router(router)
    with TestClient(app) as client:
        assert client.get('/api/analysis').status_code==401
        client.cookies.set(COOKIE,'alice-token')
        data={'name':'data.csv','text':'Region,Revenue\nNorth,100\nSouth,123'}
        assert client.post('/api/analysis/text',json=data).status_code==403
        response=client.post('/api/analysis/text',json=data,headers={'X-CSRF-Token':'alice-csrf'})
        assert response.status_code==200
        id=response.json()['id']
        assert response.json()['tables'][0]['row_count']==2
        choice={'table_id':'t1','chart_type':'pie','dimension':'Region','measures':['Revenue'],'aggregation':'sum'}
        assert client.put(f'/api/analysis/{id}/selection',json=choice,headers={'X-CSRF-Token':'alice-csrf'}).status_code==200
        planned=client.post(f'/api/analysis/{id}/plan',json={},headers={'X-CSRF-Token':'alice-csrf'})
        assert planned.status_code==200 and planned.json()['slide_count']==1
        rows=client.get(f'/api/analysis/{id}/rows?offset=1&limit=1').json()
        assert rows['rows']==[['South','123']] and rows['lineage']==[3] and rows['total']==2
        assert client.get(f'/api/analysis/{id}/source').content==data['text'].encode()
        client.cookies.set(COOKIE,'bob-token')
        assert client.get('/api/analysis').json()==[]
        for suffix in ('','/rows','/source'):
            assert client.get(f'/api/analysis/{id}{suffix}').status_code==404
        assert client.put(f'/api/analysis/{id}/selection',json=choice,headers={'X-CSRF-Token':'bob-csrf'}).status_code==404
        assert client.post(f'/api/analysis/{id}/plan',json={},headers={'X-CSRF-Token':'bob-csrf'}).status_code==404
        assert client.delete(f'/api/analysis/{id}',headers={'X-CSRF-Token':'bob-csrf'}).status_code==404
        client.cookies.set(COOKIE,'alice-token')
        assert client.delete(f'/api/analysis/{id}',headers={'X-CSRF-Token':'alice-csrf'}).status_code==200
        assert client.get(f'/api/analysis/{id}').status_code==404


@pytest.fixture
def grouped_api(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'grouped.sqlite')
    db.initialize()
    with db.connection() as conn:
        conn.execute('INSERT INTO users (id,email,first_name,last_name,created_at) VALUES (?,?,?,?,?)',
                     ('alice', 'alice@example.test', 'Alice', '', db.now()))
        conn.execute('INSERT INTO sessions VALUES (?,?,?,?)',
                     (digest('alice-token'), 'alice', 'alice-csrf', int(time.time()) + 3600))
    app = FastAPI()
    app.include_router(router)
    source = Path(__file__).parent / 'fixtures' / 'company_2023_2025.csv'
    with TestClient(app) as client:
        client.cookies.set(COOKIE, 'alice-token')
        client.headers['X-CSRF-Token'] = 'alice-csrf'
        response = client.post('/api/analysis/upload',
                               files={'file': (source.name, source.read_bytes(), 'text/csv')})
        assert response.status_code == 200, response.text
        dataset_id = response.json()['id']
        choice = {'table_id': 't1', 'chart_type': 'grouped', 'dimension': 'Год',
                  'measures': ['Выручка_млн_руб', 'Расходы_млн_руб'], 'aggregation': 'none'}
        response = client.put(f'/api/analysis/{dataset_id}/selection', json=choice)
        assert response.status_code == 200, response.text
        response = client.post(f'/api/analysis/{dataset_id}/plan', json={})
        assert response.status_code == 200, response.text
        yield client, dataset_id, response.json()


def test_grouped_without_units_has_no_headline_edge_whitespace(grouped_api):
    _, _, planned = grouped_api
    slide = planned['slides'][0]
    assert [series['unit'] for series in slide['analytics']['series']] == ['', '']
    assert slide['title'] == slide['title'].strip()
    assert slide['analytics']['takeaway'] == slide['analytics']['takeaway'].strip()


@pytest.mark.parametrize('padding', ['', ' ', '\t\n'], ids=['clean', 'spaces', 'tabs-newlines'])
def test_grouped_upload_selection_plan_accepts_only_edge_whitespace(grouped_api, padding):
    _, _, planned = grouped_api
    slides = deepcopy(planned['slides'])
    for slide in slides:
        slide['title'] = padding + slide['title'].strip() + padding
    assert store.validate_requested_analytics('alice', slides)
    assert store.validate_requested_analytics('alice', [Slide.model_validate(s) for s in slides])


def test_grouped_legacy_plan_accepts_a_trimmed_client_headline(grouped_api, monkeypatch):
    _, _, planned = grouped_api
    legacy = deepcopy(planned)
    legacy['slides'][0]['title'] = ' \t' + legacy['slides'][0]['title'].strip() + ' \n'
    monkeypatch.setattr(store, 'plan_owned', lambda *args: legacy)
    assert store.validate_requested_analytics('alice', [Slide.model_validate(legacy['slides'][0])])


def changed_headline(title, change):
    if change == 'case':
        return title.lower()
    if change == 'words':
        return title.replace('Выручка', 'Прибыль')
    if change == 'numbers':
        return title.replace('220', '221')
    return title.replace(': ', ':  ', 1)


@pytest.mark.parametrize('change', ['case', 'words', 'numbers', 'internal-spaces'])
def test_grouped_changed_headline_is_still_rejected(grouped_api, change):
    _, _, planned = grouped_api
    slides = deepcopy(planned['slides'])
    slides[0]['title'] = changed_headline(slides[0]['title'], change)
    with pytest.raises(AnalysisError, match='заголовок'):
        store.validate_requested_analytics('alice', slides)


@pytest.mark.parametrize('previous_padding,incoming_padding', [(' \t', ''), ('', ' \n'), ('\t', ' \n')])
def test_saved_grouped_evidence_keeps_trust_after_title_trimming(grouped_api, previous_padding, incoming_padding):
    client, dataset_id, planned = grouped_api
    previous = {'slides': deepcopy(planned['slides'])}
    content = {'slides': deepcopy(planned['slides'])}
    previous['slides'][0]['title'] = previous_padding + previous['slides'][0]['title'].strip() + previous_padding
    content['slides'][0]['title'] = incoming_padding + content['slides'][0]['title'].strip() + incoming_padding
    # Saved evidence stays usable even after the dataset's current choice changes.
    response = client.put(f'/api/analysis/{dataset_id}/selection', json={
        'table_id': 't1', 'chart_type': 'bar', 'dimension': 'Год',
        'measures': ['Выручка_млн_руб'], 'aggregation': 'none',
    })
    assert response.status_code == 200, response.text
    assert store.validate_content_evidence(content, previous, 'alice')


@pytest.mark.parametrize('change', ['case', 'words', 'numbers', 'internal-spaces'])
def test_saved_grouped_changed_headline_is_still_rejected(grouped_api, change):
    _, _, planned = grouped_api
    previous = {'slides': deepcopy(planned['slides'])}
    content = deepcopy(previous)
    content['slides'][0]['title'] = changed_headline(content['slides'][0]['title'], change)
    with pytest.raises(HTTPException) as caught:
        store.validate_content_evidence(content, previous, 'alice')
    assert caught.value.status_code == 409
