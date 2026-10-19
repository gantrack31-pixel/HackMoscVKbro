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

PREVIEW_VERSION='first-slide-4-faithful'
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

def office_preview(path):
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
    return None


def read_xml(archive, part):
    return etree.fromstring(archive.read(part), etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))


def related_parts(archive, part):
    rel_path=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    if rel_path not in archive.namelist(): return {}
    result={}
    for item in read_xml(archive,rel_path):
        if item.get('TargetMode')=='External': continue
        target=posixpath.normpath(posixpath.join(posixpath.dirname(part),item.get('Target',''))).lstrip('/')
        if not target.startswith('../') and target in archive.namelist(): result[item.get('Id')]=target
    return result


def picture_only_cover(archive, slide_path, slide_width, slide_height):
    """A background image is not a rendering of text/shapes placed over it."""
    slide=read_xml(archive,slide_path)
    trees=slide.xpath('./*[local-name()="cSld"]/*[local-name()="spTree"]')
    if not trees: return None
    shapes=[node for node in trees[0] if etree.QName(node).localname not in {'nvGrpSpPr','grpSpPr','extLst'}]
    if len(shapes)!=1 or etree.QName(shapes[0]).localname!='pic': return None
    picture=shapes[0]
    transforms=picture.xpath('./*[local-name()="spPr"]/*[local-name()="xfrm"]')
    if len(transforms)!=1: return None
    transform=transforms[0]
    if any(transform.get(key,'0') not in {'0','false'} for key in ('rot','flipH','flipV')): return None
    offsets=transform.xpath('./*[local-name()="off"]')
    extents=transform.xpath('./*[local-name()="ext"]')
    if len(offsets)!=1 or len(extents)!=1: return None
    geometry=(int(offsets[0].get('x','0')),int(offsets[0].get('y','0')),
              int(extents[0].get('cx','0')),int(extents[0].get('cy','0')))
    if geometry!=(0,0,slide_width,slide_height): return None
    # Cropping, effects, tiling, borders and nonrectangular clips need a renderer.
    for node in picture.iter():
        name=etree.QName(node).localname
        if node.get('hidden','0') not in {'0','false'}: return None
        if name in {'srcRect','fillRect'} and any(int(v)!=0 for v in node.attrib.values()): return None
        if name in {'tile','custGeom','ln','effectDag'}: return None
        if name=='effectLst' and len(node): return None
        if name=='prstGeom' and node.get('prst')!='rect': return None
        if name=='blip' and any(etree.QName(child).localname!='extLst' for child in node): return None
    embeds=picture.xpath('.//*[local-name()="blip"]/@*[local-name()="embed"]')
    target=related_parts(archive,slide_path).get(embeds[0]) if len(embeds)==1 else None
    if not target: return None
    with Image.open(BytesIO(archive.read(target))) as image:
        if image.width<1000 or image.height<560 or image.width*image.height>25_000_000: return None
        image.load()
        rgba=image.convert('RGBA')
        if rgba.getchannel('A').getextrema()[0]!=255: return None
        # An opaque exact-cover picture obscures inherited master artwork. Match
        # PowerPoint's actual stretch while never enlarging the source pixels.
        ratio=slide_width/slide_height
        width=max(1,min(image.width,2560,round(min(image.height,2560)*ratio)))
        height=max(1,min(image.height,2560,round(width/ratio)))
        output=BytesIO()
        image.convert('RGB').resize((width,height),Image.Resampling.LANCZOS).save(output,format='PNG',optimize=True)
        return output.getvalue()


def fallback_cover(path):
    """Use a genuine embedded thumbnail or a provably complete raster slide."""
    with ZipFile(path) as archive:
        names=set(archive.namelist())
        presentation=read_xml(archive,'ppt/presentation.xml')
        size=presentation.xpath('//*[local-name()="sldSz"]')
        if not size: return None
        slide_width=int(size[0].get('cx','0'));slide_height=int(size[0].get('cy','0'))
        if slide_width<=0 or slide_height<=0: return None
        # Never upscale a small embedded thumbnail; it has no recoverable detail.
        for name in ('docProps/thumbnail.png','docProps/thumbnail.jpeg','docProps/thumbnail.jpg'):
            if name in names and archive.getinfo(name).file_size<4_000_000:
                with Image.open(BytesIO(archive.read(name))) as image:
                    if max(image.size)>=960 and abs(image.width/image.height-slide_width/slide_height)<0.025:
                        return clean_png(archive.read(name))
        relationship_ids=presentation.xpath('//*[local-name()="sldId"]/@r:id',
            namespaces={'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'})
        parts=related_parts(archive,'ppt/presentation.xml')
        slide_path=parts.get(relationship_ids[0]) if relationship_ids else None
        if slide_path:
            return picture_only_cover(archive,slide_path,slide_width,slide_height)
    return None


def render_first_slide(path):
    try: rendered=office_preview(path)
    except (OSError,ValueError,subprocess.SubprocessError,Image.DecompressionBombError,etree.XMLSyntaxError): rendered=None
    return rendered if rendered else fallback_cover(path)

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


def optimized_thumbnail(path):
    """Cache a lossless WebP for cards; retain the original PNG for full-size clients."""
    original=thumbnail(path)
    if original is None: return None
    target=original.with_name(original.stem+'.card-v1.webp')
    if target.is_file(): return target
    with _render_lock:
        if target.is_file(): return target
        try:
            with Image.open(original) as image:
                image.thumbnail((1600,1600),Image.Resampling.LANCZOS)
                temporary=target.with_suffix('.tmp')
                image.convert('RGB').save(temporary,format='WEBP',lossless=True,method=4)
                temporary.replace(target)
        except (OSError,ValueError):
            return original
    return target
