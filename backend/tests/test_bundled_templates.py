from hashlib import sha256
from io import BytesIO
from pathlib import Path
import pytest
from app import database as db
from app.config import settings
from app.main import get_template
from app.services.bundled_templates import PACK, PACK_ROOT, seed_pack
from app.services.templates import BUILTIN_IDS
from app.services.pptx_security import validate_pptx_archive
from app.services.export import export_pptx
from app.models import DeckContent, Slide
from pptx import Presentation
from test_assistant import client


def test_pack_integrity_and_unique_sources():
    assert len(PACK) == 24
    assert len({item['id'] for item in PACK}) == 24
    for item in PACK:
        path=PACK_ROOT / item['file']
        assert path.resolve().parent == PACK_ROOT.resolve()
        assert sha256(path.read_bytes()).hexdigest() == item['metadata']['file_fingerprint']
        validate_pptx_archive(path)
        assert item['id'] in BUILTIN_IDS


def test_shared_pack_is_seeded_once_and_relocated_without_losing_analysis(client, monkeypatch):
    item=PACK[0]
    before=db.template_get(item['id'])
    assert before['user_id'] is None
    seed_pack()
    assert db.template_get(item['id']) == before
    metadata={**before['metadata'],'analysis_marker':'retained'}
    db.template_save(item['id'],item['name'],'old-machine/source.pptx',metadata)
    seed_pack()
    after=db.template_get(item['id'])
    assert after['path'] == str(PACK_ROOT/item['file'])
    assert after['metadata']['analysis_marker'] == 'retained'
    response=client.get('/api/public/templates?summary=true')
    rows=[t for t in response.json() if t['id'].startswith('pack-')]
    assert len(rows) == 24
    assert all('path' not in row and 'user_id' not in row for row in rows)
    assert all(row['metadata']['category']=='Пак презентаций' for row in rows)


def test_pack_covers_do_not_analyze_originals(client, monkeypatch):
    import app.main as main
    def unexpected(*args, **kwargs):
        raise AssertionError('A gallery cover must not parse PPTX')
    monkeypatch.setattr(main,'analyze_template',unexpected)
    for item in PACK:
        response=client.get(f"/api/templates/{item['id']}/thumbnail?optimized=true")
        assert response.status_code == 200, item['name']
        assert response.headers['content-type'].startswith('image/')


@pytest.mark.parametrize('name', ['Forest · Лес', 'Every · Минимализм', 'Eco Environment · Синий'])
def test_selection_analyzes_original_and_preserves_pack_identity(client, name):
    item=next(item for item in PACK if item['name']==name)
    template=get_template(item['id'])
    assert template['metadata']['manifest']
    assert template['metadata']['bundled_pack']
    assert template['metadata']['category']=='Пак презентаций'
    response=client.get(f"/api/templates/{item['id']}/original")
    assert response.status_code == 200
    assert sha256(response.content).hexdigest()==item['metadata']['file_fingerprint']
    content=DeckContent(title='Проверка пакета',slides=[Slide(title='Сохраняем стиль',body='Исходные макеты доступны для новой презентации.')])
    exported=export_pptx(content,template,'a')
    result=Presentation(BytesIO(exported))
    assert len(result.slides)==1
    assert int(result.slide_width)==item['metadata']['width_emu']
