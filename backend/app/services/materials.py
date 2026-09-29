"""Bounded, non-executing import of a user's content packet."""
from io import BytesIO
from pathlib import PurePath
from zipfile import ZipFile, BadZipFile
import hashlib
import json
import mimetypes
import re
import unicodedata
from lxml import etree
from pypdf import PdfReader
from fastapi import HTTPException
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_PACKET_CHARS = 50000
TEXT_FORMATS = {'.txt', '.md', '.csv', '.docx', '.pdf', '.pptx'}
IMAGE_FORMATS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
FONT_FORMATS = {'.ttf', '.otf', '.woff', '.woff2'}
ICON_FORMATS = {'.svg', '.ico'}
FORMATS = TEXT_FORMATS | IMAGE_FORMATS | FONT_FORMATS | ICON_FORMATS | {'.zip', '.json'}
RESOURCE_KINDS = {'document', 'image', 'icon', 'icon_pack', 'font', 'palette'}

def resource_kind(name, data):
    suffix = PurePath(name).suffix.lower()
    if suffix in TEXT_FORMATS: return 'document'
    if suffix in IMAGE_FORMATS: return 'image'
    if suffix in FONT_FORMATS: return 'font'
    if suffix in ICON_FORMATS: return 'icon'
    if suffix == '.json': return 'palette'
    if suffix == '.zip':
        try:
            with ZipFile(BytesIO(data)) as archive:
                names=[entry.filename.lower() for entry in archive.infolist() if not entry.is_dir()]
                if names and any(PurePath(item).suffix in ICON_FORMATS or PurePath(item).suffix in IMAGE_FORMATS for item in names):
                    return 'icon_pack'
        except (BadZipFile, ValueError):
            pass
    return 'document'

def _font_metadata(name, data):
    suffix=PurePath(name).suffix.lower()
    stem=PurePath(name).stem.replace('_',' ').replace('-',' ').strip() or 'Uploaded font'
    lower=stem.lower()
    weight='bold' if any(token in lower for token in ('bold','semibold','demi','black')) else 'normal'
    style='italic' if 'italic' in lower or 'oblique' in lower else 'normal'
    return {'family':stem, 'weight':weight, 'style':style, 'format':suffix[1:], 'bytes':len(data),
            'roles':['heading','body'] if weight=='normal' else ['heading','emphasis']}

