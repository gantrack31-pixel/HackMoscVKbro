"""Inventory every original OPC part; bounded previews never replace originals."""
import base64
from collections import Counter
from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile
from lxml import etree
from PIL import Image


def inspect_package(path):
    parts, primitives, themes, backgrounds, assets = [], [], [], [], []
    fonts, seen_images = set(), set()
    preview_bytes = 0
    with ZipFile(path) as archive:
        for info in archive.infolist():
            if info.is_dir(): continue
            payload = archive.read(info.filename)
            digest = sha256(payload).hexdigest()
            parts.append({'name':info.filename,'size':len(payload),'sha256':digest})
            if info.filename.startswith('ppt/media/'):
                if digest in seen_images: continue
                seen_images.add(digest)
                asset = {'id':digest[:16],'name':info.filename.rsplit('/',1)[-1],
                         'original_part':info.filename,'sha256':digest,'description':'',
                         'slide':-1,'data':'','preview_available':False}
                # Resource budget limits only web thumbnails, not retained source parts.
                try:
                    with Image.open(BytesIO(payload)) as im:
                        if im.width*im.height <= 25_000_000 and preview_bytes < 8_000_000:
                            im.thumbnail((512,512))
                            out = BytesIO(); im.convert('RGBA').save(out,format='PNG',optimize=True)
                            if len(out.getvalue()) <= 200_000:
                                asset['data'] = 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()
                                asset['preview_available'] = True
                                preview_bytes += len(out.getvalue())
                except (OSError, ValueError, Image.DecompressionBombError):
                    pass
                assets.append(asset)
            if not info.filename.startswith('ppt/') or not info.filename.endswith('.xml'): continue
            root = etree.fromstring(payload, etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
            counts = Counter()
            for node in root.iter():
                if not isinstance(node.tag,str): continue
                name = etree.QName(node).localname
                if name in {'sp','pic','grpSp','cxnSp','graphicFrame','custGeom','prstGeom','solidFill','gradFill','blipFill'}:
                    counts[name] += 1
                if node.get('typeface') and not node.get('typeface').startswith('+'):
                    fonts.add(node.get('typeface'))
                if name == 'bg':
                    backgrounds.append({'part':info.filename,'xml':etree.tostring(node,encoding='unicode')})
            if counts: primitives.append({'part':info.filename,'counts':dict(counts)})
            if info.filename.startswith('ppt/theme/'):
                themes.append({'part':info.filename,'colors':[
                    {'type':etree.QName(n).localname,'value':n.get('val'),'fallback':n.get('lastClr')}
                    for n in root.iter() if isinstance(n.tag,str) and etree.QName(n).localname in {'srgbClr','sysClr'}],
                    'fonts':{role:root.xpath(f'string(//*[local-name()="{role}"]/*[local-name()="latin"]/@typeface)')
                             for role in ('majorFont','minorFont')}})
    return {'parts':parts,'primitives':primitives,'themes':themes,'backgrounds':backgrounds,
            'fonts':sorted(fonts),'assets':assets,'retention':'original_opc_package',
            'preview_complete':False}
