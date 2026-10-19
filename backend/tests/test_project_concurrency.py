"""Public writes compare the expected revision inside the write transaction."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier
import pytest
from app import database as db
from test_assistant import client, request_for


def test_two_tabs_cannot_silently_overwrite(client):
    base=request_for(client); barrier=Barrier(2)
    def save(title):
        draft=deepcopy(base); draft['content']['title']=title
        barrier.wait()
        response=client.put('/api/projects/ai-test',json=draft)
        return title,response
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(save,['Первая вкладка','Вторая вкладка']))
    assert sorted(r.status_code for _,r in results)==[200,409]
    winner=next(title for title,r in results if r.status_code==200)
    loser=next(r for _,r in results if r.status_code==409)
    assert loser.json()['detail']['code']=='VERSION_CONFLICT'
    project=client.get('/api/projects/ai-test').json()
    assert project['title']==winner
    assert len(db.project_get('ai-test')['revisions'])==1
    restored=client.post('/api/projects/ai-test/undo',json={'base_updated_at':project['updated_at']})
    assert restored.status_code==200 and restored.json()['content']==base['content']


@pytest.mark.parametrize('operation',['save','fix','undo','redo'])
def test_mutations_require_revision_and_reject_stale_revision(client,operation):
    base=request_for(client)
    body={'content':base['content'],'variant':'a'} if operation=='save' else {'issue_ids':['placeholder:0'],'variant':'a'} if operation=='fix' else {}
    method=client.put if operation=='save' else client.post
    url='/api/projects/ai-test'+('' if operation=='save' else '/'+operation)
    assert method(url,json=body).json()['detail']['code']=='VERSION_REQUIRED'
    body['base_updated_at']='stale'
    response=method(url,json=body)
    assert response.status_code==409 and response.json()['detail']['code']=='VERSION_CONFLICT'
    assert client.get('/api/projects/ai-test').json()['content']==base['content']
    assert not db.project_get('ai-test')['revisions']


def test_preview_is_read_only_and_needs_no_revision(client):
    base=request_for(client)
    response=client.post('/api/projects/ai-test/preview',json={'content':base['content'],'variant':'a'})
    assert response.status_code==200
    assert not db.project_get('ai-test')['revisions']


def test_noop_save_preserves_history_and_version(client):
    body=request_for(client)
    response=client.put('/api/projects/ai-test',json=body)
    assert response.status_code==200
    assert response.json()['updated_at']==body['base_updated_at']
    assert not response.json()['can_undo']
