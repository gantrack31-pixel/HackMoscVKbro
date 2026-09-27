"""Live generation must call the provider and persist all three plans atomically."""
import asyncio
import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from app.services import llm

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'database', tmp_path / 'live.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'live')
    monkeypatch.setattr(settings, 'api_key', 'test-key')
    monkeypatch.setattr(settings, 'app_env', 'development')
    monkeypatch.setattr(settings, 'email_verification_required', False)
    with TestClient(app) as client:
        response=client.post('/api/auth/register',json={'email':'live@example.test','password':'Live-Test-2026!', 'first_name':'Test','last_name':'Design'})
        assert response.status_code==201
        client.headers['X-CSRF-Token']=response.json()['csrf']
        yield client

def plans(n):
    return {v:{'slides':[{'slide':i,'design':{'composition':c,'density':'balanced','layout_shift':1}} for i in range(n)]}
            for v,c in zip(('a','b','c'),('editorial','split','grid'))}

def test_live_outline_then_generation_keeps_approved_content_and_audience(client,monkeypatch):
    calls=[]
    async def model(system,payload):
        calls.append(payload)
        if 'task' in payload:
            return {'title':'Client proposal','slides':[{'title':f'Slide {i}','body':'Approved material'} for i in range(3)]}
        return plans(len(payload['slides']))
    monkeypatch.setattr(llm,'complete_json',model)
    response=client.post('/api/outline',json={'template_id':'tech','prompt':'Client proposal','count':3,'audience':'Клиенты и партнёры'})
    assert response.status_code==200
    content=response.json()['content']
    content['slides'][1]['body']='User edited this text'
    response=client.post('/api/generate',json={'template_id':'tech','content':content,'audience':'Клиенты и партнёры'})
    job=client.get('/api/jobs/'+response.json()['job_id']).json()
    assert job['state']=='complete',job
    project=client.get('/api/projects/'+job['project_id']).json()
    assert len(calls)==2 and calls[0]['task']['audience']==calls[1]['audience']=='Клиенты и партнёры'
    assert project['content']['slides'][1]['body']=='User edited this text'
    assert all(set(s['designs'])=={'a','b','c'} for s in project['content']['slides'])
    assert project['variants']['a']!=project['variants']['b']!=project['variants']['c']
    assert all(scene['variant']==variant for variant,scenes in project['variants'].items() for scene in scenes)
    for instruction in ('','   '):
        response=client.post('/api/projects/'+project['id']+'/regenerate',json={'instruction':instruction})
        assert response.status_code==422
    assert len(calls)==2
    for extension in ('pptx','pdf','html'):
        assert client.get('/api/projects/'+project['id']+'/export/'+extension).status_code==200

def test_provider_failure_does_not_create_fake_variants(client,monkeypatch):
    async def fail(*args): raise llm.LLMError('Provider unavailable')
    monkeypatch.setattr(llm,'complete_json',fail)
    response=client.post('/api/generate',json={'template_id':'tech','content':{'title':'Test','slides':[{'title':'Test'}]}})
    job=client.get('/api/jobs/'+response.json()['job_id']).json()
    assert job['state']=='failed' and job['error']=='Provider unavailable'
    assert client.get('/api/projects').json()==[]

def test_yandex_headers_and_folder_uri(monkeypatch):
    monkeypatch.setattr(settings,'base_url','https://ai.api.cloud.yandex.net/v1')
    monkeypatch.setattr(settings,'api_key','private-test-key')
    monkeypatch.setattr(settings,'model','gpt://test-folder/yandexgpt/latest')
    monkeypatch.setattr(settings,'folder_id','')
    def respond(request):
        assert request.headers['Authorization']=='Api-Key private-test-key'
        assert request.headers['OpenAI-Project']=='test-folder'
        assert json.loads(request.content)['model']==settings.model
        return httpx.Response(200,json={'choices':[{'message':{'content':'{"ok":true}'}}]})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
            assert await llm.complete_json('JSON',{},transport)=={'ok':True}
    asyncio.run(run())
