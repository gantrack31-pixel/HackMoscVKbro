"""Light catalog preserves UI data and legacy responses; assets retain access checks."""
from copy import deepcopy
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.config import settings
from app import database as db
from app.main import app, public_template
from app.services import template_preview


def sample_template():
    return {'id':'tech','name':'Demo','path':None,'user_id':'private',
            'metadata':{'ratio':16/9,'layouts':[{'name':'Title'}],'colors':{'text':'#000000'},
                        'manifest':{'xml':'large'},'package':{'media':'large'},'slide_examples':['large'],
                        'assets':[{'id':'image1','name':'image','data':'data:image/png;base64,aGVsbG8='}]}}


def test_summary_keeps_ui_data_without_inline_binaries_or_mutating_original():
    template=sample_template();before=deepcopy(template)
    full=public_template(template)
    summary=public_template(template,summary=True)
    assert summary['metadata']['layouts']==full['metadata']['layouts']
    assert summary['metadata']['colors']==full['metadata']['colors']
    assert not {'manifest','package','slide_examples'} & summary['metadata'].keys()
    assert summary['metadata']['assets'][0]['data'].startswith('/api/templates/tech/assets/image1')
    assert template==before and full['metadata']['assets'][0]['data'].startswith('data:')


@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(settings,'database',tmp_path/'db.sqlite3')
    monkeypatch.setattr(settings,'storage',tmp_path/'storage')
    monkeypatch.setattr(settings,'email_verification_required',False)
    with TestClient(app) as client: yield client


def test_summary_is_opt_in_and_builtin_asset_bytes_are_public(client):
    db.template_save('tech','Demo',None,sample_template()['metadata'])
    full=next(t for t in client.get('/api/public/templates').json() if t['id']=='tech')
    summary=next(t for t in client.get('/api/public/templates?summary=true').json() if t['id']=='tech')
    asset=client.get(summary['metadata']['assets'][0]['data'])
    assert full['metadata']['assets'][0]['data'].startswith('data:')
    assert asset.status_code==200 and asset.content==b'hello'
    assert asset.headers['content-type']=='image/png'
    assert 'private' in asset.headers['cache-control']


def test_private_assets_require_owner_even_with_known_url(client):
    def register(email):
        result=client.post('/api/auth/register',json={'email':email,'password':'Example-password-387','first_name':'Test','last_name':'Owner'})
        assert result.status_code==201
        return result.json()['user']['id']
    owner=register('owner@example.test')
    db.template_save('private-template','Private',None,sample_template()['metadata'],owner)
    url='/api/templates/private-template/assets/image1'
    response=client.get(url)
    assert response.content==b'hello'
    validator={'If-None-Match':response.headers['etag']}
    assert client.get(url,headers=validator).status_code==304
    client.cookies.clear()
    assert client.get(url,headers=validator).status_code==404
    register('other@example.test')
    assert client.get(url).status_code==404
    assert client.get('/api/templates/tech/assets/unknown').status_code==404


def test_optimized_thumbnail_is_bounded_lossless_cached_and_keeps_original(tmp_path,monkeypatch):
    original=tmp_path/'original.png'
    image=Image.new('RGB',(2560,1440),'#2753a9');image.putpixel((5,5),(17,28,39));image.save(original)
    monkeypatch.setattr(template_preview,'thumbnail',lambda _:original)
    result=template_preview.optimized_thumbnail(tmp_path/'source.pptx')
    expected=image.copy();expected.thumbnail((1600,1600),Image.Resampling.LANCZOS)
    with Image.open(result) as actual:
        assert actual.size==expected.size and actual.convert('RGB').tobytes()==expected.tobytes()
    assert result.suffix=='.webp' and original.is_file()
    modified=result.stat().st_mtime_ns
    assert template_preview.optimized_thumbnail(tmp_path/'source.pptx').stat().st_mtime_ns==modified


def test_optimized_cover_has_explicit_webp_type_and_retains_access_checks(client,tmp_path,monkeypatch):
    path=tmp_path/'preview.webp';Image.new('RGB',(320,180),'navy').save(path,format='WEBP',lossless=True)
    db.template_save('tech','Demo',str(tmp_path/'not-present.pptx'),sample_template()['metadata'])
    monkeypatch.setattr('app.main.optimized_thumbnail',lambda _:path)
    result=client.get('/api/templates/tech/thumbnail?optimized=true')
    assert result.status_code==200 and result.headers['content-type']=='image/webp'
    assert result.content==path.read_bytes()
