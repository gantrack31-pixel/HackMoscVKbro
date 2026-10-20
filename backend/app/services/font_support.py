"""Portable TrueType faces shared by measurement, browser and Office export."""
import base64
from contextvars import ContextVar
from functools import lru_cache, wraps
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import re
import struct
from threading import RLock

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont, TTFontFile, TTFError

_active = ContextVar('deckly_font_metadata', default={})
_lock = RLock()


def font_info(data):
    if len(data) < 12 or len(data) > 2*1024*1024 or data[:4] not in {b'\x00\x01\x00\x00', b'true'}:
        raise ValueError('Шрифт: загрузите статический TrueType TTF до 2 МБ; CFF/WOFF и коллекции не поддерживаются.')
    count = struct.unpack_from('>H', data, 4)[0]
    if not 1 <= count <= 128 or 12+16*count > len(data): raise ValueError('Повреждена таблица шрифта.')
    tables = {}
    for i in range(count):
        tag, _, offset, size = struct.unpack_from('>4sIII', data, 12+16*i)
        if offset+size > len(data): raise ValueError('Повреждена таблица шрифта.')
        tables[tag] = (offset, size)
    if b'fvar' in tables: raise ValueError('Экспортируйте статические начертания variable-шрифта в TTF.')
    if not {b'OS/2', b'name', b'head', b'cmap', b'glyf'} <= tables.keys(): raise ValueError('Шрифт не содержит TrueType-контуров.')
    os2, length = tables[b'OS/2']
    if length < 64: raise ValueError('Повреждена таблица OS/2 шрифта.')
    if struct.unpack_from('>H', data, os2+8)[0] & 0x0206:
        raise ValueError('Лицензионные флаги шрифта запрещают редактируемое встраивание.')
    weight = struct.unpack_from('>H', data, os2+4)[0]
    italic = bool(struct.unpack_from('>H', data, os2+62)[0] & 1)
    offset, size = tables[b'name']
    _, count, storage = struct.unpack_from('>3H', data, offset)
    if 6+12*count > size: raise ValueError('Повреждены имена шрифта.')
    names = {}
    for i in range(count):
        platform, encoding, language, ident, size_name, relative = struct.unpack_from('>6H', data, offset+6+12*i)
        start = offset+storage+relative
        if start+size_name > offset+size: raise ValueError('Повреждены имена шрифта.')
        if platform == 3 and encoding in (1, 10) and language in (0, 0x409):
            names[ident] = data[start:start+size_name].decode('utf-16-be')
    family = names.get(16) or names.get(1)
    if not family or not re.fullmatch(r'[\w .()+-]{1,100}', family): raise ValueError('Некорректное имя семейства шрифта.')
    return family, max(100, min(900, weight)), 'italic' if italic else 'normal'


def read_font(data, name):
    family, weight, style = font_info(data)
    TTFontFile(BytesIO(data))  # Validate the actual cmap and glyph tables in the worker.
    return {'family': family, 'weight': weight, 'style': style, 'name': Path(name).name,
            'sha256': sha256(data).hexdigest(), 'src': 'data:font/ttf;base64,'+base64.b64encode(data).decode()}


def normalized(family):
    return re.sub(r'[^\w]', '', family).casefold()


@lru_cache(maxsize=1)
def _system_fonts():
    result = []
    for directory in ('/usr/share/fonts', '/usr/local/share/fonts', '/Library/Fonts', '/System/Library/Fonts/Supplemental'):
        for path in sorted(Path(directory).rglob('*.ttf')):
            try:
                family, weight, style = font_info(path.read_bytes())
                result.append((family, weight, style, path))
            except (OSError, ValueError, struct.error, UnicodeError): continue
    return result


def system_assets(family):
    result = []
    for name, weight, style, path in _system_fonts():
        if normalized(name) != normalized(family): continue
        try: result.append(read_font(path.read_bytes(), path.name))
        except (OSError, ValueError, TTFError): continue
        if len(result) >= 4: break
    return result


def current_metadata():
    return _active.get()


def set_metadata(metadata):
    _active.set(metadata)


def family_for(role='body', family=None):
    metadata = current_metadata()
    requested = family or metadata.get('heading_font' if role == 'title' else 'body_font') or metadata.get('font', 'Manrope')
    for asset in metadata.get('font_assets', []):
        if normalized(asset['family']) == normalized(requested): return asset['family']
    return 'Manrope'


def pdf_font(family=None, bold=False):
    if family and family.startswith('DecklyFont') and family in pdfmetrics.getRegisteredFontNames(): return family
    family = family_for(family=family)
    faces = [face for face in current_metadata().get('font_assets', []) if face['family'] == family and face['style'] == 'normal']
    if not faces: return 'DecklyBold' if bold else 'Deckly'
    face = min(faces, key=lambda face: abs(face['weight']-(700 if bold else 400)))
    alias = 'DecklyFont'+face['sha256']
    with _lock:
        if alias not in pdfmetrics.getRegisteredFontNames():
            font = TTFont(alias, BytesIO(base64.b64decode(face['src'].split(',',1)[1])))
            font.face.name = alias.encode('ascii')
            pdfmetrics.registerFont(font)
    return alias


def css_family(family):
    faces = [face['sha256'] for face in current_metadata().get('font_assets', []) if face['family'] == family]
    return 'DecklyBrand'+sha256(''.join(sorted(faces)).encode()).hexdigest()[:24] if faces else family


def supports_text(alias, text):
    face = pdfmetrics.getFont(alias).face
    return all(ord(char) in face.charToGlyph for char in text if not char.isspace())


def text_fonts(role='body', family=None, bold=False, text=None):
    requested = family or current_metadata().get('heading_font' if role == 'title' else 'body_font') or current_metadata().get('font', 'Manrope')
    family = family_for(role, family)
    if text is not None and family != 'Manrope' and not supports_text(pdf_font(family, bold), str(text)):
        family = 'Manrope'
    return {'font_family': requested, 'effective_font_family': family, 'css_font_family': css_family(family),
            'pdf_font': pdf_font(family, bold)}


def font_css(faces):
    return ''.join('@font-face{font-family:"'+face['css_family']+'";src:url("'+face['src']+'") format("truetype");font-weight:'+str(face['weight'])+';font-style:'+face['style']+';}' for face in faces)


def font_scope(function):
    @wraps(function)
    def render(slide, metadata, *args, **kwargs):
        token = _active.set(metadata)
        try:
            scene = function(slide, metadata, *args, **kwargs)
            scene['font_faces'] = [{**face, 'css_family': css_family(face['family'])} for face in current_metadata().get('font_assets', [])]
            missing = {node['font_family'] for node in [*scene['objects'],*scene.get('render_objects',[])]
                       if node['type']=='text' and node.get('font_family','Manrope')!=node.get('effective_font_family','Manrope')}
            scene['font_warnings'] = list(dict.fromkeys([*scene.get('font_warnings',[]),
                *(f'Шрифт «{family}» заменён на Manrope для части текста: нет доступного начертания с нужными символами.' for family in sorted(missing))]))
            return scene
        finally: _active.reset(token)
    return render