def _palette_metadata(name, data):
    try:
        value=json.loads(data.decode('utf-8-sig'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        value={}
    colors=[]
    roles={}
    if isinstance(value,dict):
        raw=value.get('colors', value)
        if isinstance(raw,dict):
            for key,color in raw.items():
                if isinstance(color,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',color):
                    roles[str(key)[:40]]=color.upper(); colors.append(color.upper())
        elif isinstance(raw,list): colors=[c.upper() for c in raw if isinstance(c,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',c)]
    elif isinstance(value,list): colors=[c.upper() for c in value if isinstance(c,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',c)]
    if not colors:
        try: colors=[c.upper() for c in re.findall(r'#[0-9a-fA-F]{6}',data.decode('utf-8'))]
        except UnicodeDecodeError: pass
    return {'name':PurePath(name).stem[:120], 'colors':list(dict.fromkeys(colors))[:24], 'roles':roles}

def _binary_metadata(name, data, kind):
    suffix=PurePath(name).suffix.lower()
    result={'kind':kind,'format':suffix[1:] or 'unknown','bytes':len(data),'mime':mimetypes.guess_type(name)[0] or 'application/octet-stream'}
    if kind=='image':
        try:
            with Image.open(BytesIO(data)) as image:
                if image.width*image.height>25_000_000: raise ValueError('image limits')
                stem=PurePath(name).stem.lower()
                role='logo' if 'logo' in stem or 'логотип' in stem else 'reference' if any(x in stem for x in ('ref','reference','референ')) else 'image'
                result.update(width=image.width,height=image.height,mode=image.mode,format=image.format or suffix[1:].upper(),role=role)
        except Exception as exc: raise HTTPException(422,'Не удалось прочитать изображение. Проверьте формат и размер.') from exc
    elif kind=='icon_pack':
        try:
            with ZipFile(BytesIO(data)) as archive:
                entries=[]
                for item in archive.infolist():
                    if item.is_dir() or len(entries)>=120: continue
                    ext=PurePath(item.filename).suffix.lower()
                    if ext in ICON_FORMATS|IMAGE_FORMATS:
                        stem=PurePath(item.filename).stem[:80]
                        entries.append({'id':re.sub(r'[^a-zA-Z0-9_-]+','_',stem).strip('_').lower() or f'icon_{len(entries)+1}',
                                         'name':stem,'format':ext[1:]})
                if not entries: raise ValueError('empty icon pack')
                result['icons']=entries
        except (BadZipFile, ValueError, OSError) as exc: raise HTTPException(422,'Не удалось прочитать набор иконок.') from exc
    elif kind=='font': result.update(_font_metadata(name,data))
    elif kind=='palette': result.update(_palette_metadata(name,data))
    elif kind=='icon': result['icon_id']=re.sub(r'[^a-zA-Z0-9_-]+','_',PurePath(name).stem).strip('_').lower()[:80]
    return result

def process_material(name, data):
    """Parse one upload once; binary resources are catalogued without sending bytes to the model."""
    suffix=PurePath(name).suffix.lower()
    if suffix not in FORMATS:
        raise HTTPException(422,'Поддерживаются документы, изображения, SVG/наборы иконок, шрифты и JSON-палитры.')
    if not data or len(data)>MAX_FILE_BYTES:
        raise HTTPException(413,'Каждый файл должен быть непустым и не больше 5 МБ.')
    kind=resource_kind(name,data)
    if kind!='document':
        metadata=_binary_metadata(name,data,kind)
        return {'name':name[:120],'kind':kind,'format':suffix[1:],'characters':0,'warnings':[],
                'sha256':hashlib.sha256(data).hexdigest(),'metadata':metadata,'text':''}
    doc=read_material(name,data)
    doc.update(kind='document',metadata={'kind':'document','format':doc['format'],'characters':doc['characters']})
    return doc

def normalize_text(text):
    text = unicodedata.normalize('NFC', text.replace('\r\n', '\n').replace('\r', '\n'))
    return '\n'.join(re.sub(r'[ \t]+', ' ', line).strip() for line in text.splitlines()
                     if not re.fullmatch(r'\s*', line)).strip()

def read_material(name, data):
    suffix = PurePath(name).suffix.lower()
    if suffix in FORMATS - TEXT_FORMATS:
        return process_material(name, data)
    if suffix not in TEXT_FORMATS:
        raise HTTPException(422, 'Пакет поддерживает TXT, MD, CSV, DOCX, PDF и PPTX.')
    if not data or len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, 'Каждый файл должен быть непустым и не больше 5 МБ.')
    warnings = []
    try:
        if suffix in {'.txt', '.md', '.csv'}:
            try:
                text = data.decode('utf-8-sig')
            except UnicodeDecodeError:
                text = data.decode('cp1251')
                warnings.append('Кодировка Windows-1251 преобразована в UTF-8.')
            if '\x00' in text: raise ValueError('binary')
        elif suffix == '.pptx':
            from pptx import Presentation
            from .pptx_security import validate_pptx_archive
            from .template_context import extract_examples
            validate_pptx_archive(BytesIO(data))
            prs = Presentation(BytesIO(data))
            examples, _ = extract_examples(prs)
            parts = []
            for slide in examples:
                parts.append(f"Слайд {slide['slide']+1}")
                for obj in slide['objects']:
                    if obj.get('text'): parts.append(obj['text'])
                    if obj.get('rows'): parts.extend(' | '.join(row) for row in obj['rows'])
                    if obj.get('series'):
                        parts.append('Категории: '+', '.join(obj.get('categories',[])))
                        parts.extend(s['name']+': '+', '.join(str(v) for v in s['values']) for s in obj['series'])
                    if obj['type']=='picture': parts.append('Изображение: '+(obj.get('description') or obj['name']))
            text='\n'.join(parts)
            warnings.append('Извлечены текст, таблицы и данные графиков первых 12 слайдов. Изображения описаны метаданными PPTX; для использования картинок загрузите PPTX как шаблон.')
        elif suffix == '.docx':
            with ZipFile(BytesIO(data)) as archive:
                entries = archive.infolist()
                if len(entries) > 2000 or sum(e.file_size for e in entries) > 30 * 1024 * 1024:
                    raise ValueError('archive limits')
                if any('vbaproject' in e.filename.lower() for e in entries):
                    raise ValueError('macros')
                xml = archive.read('word/document.xml')
                if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml: raise ValueError('entities')
                root = etree.fromstring(xml, etree.XMLParser(resolve_entities=False, no_network=True))
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                def paragraph_text(paragraph):
                    parts=[]
                    for node in paragraph.xpath('.//w:t|.//w:tab|.//w:br|.//w:cr', namespaces=ns):
                        local=etree.QName(node).localname
                        parts.append(node.text or '' if local=='t' else '\t' if local=='tab' else '\n')
                    return ''.join(parts)
                blocks=[]
                body=root.find('w:body',ns)
                for block in body if body is not None else []:
                    if etree.QName(block).localname=='tbl':
                        for row in block.findall('w:tr',ns):
                            blocks.append(' | '.join(' '.join(paragraph_text(p) for p in cell.findall('.//w:p',ns))
                                                     for cell in row.findall('w:tc',ns)))
                    else:
                        blocks.append(paragraph_text(block))
                text='\n'.join(blocks)
        else:
            pdf = PdfReader(BytesIO(data))
            if pdf.is_encrypted or len(pdf.pages) > 60: raise ValueError('pdf limits')
            parts = []
            for i, page in enumerate(pdf.pages):
                # Avoid unbounded compressed page streams on hostile PDF input.
                content = page.get('/Contents')
                streams = [] if content is None else content.get_object()
                if not isinstance(streams, list): streams = [streams]
                if any(len(getattr(s.get_object(), '_data', b'')) > 2 * 1024 * 1024 for s in streams):
                    raise ValueError('page limits')
                extracted = page.extract_text() or ''
                parts.append(extracted)
                if sum(map(len, parts)) > MAX_PACKET_CHARS: raise ValueError('text limits')
                if not extracted.strip(): warnings.append(f'На странице {i + 1} нет текста; OCR не выполнялся.')
            text = '\n'.join(parts)
        text = normalize_text(text)
        if not text: raise HTTPException(422, 'В файле нет извлекаемого текста. Для скана добавьте текстовую расшифровку.')
        if len(text) > MAX_PACKET_CHARS: raise HTTPException(413, 'В файле больше 50 000 символов. Разделите материал.')
        return {'name': name[:120], 'text': text, 'characters': len(text), 'sha256': hashlib.sha256(data).hexdigest(),
                'format': suffix[1:], 'warnings': warnings}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(422, 'Не удалось безопасно прочитать документ. Проверьте формат, размер и отсутствие шифрования.') from None

def compact_resource(resource):
    """Model-facing metadata: stable IDs and short semantic fields, never paths or binary data."""
    metadata=resource.get('metadata') or {}
    result={'id':resource['id'],'name':resource['name'],'kind':resource['kind'],'format':resource['metadata'].get('format',''),'status':'ready'}
    if resource['kind']=='document': result['characters']=metadata.get('characters',0)
    elif resource['kind']=='image': result.update(width=metadata.get('width'),height=metadata.get('height'),role=metadata.get('role','image'))
    elif resource['kind']=='icon': result['icon_id']=metadata.get('icon_id')
    elif resource['kind']=='icon_pack': result['icons']=metadata.get('icons',[])[:40]
    elif resource['kind']=='font': result.update(family=metadata.get('family'),weight=metadata.get('weight'),style=metadata.get('style'),roles=metadata.get('roles',[]))
    elif resource['kind']=='palette': result.update(colors=metadata.get('colors',[])[:16],roles=metadata.get('roles',{}))
    return result

def image_data(path):
    """Resolve an indexed image to a bounded PNG data URL at render time."""
    import base64
    try:
        with Image.open(path) as image:
            image.thumbnail((1600,1600))
            output=BytesIO(); image.convert('RGBA').save(output,format='PNG',optimize=True)
        encoded=base64.b64encode(output.getvalue()).decode()
        if len(encoded)>1_400_000: return ''
        return 'data:image/png;base64,'+encoded
    except (OSError, ValueError):
        return ''

def icon_pack_data(path, icon_id):
    """Extract one raster icon from an indexed pack; SVG entries remain safe metadata-only fallbacks."""
    import base64
    try:
        with ZipFile(path) as archive:
            for item in archive.infolist():
                if item.is_dir() or PurePath(item.filename).stem.lower() != icon_id.lower(): continue
                if PurePath(item.filename).suffix.lower() not in IMAGE_FORMATS: return ''
                with Image.open(BytesIO(archive.read(item))) as image:
                    image.thumbnail((256,256)); output=BytesIO(); image.convert('RGBA').save(output,format='PNG',optimize=True)
                return 'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode()
    except (BadZipFile, OSError, ValueError):
        return ''
    return ''
