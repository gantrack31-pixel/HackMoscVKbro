"""Cached first-slide previews. Never fabricate a cover for an uploaded PPTX."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from time import monotonic
from zipfile import ZipFile, ZIP_DEFLATED
import os
import shutil
import subprocess
from lxml import etree
from PIL import Image
from ..config import settings
from .pptx_security import validate_pptx_archive
from .template_parser import NORMALIZATION_VERSION

PREVIEW_VERSION='first-slide-1'
_render_lock=Lock()
_failed={}

def cache_key(path):
    digest=sha256((PREVIEW_VERSION+str(NORMALIZATION_VERSION)).encode())
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): digest.update(chunk)
    return digest.hexdigest()

def clean_png(data):
    with Image.open(BytesIO(data)) as image:
        if image.width*image.height>25_000_000: raise ValueError('Preview too large')
        image.load();image.thumbnail((1280,1280))
        out=BytesIO();image.convert('RGB').save(out,format='PNG',optimize=True)
        return out.getvalue()

def render_first_slide(path):
    soffice=shutil.which('libreoffice') or shutil.which('soffice')
    if not soffice and os.name=='nt':
        candidate=Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'LibreOffice/program/soffice.exe'
        if candidate.is_file(): soffice=str(candidate)
    poppler=shutil.which('pdftoppm')
    if soffice and poppler:
        with TemporaryDirectory(prefix='deckly-preview-') as folder:
            work=Path(folder);profile=work/'profile';profile.mkdir()
            (profile/'user').mkdir()
            (profile/'user/registrymodifications.xcu').write_text(
                '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
                '<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>'
                '</oor:items>',encoding='utf-8')
            # Conversion-only copy: no external relationships or remote asset fetches.
            with ZipFile(path) as original, ZipFile(work/'source.pptx','w',ZIP_DEFLATED) as safe:
                for entry in original.infolist():
                    data=original.read(entry)
                    if entry.filename.endswith('.rels'):
                        root=etree.fromstring(data,etree.XMLParser(resolve_entities=False,no_network=True))
                        for child in list(root):
                            if child.get('TargetMode')=='External': root.remove(child)
                        data=etree.tostring(root)
                    safe.writestr(entry.filename,data)
            subprocess.run([soffice,'-env:UserInstallation='+profile.as_uri(),'--headless','--nologo','--nodefault','--norestore',
                '--convert-to','pdf:impress_pdf_Export:{"PageRange":{"type":"string","value":"1"}}',
                '--outdir',folder,str(work/'source.pptx')],check=True,timeout=45,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            subprocess.run([poppler,'-f','1','-singlefile','-scale-to','1280','-png',str(work/'source.pdf'),str(work/'slide')],
                           check=True,timeout=20,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            return clean_png((work/'slide.png').read_bytes())
    # PowerPoint's embedded document thumbnail is an actual image, not our synthetic cover.
    with ZipFile(path) as archive:
        for name in ('docProps/thumbnail.png','docProps/thumbnail.jpeg','docProps/thumbnail.jpg'):
            if name in archive.namelist() and archive.getinfo(name).file_size<4_000_000:
                return clean_png(archive.read(name))
    return None

def thumbnail(path):
    try: key=cache_key(path)
    except OSError: return None
    folder=settings.storage/'previews';folder.mkdir(parents=True,exist_ok=True)
    target=folder/(key+'.png')
    if target.is_file(): return target
    with _render_lock:
        if target.is_file(): return target
        if _failed.get(key,0)>monotonic(): return None
        validate_pptx_archive(Path(path))
        try: data=render_first_slide(Path(path))
        except (OSError,ValueError,subprocess.SubprocessError,Image.DecompressionBombError,etree.XMLSyntaxError): data=None
        if not data:
            if len(_failed)>256: _failed.clear()
            _failed[key]=monotonic()+60
            return None
        temporary=folder/(key+'.tmp');temporary.write_bytes(data);temporary.replace(target)
    return target
