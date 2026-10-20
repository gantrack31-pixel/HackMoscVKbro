"""Embed bundled and uploaded editable TrueType faces using Office EOT parts.

EOT 0x00020001 (uncompressed): https://www.w3.org/submissions/EOT/#Version00020001
PowerPoint uses application/x-fontdata, rather than Word's obfuscated fonts:
https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/1663dabc-5d98-463f-889e-bcd9b77c3d34
"""
from functools import lru_cache
from pathlib import Path
import struct

from pptx.opc.package import Part
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement


@lru_cache(maxsize=2)
def _font_data(filename):
    font = (Path(__file__).parent / filename).read_bytes()
    return eot_data(font)


def eot_data(font):
    count = struct.unpack_from('>H', font, 4)[0]
    tables = {font[12+i*16:16+i*16]: struct.unpack_from('>II', font, 20+i*16)
              for i in range(count)}
    os2_offset, os2_length = tables[b'OS/2']
    os2 = font[os2_offset:os2_offset+os2_length]
    weight, embedding = struct.unpack_from('>H', os2, 4)[0], struct.unpack_from('>H', os2, 8)[0]
    if embedding & 0x0206:
        raise ValueError('Bundled font must allow editable outline embedding')
    italic = struct.unpack_from('>H', os2, 62)[0] & 1
    unicode_ranges = struct.unpack_from('>4I', os2, 42)
    codepages = struct.unpack_from('>2I', os2, 78) if len(os2) >= 86 else (0, 0)
    checksum = struct.unpack_from('>I', font, tables[b'head'][0]+8)[0]
    header = struct.pack('<4I10sBBIHH11I', 0, len(font), 0x00020001, 0,
                         os2[32:42], 1, italic, weight, embedding, 0x504C,
                         *unicode_ranges, *codepages, checksum, 0, 0, 0, 0)
    name_offset = tables[b'name'][0]
    _, name_count, storage = struct.unpack_from('>3H', font, name_offset)
    names = {}
    for i in range(name_count):
        platform, encoding, language, name_id, length, offset = struct.unpack_from('>6H', font, name_offset+6+i*12)
        if platform == 3 and language in (0, 0x409) and encoding in (1, 10):
            start = name_offset+storage+offset
            names[name_id] = font[start:start+length].decode('utf-16-be').encode('utf-16-le')
    names.setdefault(2, 'Regular'.encode('utf-16-le'))
    names.setdefault(5, b'')
    names.setdefault(4, names[1])
    strings = b''.join(struct.pack('<HH', 0, len(names[name_id])) + names[name_id] for name_id in (1, 2, 5, 4))
    # Padding5 and an empty RootString; Office for Mac ignores the v1 form.
    data = header + strings + struct.pack('<HH', 0, 0) + font
    return struct.pack('<I', len(data)) + data[4:]


def embed_font(presentation, family, faces):
    root = presentation._element
    fonts = root.find(qn('p:embeddedFontLst'))
    if fonts is None:
        fonts = OxmlElement('p:embeddedFontLst')
        root.insert_element_before(fonts, 'p:custDataLst', 'p:kinsoku', 'p:defaultTextStyle', 'p:modifyVerifier', 'p:extLst')
    # Keep other embedded template fonts and replace only this family's faces.
    entry = next((node for node in fonts if node.find(qn('p:font')).get('typeface') == family), None)
    if entry is None:
        entry = OxmlElement('p:embeddedFont')
        face = OxmlElement('p:font')
        face.set('typeface', family)
        entry.append(face)
        fonts.append(entry)
    for style, data in faces:
        previous = entry.find(qn('p:' + style))
        if previous is not None:
            entry.remove(previous)
            rid = previous.get(qn('r:id'))
            if not any(node.get(qn('r:id')) == rid for node in root.iter()):
                presentation.part.drop_rel(rid)
        package = presentation.part.package
        part = Part(package.next_partname('/ppt/fonts/font%d.fntdata'), 'application/x-fontdata', package, data)
        face = OxmlElement('p:' + style)
        face.set(qn('r:id'), presentation.part.relate_to(part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'))
        # Style order is regular, bold, italic, boldItalic.
        entry.insert({'regular':1,'bold':2,'italic':3,'boldItalic':4}[style], face)
    root.set('embedTrueTypeFonts', '1')
    root.set('saveSubsetFonts', '0')


def embed_manrope(presentation):
    embed_font(presentation, 'Manrope', [('regular', _font_data('Manrope-Regular.ttf')), ('bold', _font_data('Manrope-Bold.ttf'))])


def embed_brand_fonts(presentation, assets):
    import base64
    for family in sorted({face['family'] for face in assets}):
        choices = {}
        for face in assets:
            if face['family'] != family: continue
            bold, italic = face['weight'] >= 600, face['style'] == 'italic'
            style = 'boldItalic' if bold and italic else 'bold' if bold else 'italic' if italic else 'regular'
            target = 700 if bold else 400
            if style not in choices or abs(face['weight']-target) < abs(choices[style]['weight']-target): choices[style] = face
        embed_font(presentation, family, [(style, eot_data(base64.b64decode(face['src'].split(',',1)[1]))) for style,face in choices.items()])
