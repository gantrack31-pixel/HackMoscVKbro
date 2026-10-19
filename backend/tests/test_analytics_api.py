import time
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import database as db
from app.auth import digest, COOKIE
from app.config import settings
from app.analytics_routes import router


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
