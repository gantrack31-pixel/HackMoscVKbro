"""Proposal review, scope, provenance, locks and stale/cancelled results."""
from copy import deepcopy
import pytest
from app import database as db
from app.services import llm
from test_assistant import client, request_for


def propose(client,monkeypatch,body=None):
    body=body or request_for(client)
    async def answer(*args):
        return {'summary':'Предлагаю краткий заголовок.', 'changes':[{'slide':0,'title':'Итог пилота'}]}
    monkeypatch.setattr(llm,'complete_json',answer)
    response=client.post('/api/projects/ai-test/assistant',json=body)
    assert response.status_code==200,response.text
    return body,response.json()['proposal']


def test_proposal_does_not_save_and_reject_keeps_draft(client,monkeypatch):
    original=deepcopy(db.project_get('ai-test'))
    body=request_for(client);body['content']['slides'][0]['body']='Моя ручная правка.'
    body,proposal=propose(client,monkeypatch,body)
    assert db.project_get('ai-test')==original
    assert proposal['project_id']=='ai-test' and proposal['slide']==0
    assert proposal['base_updated_at']==body['base_updated_at']
    assert len(proposal['draft_fingerprint'])==len(proposal['source_fingerprint'])==64
    assert any(c['field']=='title' and c['before']=='TODO' and c['after']=='Итог пилота' for c in proposal['changes'])
    url=f'/api/projects/ai-test/assistant/proposals/{proposal["id"]}'
    assert client.post(url+'/reject').json()['state']=='rejected'
    assert client.post(url+'/apply',json=body).status_code==409
    assert db.project_get('ai-test')==original


@pytest.mark.parametrize('change',['draft','version','source','variant','expiry'])
def test_stale_proposals_never_overwrite(client,monkeypatch,change):
    body,proposal=propose(client,monkeypatch)
    if change=='draft': body['content']['slides'][0]['body']='Ещё одна локальная правка.'
    if change=='version':
        latest=deepcopy(body['content']);latest['title']='Другая вкладка'
        db.project_update('ai-test',latest,'b')
    if change=='source':
        with db.connection() as conn: conn.execute("UPDATE projects SET source_text='Новый источник' WHERE id='ai-test'")
    if change=='variant': body['variant']='b'
    if change=='expiry':
        with db.connection() as conn: conn.execute("UPDATE assistant_proposals SET expires_at='2000' WHERE id=?",(proposal['id'],))
    original=deepcopy(db.project_get('ai-test'))
    response=client.post(f'/api/projects/ai-test/assistant/proposals/{proposal["id"]}/apply',json=body)
    assert response.status_code==409,response.text
    assert db.project_get('ai-test')==original
    if change=='expiry':
        with db.connection() as conn:
            assert conn.execute('SELECT payload FROM assistant_proposals WHERE id=?',(proposal['id'],)).fetchone()[0]=='{}'


def test_proposal_owner_and_consumption(client,monkeypatch):
    body,proposal=propose(client,monkeypatch)
    url=f'/api/projects/ai-test/assistant/proposals/{proposal["id"]}'
    applied=client.post(url+'/apply',json=body)
    assert applied.status_code==200
    original=db.project_get('ai-test')
    assert client.post(url+'/apply',json=body).status_code==409
    assert db.project_get('ai-test')==original
    auth=client.post('/api/auth/register',json={'email':'foreign-proposal@example.test','password':'Assistant-Test-2037!',
                     'first_name':'Other','last_name':'Owner'}).json()
    client.headers['X-CSRF-Token']=auth['csrf']
    assert client.post(url+'/apply',json=body).status_code==404
    assert client.post(url+'/reject').status_code==404


def test_context_and_second_correction_use_latest_draft(client,monkeypatch):
    body=request_for(client,pinned_brief='Для руководства. Сохранить утверждённый заголовок.',
                     conversation=[{'role':'user','content':'Сохрани число участников.'},
                                   {'role':'assistant','content':'Предлагаю перенести детали в заметки.'}],
                     locked_fields=[{'slide':0,'field':'title'}],locked_facts=['30 участников.'])
    body['content']['slides'][0]['title']='Утверждённый заголовок'
    body['content']['slides'][0]['body']='Пилот: 30 участников. Подробный комментарий.'
    async def answer(system,payload):
        assert payload['pinned_brief']==body['pinned_brief']
        assert payload['conversation']==body['conversation']
        assert payload['locked_fields']==body['locked_fields']
        assert payload['allowed_slides']==[0]
        assert payload['presentation']['slides'][0]['title']=='Утверждённый заголовок'
        return {'summary':'Убрал лишнее.', 'changes':[{'slide':0,'body':'30 участников.'}]}
    monkeypatch.setattr(llm,'complete_json',answer)
    proposal=client.post('/api/projects/ai-test/assistant',json=body).json()['proposal']
    applied=client.post(f'/api/projects/ai-test/assistant/proposals/{proposal["id"]}/apply',json=body).json()['project']
    next_body=request_for(client,pinned_brief=body['pinned_brief'],conversation=[*body['conversation'],{'role':'user','content':'Теперь уточни заметки.'}])
    async def second(system,payload):
        assert payload['presentation']['slides'][0]['body']=='30 участников.'
        assert len(payload['conversation'])==3
        return {'summary':'Уточнил заметки.', 'changes':[{'slide':0,'notes':'Для руководства: результат пилота.'}]}
    monkeypatch.setattr(llm,'complete_json',second)
    response=client.post('/api/projects/ai-test/assistant',json=next_body)
    assert response.status_code==200 and response.json()['proposal']
    assert client.get('/api/projects/ai-test').json()['updated_at']==applied['updated_at']


