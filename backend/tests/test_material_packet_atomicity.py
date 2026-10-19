"""Imported sources carry usable IDs/text, and a failed packet leaves no partial files."""
from pathlib import Path
from fastapi import HTTPException
from app import database as db
from app.config import settings
from test_assistant import client


def upload(client, entries):
    return client.post('/api/materials/import',files=[('files',(name,data,'text/plain')) for name,data in entries])


def test_document_receipts_link_exact_text_to_owner_scoped_resource_ids(client):
    response=upload(client,[('C:\\documents\\first.txt','Факт первого источника: 37.'.encode()),('second.txt','Второй факт: 91.'.encode())])
    assert response.status_code==200,response.text
    packet=response.json()
    assert len(packet['documents'])==len(packet['resources'])==len(packet['resource_ids'])==2
    resources={r['id']:r for r in packet['resources']}
    for document in packet['documents']:
        assert document['id'] in resources and document['id'] in packet['resource_ids']
        assert document['text'] in packet['text'] and document['characters']==len(document['text'])
        assert '/' not in document['name'] and '\\' not in document['name']
    removed=packet['documents'][0]
    assert client.delete('/api/materials/'+removed['id']).status_code==204
    remaining=client.get('/api/materials').json()['resources']
    assert [r['id'] for r in remaining]==[packet['documents'][1]['id']]


def test_invalid_later_file_does_not_publish_earlier_source(client):
    response=upload(client,[('valid.txt',b'Distinct valid fact'),('broken.docx',b'not a document')])
    assert response.status_code==422
    assert client.get('/api/materials').json()['resources']==[]
    assert not list((settings.storage/'materials').rglob('*.*'))


def test_storage_failure_rolls_back_only_new_sources_keeps_existing_deduplicated_source(client,monkeypatch):
    original=upload(client,[('existing.txt',b'Previously imported source')]).json()['resources'][0]
    item=db.materials_list(db.project_get('ai-test')['user_id'])[0]
    original_path=Path(item['path'])
    save=db.material_save
    def flaky(mid,uid,name,kind,path,metadata,digest):
        if name=='failing.txt': raise HTTPException(503,'Controlled storage failure')
        return save(mid,uid,name,kind,path,metadata,digest)
    monkeypatch.setattr(db,'material_save',flaky)
    response=upload(client,[('alias.txt',b'Previously imported source'),('new.txt',b'New packet source'),('failing.txt',b'Fails during persistence')])
    assert response.status_code==503
    assert [r['id'] for r in client.get('/api/materials').json()['resources']]==[original['id']]
    assert original_path.read_bytes()==b'Previously imported source'
    assert list(original_path.parent.iterdir())==[original_path]


def test_duplicate_documents_have_one_resource_identity_and_other_owner_cannot_delete_it(client):
    packet=upload(client,[('first.txt',b'Same source'),('alias.txt',b'Same source')]).json()
    assert len(packet['resource_ids'])==len(packet['resources'])==1
    assert {d['id'] for d in packet['documents']}==set(packet['resource_ids'])
    private_id=packet['resource_ids'][0]
    auth=client.post('/api/auth/register',json={'email':'packet-other@example.test','password':'Assistant-Test-2037!',
                    'first_name':'Other','last_name':'Owner'}).json()
    client.headers['X-CSRF-Token']=auth['csrf']
    assert client.get('/api/materials').json()['resources']==[]
    assert client.delete('/api/materials/'+private_id).status_code==404
