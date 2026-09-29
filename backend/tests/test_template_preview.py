from io import BytesIO
from zipfile import ZipFile
from PIL import Image
from pptx import Presentation
from app.config import settings
from app.services import template_preview as preview

def fixture_pptx(path,color):
    prs=Presentation();prs.slides.add_slide(prs.slide_layouts[6]);prs.save(path)
    image=BytesIO();Image.new('RGB',(320,180),color).save(image,format='PNG')
    with ZipFile(path,'a') as archive: archive.writestr('docProps/thumbnail.png',image.getvalue())

def test_embedded_real_preview_is_cached_and_content_hash_invalidates(tmp_path,monkeypatch):
    monkeypatch.setattr(settings,'storage',tmp_path/'storage')
    monkeypatch.setattr(preview.shutil,'which',lambda _:None)
    path=tmp_path/'template.pptx';fixture_pptx(path,'red')
    first=preview.thumbnail(path)
    assert Image.open(first).getpixel((20,20))==(255,0,0)
    original=preview.render_first_slide
    def unexpected(_): raise AssertionError('Cache must avoid reconversion')
    monkeypatch.setattr(preview,'render_first_slide',unexpected)
    assert preview.thumbnail(path)==first
    monkeypatch.setattr(preview,'render_first_slide',original)
    fixture_pptx(path,'blue')
    second=preview.thumbnail(path)
    assert second!=first and Image.open(second).getpixel((20,20))==(0,0,255)

def test_unavailable_preview_is_explicit_and_briefly_negative_cached(tmp_path,monkeypatch):
    monkeypatch.setattr(settings,'storage',tmp_path/'storage')
    path=tmp_path/'template.pptx';Presentation().save(path)
    calls=[]
    monkeypatch.setattr(preview,'render_first_slide',lambda p:calls.append(p))
    assert preview.thumbnail(path) is None and preview.thumbnail(path) is None
    assert len(calls)==1 and preview.thumbnail(tmp_path/'missing.pptx') is None

def test_libreoffice_conversion_uses_first_page_isolated_profile_and_no_external_links(tmp_path,monkeypatch):
    monkeypatch.setattr(preview.shutil,'which',lambda cmd:cmd)
    path=tmp_path/'template.pptx';Presentation().save(path)
    with ZipFile(path,'a') as archive:
        archive.writestr('ppt/external.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" TargetMode="External" Target="https://example.test/image" Type="image"/></Relationships>')
    calls=[]
    def run(args,**kwargs):
        calls.append(args)
        assert kwargs['timeout']<=45 and kwargs['check']
        if args[0]=='libreoffice':
            assert any('PageRange' in a for a in args) and any(a.startswith('-env:UserInstallation=') for a in args)
            with ZipFile(args[-1]) as safe: assert b'example.test' not in safe.read('ppt/external.rels')
        else:
            assert args[1:4]==['-f','1','-singlefile']
            Image.new('RGB',(320,180),'green').save(args[-1]+'.png')
    monkeypatch.setattr(preview.subprocess,'run',run)
    data=preview.render_first_slide(path)
    assert Image.open(BytesIO(data)).size==(320,180) and len(calls)==2
