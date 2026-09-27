"""Bounded, non-executing import of a user's content packet."""
from io import BytesIO
from pathlib import PurePath
from zipfile import ZipFile, BadZipFile
import hashlib
import re
import unicodedata
from lxml import etree
from pypdf import PdfReader
from fastapi import HTTPException

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_PACKET_CHARS = 50000
FORMATS = {'.txt', '.md', '.csv', '.docx', '.pdf'}

def normalize_text(text):
    text = unicodedata.normalize('NFC', text.replace('\r\n', '\n').replace('\r', '\n'))
    return '\n'.join(re.sub(r'[ \t]+', ' ', line).strip() for line in text.splitlines()
                     if not re.fullmatch(r'\s*', line)).strip()

def read_material(name, data):
    suffix = PurePath(name).suffix.lower()
    if suffix not in FORMATS:
        raise HTTPException(422, 'Пакет поддерживает TXT, MD, CSV, DOCX и PDF.')
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
