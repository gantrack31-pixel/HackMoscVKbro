"""Cached first-slide previews. Never fabricate a cover for an uploaded PPTX."""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from time import monotonic
from zipfile import ZipFile, ZIP_DEFLATED
import os
import posixpath
import shutil
import subprocess
from lxml import etree
from PIL import Image
from ..config import settings
from .pptx_security import validate_pptx_archive
from .template_parser import NORMALIZATION_VERSION

PREVIEW_VERSION='first-slide-3'
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
        image.load();image.thumbnail((2560,2560),Image.Resampling.LANCZOS)
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
            subprocess.run([poppler,'-f','1','-singlefile','-scale-to','2560','-png',str(work/'source.pdf'),str(work/'slide')],
                           check=True,timeout=20,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            return clean_png((work/'slide.png').read_bytes())
    # If server rendering is unavailable, use high-resolution slide artwork rather
    # than enlarging PowerPoint's often tiny 256px docProps/thumbnail preview.
    with ZipFile(path) as archive:
        names=set(archive.namelist())
        presentation=etree.fromstring(archive.read('ppt/presentation.xml'),
                                      etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
        size=presentation.xpath('//*[local-name()="sldSz"]')
        if size:
            slide_width=int(size[0].get('cx','0'));slide_height=int(size[0].get('cy','0'))
            presentation_rels='ppt/_rels/presentation.xml.rels'
            if presentation_rels in names and slide_width>0 and slide_height>0:
                relationships=etree.fromstring(archive.read(presentation_rels),
                                               etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
                # Presentation relationship ids use the OOXML relationships namespace.
                relationship_ids=presentation.xpath('//*[local-name()="sldId"]/@r:id',
                    namespaces={'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'})
                rel_map={item.get('Id'):item.get('Target') for item in relationships
                         if item.get('TargetMode')!='External'}
                slide_target=rel_map.get(relationship_ids[0]) if relationship_ids else None
                slide_path=posixpath.normpath(posixpath.join('ppt',slide_target or ''))
                rel_path=posixpath.join('ppt/slides/_rels',posixpath.basename(slide_path)+'.rels')
            else:
                slide_path=rel_path=''
            if slide_path in names and rel_path in names and slide_width>0 and slide_height>0:
                relationships=etree.fromstring(archive.read(rel_path),
                                               etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
                targets={item.get('Id'):item.get('Target') for item in relationships
                         if item.get('TargetMode')!='External'}
                slide=etree.fromstring(archive.read(slide_path),
                                       etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
                candidates=[]
                for picture in slide.xpath('//*[local-name()="pic"]'):
                    embeds=picture.xpath('.//*[local-name()="blip"]/@*[local-name()="embed"]')
                    transforms=picture.xpath('./*[local-name()="spPr"]/*[local-name()="xfrm"] | ./*[local-name()="spPr"]/*[local-name()="custGeom"]/*[local-name()="avLst"]/..')
                    if not embeds or not transforms or embeds[0] not in targets: continue
                    offsets=transforms[0].xpath('./*[local-name()="off"]')
                    extents=transforms[0].xpath('./*[local-name()="ext"]')
                    if not offsets or not extents: continue
                    x,y=int(offsets[0].get('x','0')),int(offsets[0].get('y','0'))
                    width,height=int(extents[0].get('cx','0')),int(extents[0].get('cy','0'))
                    coverage=max(0,min(slide_width,x+width)-max(0,x))*max(0,min(slide_height,y+height)-max(0,y))/(slide_width*slide_height)
                    if coverage<0.8 or abs(width/height-slide_width/slide_height)>0.08: continue
                    target=posixpath.normpath(posixpath.join('ppt/slides',targets[embeds[0]]))
                    if target.startswith('../') or target not in names: continue
                    try:
                        with Image.open(BytesIO(archive.read(target))) as image:
                            if image.width>=1000 and image.height>=560 and image.width*image.height<=25_000_000:
                                candidates.append((coverage,image.width*image.height,archive.read(target)))
                    except (OSError,ValueError,Image.DecompressionBombError):
                        continue
                if candidates:
                    return clean_png(max(candidates,key=lambda item:(item[0],item[1]))[2])
        # Never upscale a small embedded thumbnail; it has no recoverable detail.
        for name in ('docProps/thumbnail.png','docProps/thumbnail.jpeg','docProps/thumbnail.jpg'):
            if name in archive.namelist() and archive.getinfo(name).file_size<4_000_000:
                with Image.open(BytesIO(archive.read(name))) as image:
                    if max(image.size)>=960:
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