@pytest.mark.parametrize('patch',[
    {'title':'Непрошеный заголовок'}, {'body':'40 участников.'},
    {'body':'Участники пилота.'}, {'source_quote':'Придуманная цитата.'},
])
def test_locks_numbers_and_sources_reject_invalid_changes(client,monkeypatch,patch):
    body=request_for(client,locked_fields=[{'slide':0,'field':'title'}],locked_facts=['30 участников.'])
    body['content']['slides'][0]['body']='30 участников.'
    async def answer(*args): return {'summary':'Правка', 'changes':[{'slide':0,**patch}]}
    monkeypatch.setattr(llm,'complete_json',answer)
    response=client.post('/api/projects/ai-test/assistant',json=body)
    assert response.status_code==502,response.text
    assert not db.project_get('ai-test')['revisions']
    with db.connection() as conn: assert conn.execute('SELECT COUNT(*) FROM assistant_proposals').fetchone()[0]==0


def test_cancel_after_provider_return_cannot_publish_proposal(client,monkeypatch):
    body=request_for(client);jid=client.post('/api/ai/operations').json()['job_id']
    uid=db.project_get('ai-test')['user_id']
    async def answer(*args):
        db.job_cancel(jid,uid)
        return {'summary':'Поздний ответ', 'changes':[{'slide':0,'title':'Поздняя правка'}]}
    monkeypatch.setattr(llm,'complete_json',answer)
    response=client.post('/api/projects/ai-test/assistant',json=body,headers={'X-AI-Operation-ID':jid})
    assert response.status_code==409 and response.json()['detail']['code']=='AI_CANCELLED'
    assert not db.project_get('ai-test')['revisions']
    with db.connection() as conn: assert conn.execute('SELECT COUNT(*) FROM assistant_proposals').fetchone()[0]==0


def test_deleted_owner_leaves_no_private_proposal_content(client,monkeypatch):
    propose(client,monkeypatch)
    uid=db.project_get('ai-test')['user_id']
    with db.connection() as conn:
        conn.execute('DELETE FROM users WHERE id=?',(uid,))
        assert conn.execute('SELECT COUNT(*) FROM assistant_proposals WHERE user_id=?',(uid,)).fetchone()[0]==0


def test_assistant_cannot_replace_verified_analytics(client,monkeypatch):
    from app.analytics_models import AnalyticalVisual, AnalyticalSeries
    body=request_for(client)
    visual=AnalyticalVisual(chart_type='bar',labels=['A','B'],series=[AnalyticalSeries(name='Revenue',values=[12,18],unit='₽')])
    body['content']['slides'][0].update(kind='analysis',analytics=visual.model_dump(),title='Пилот')
    changed=visual.model_dump();changed['series'][0]['values']=[100,200]
    async def answer(*args): return {'summary':'Подменённые данные', 'changes':[{'slide':0,'analytics':changed}]}
    monkeypatch.setattr(llm,'complete_json',answer)
    response=client.post('/api/projects/ai-test/assistant',json=body)
    assert response.status_code==409,response.text
    assert response.json()['detail']['code']=='ANALYTICS_CHANGED'
    assert not db.project_get('ai-test')['revisions']


def test_explanation_with_no_edits_does_not_apply_unrequested_layout_fixes(client,monkeypatch):
    body=request_for(client,instruction='Объясни, почему нужно менять этот слайд.')
    async def answer(*args):
        return {'summary':'Сначала уточните основание вывода; причина в материале не указана.', 'changes':[]}
    monkeypatch.setattr(llm,'complete_json',answer)
    original=db.project_get('ai-test')
    response=client.post('/api/projects/ai-test/assistant',json=body)
    assert response.status_code==200 and response.json()['proposal'] is None
    assert response.json()['changed_slides']==[] and db.project_get('ai-test')==original
