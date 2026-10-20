"""Embed the two bundled, editable Manrope faces using Office's EOT font parts.

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
        if platform == 3 and language == 0x409 and encoding in (1, 10):
            start = name_offset+storage+offset
            names[name_id] = font[start:start+length].decode('utf-16-be').encode('utf-16-le')
    strings = b''.join(struct.pack('<HH', 0, len(names[name_id])) + names[name_id] for name_id in (1, 2, 5, 4))
    # Padding5 and an empty RootString; Office for Mac ignores the v1 form.
    data = header + strings + struct.pack('<HH', 0, 0) + font
    return struct.pack('<I', len(data)) + data[4:]


def embed_manrope(presentation):
    root = presentation._element
    fonts = root.find(qn('p:embeddedFontLst'))
    if fonts is None:
        fonts = OxmlElement('p:embeddedFontLst')
        root.insert_element_before(fonts, 'p:custDataLst', 'p:kinsoku', 'p:defaultTextStyle', 'p:modifyVerifier', 'p:extLst')
    # Keep every other embedded template font, with only one entry for Manrope.
    entry = next((node for node in fonts if node.find(qn('p:font')).get('typeface') == 'Manrope'), None)
    if entry is None:
        entry = OxmlElement('p:embeddedFont')
        face = OxmlElement('p:font')
        face.set('typeface', 'Manrope')
        entry.append(face)
        fonts.append(entry)
    for style, filename in (('regular', 'Manrope-Regular.ttf'), ('bold', 'Manrope-Bold.ttf')):
        previous = entry.find(qn('p:' + style))
        if previous is not None:
            entry.remove(previous)
            rid = previous.get(qn('r:id'))
            if not any(node.get(qn('r:id')) == rid for node in root.iter()):
                presentation.part.drop_rel(rid)
        package = presentation.part.package
        part = Part(package.next_partname('/ppt/fonts/font%d.fntdata'), 'application/x-fontdata', package, _font_data(filename))
        face = OxmlElement('p:' + style)
        face.set(qn('r:id'), presentation.part.relate_to(part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font'))
        # Style order is regular, bold, italic, boldItalic.
        entry.insert(1 if style == 'regular' else 2, face)
    root.set('embedTrueTypeFonts', '1')
    root.set('saveSubsetFonts', '0')
