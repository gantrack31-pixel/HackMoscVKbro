import asyncio
from hashlib import md5
from urllib.parse import parse_qs, urlsplit
import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from app import database as db
from app.config import settings
from app.services import yandex_disk as disk
from test_workflow import client, register, make_project

@pytest.fixture
def connected(client,monkeypatch):
    user=register(client)
    monkeypatch.setattr(settings,'yandex_id','test-client')
    monkeypatch.setattr(settings,'yandex_disk_token_key',Fernet.generate_key().decode())
    disk.save_token(user['id'],'private-test-token',3600,'test-yandex')
    return user['id']

def test_token_encryption_expiry_and_isolation(connected):
    with db.connection() as conn:
        value=conn.execute('SELECT token FROM yandex_disk_tokens').fetchone()[0]
    assert 'private-test-token' not in value and disk.token_for(connected)=='private-test-token'
    with pytest.raises(HTTPException): disk.token_for('someone-else')
    with db.connection() as conn: conn.execute('UPDATE yandex_disk_tokens SET expires_at=1')
    with pytest.raises(HTTPException) as error: disk.token_for(connected)
    assert error.value.status_code==409

def test_upload_verifies_real_provider_bytes_and_never_leaks_oauth(connected):
    data=b'native pptx test bytes';paths=[]
    def handler(request):
        if request.url.host=='uploader.disk.yandex.net':
            assert 'Authorization' not in request.headers
            assert request.content==data
            return httpx.Response(201)
        assert request.headers['Authorization']=='OAuth private-test-token'
        if request.url.path.endswith('/upload'):
            paths.append(request.url.params['path'])
            assert request.url.params['overwrite']=='false'
            return httpx.Response(200,json={'href':'https://uploader.disk.yandex.net/file','method':'PUT'})
        if request.method=='PUT': return httpx.Response(201)
        return httpx.Response(200,json={'size':len(data),'md5':md5(data).hexdigest(),'modified':'2026-09-29T12:00:00Z'})
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
            for _ in range(2):
                result=await disk.upload(connected,'Один / проект',data,transport)
                assert result['provider']=='yandex_disk' and result['name'].endswith('.pptx')
    asyncio.run(run())
    assert len(set(paths))==2 and all(p.startswith('app:/Deckly/') for p in paths)

@pytest.mark.parametrize('status,expected',[(401,409),(403,409),(429,503),(500,503),(507,503)])
def test_provider_failure_never_returns_success(connected,status,expected):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(status))) as transport:
            with pytest.raises(HTTPException) as error: await disk.upload(connected,'Тест',b'data',transport)
            assert error.value.status_code==expected and 'private-test-token' not in error.value.detail
    asyncio.run(run())

@pytest.mark.parametrize('href',['http://uploader.disk.yandex.net/f','https://localhost/f','https://uploader.disk.yandex.net.evil.test/f','https://user@uploader.disk.yandex.net/f'])
def test_upload_url_rejects_untrusted_destinations(href):
    with pytest.raises(HTTPException): disk.upload_url({'href':href})

def test_connect_requests_app_folder_scope_and_upload_route_uses_exported_pptx(client,connected,monkeypatch):
    start=client.post('/api/disk/connect')
    assert start.status_code==200
    query=parse_qs(urlsplit(start.json()['url']).query)
    assert 'cloud_api:disk.app_folder' in query['scope'][0] and query['code_challenge_method']==['S256']
    assert 'httponly' in start.headers['set-cookie'].lower()
    project,_=make_project(client)
    async def capture(user_id,title,data,client=None):
        assert user_id==connected and data.startswith(b'PK')
        return {'name':'test.pptx','path':'app:/Deckly/test.pptx','saved_at':db.now(),'provider':'yandex_disk'}
    monkeypatch.setattr(disk,'upload',capture)
    assert client.post('/api/projects/'+project['id']+'/disk').json()['provider']=='yandex_disk'
    assert client.post('/api/projects/not-owned/disk').status_code==404
    assert client.post('/api/disk/connect',headers={'X-CSRF-Token':'bad'}).status_code==403

def test_disk_reconnect_same_account_saves_encrypted_token(client,connected,monkeypatch):
    with db.connection() as conn: conn.execute('UPDATE users SET yandex_id=? WHERE id=?',('test-yandex',connected))
    query=parse_qs(urlsplit(client.post('/api/disk/connect').json()['url']).query)
    original=httpx.AsyncClient
    def handler(request):
        if request.url.path=='/token': return httpx.Response(200,json={'access_token':'new-private-token','expires_in':3600})
        return httpx.Response(200,json={'id':'test-yandex','default_email':'yandex@example.test'})
    monkeypatch.setattr('app.auth.httpx.AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    response=client.get('/api/auth/yandex/callback',params={'state':query['state'][0],'code':'test'},follow_redirects=False)
    assert response.headers['location'].endswith('/#projects')
    assert disk.token_for(connected)=='new-private-token'


def test_network_failure_and_corrupt_receipt_do_not_claim_success(connected):
    async def run():
        def network(request): raise httpx.ConnectError('private provider error',request=request)
        async with httpx.AsyncClient(transport=httpx.MockTransport(network)) as transport:
            with pytest.raises(HTTPException) as error: await disk.status(connected,transport)
            assert error.value.status_code==503 and 'private provider' not in error.value.detail
        def corrupt(request):
            if request.url.host=='up.disk.yandex.net': return httpx.Response(201)
            if request.method=='PUT': return httpx.Response(201)
            if request.url.path.endswith('/upload'):
                return httpx.Response(200,json={'href':'https://up.disk.yandex.net/file','method':'PUT'})
            return httpx.Response(200,json={'size':3,'md5':'wrong'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(corrupt)) as transport:
            with pytest.raises(HTTPException) as error: await disk.upload(connected,'Тест',b'abc',transport)
            assert error.value.status_code==502
    asyncio.run(run())
