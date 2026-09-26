"""Structural and resource-bound checks for untrusted PPTX ZIP packages."""
from pathlib import Path
from posixpath import dirname, join, normpath
from urllib.parse import unquote, urlsplit
import stat
from zipfile import BadZipFile, ZipFile
import zlib
from lxml import etree


MAX_ARCHIVE_ENTRIES = 1000
MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
MAX_ENTRY_BYTES = 64 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
REQUIRED_PARTS = {
    '[Content_Types].xml',
    '_rels/.rels',
    'ppt/presentation.xml',
    'ppt/_rels/presentation.xml.rels',
}
RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships'
MAX_XML_BYTES = 16 * 1024 * 1024


def _parse_xml(payload: bytes):
    parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False)
    try:
        root = etree.fromstring(payload, parser)
    except etree.XMLSyntaxError as exc:
        raise ValueError('PPTX содержит некорректную XML-часть.') from exc
    if root.getroottree().docinfo.doctype:
        raise ValueError('DTD и XML-сущности в частях OOXML запрещены.')
    return root


def _validate_member_path(name: str) -> None:
    if (not name or name.startswith('/') or '\\' in name or '\x00' in name
            or any(part in {'', '.', '..'} for part in name.rstrip('/').split('/'))):
        raise ValueError('PPTX содержит недопустимый путь части OOXML.')


def _relationship_source(name: str) -> str:
    if name == '_rels/.rels':
        return ''
    prefix, separator, filename = name.rpartition('/_rels/')
    if not separator or not filename.endswith('.rels'):
        raise ValueError('PPTX содержит некорректный путь файла отношений OOXML.')
    return f'{prefix}/{filename[:-5]}' if prefix else filename[:-5]


def _validate_relationships(archive: ZipFile, names: set[str]) -> None:
    for name in names:
        if not name.endswith('.rels'):
            continue
        info = archive.getinfo(name)
        if info.file_size > MAX_XML_BYTES:
            raise ValueError('Файл отношений OOXML превышает допустимый размер.')
        try:
            payload = archive.read(name)
            root = _parse_xml(payload)
        except ValueError as exc:
            if 'DTD и XML-сущности' in str(exc):
                raise
            raise ValueError('PPTX содержит некорректный XML отношений OOXML.') from exc
        if root.tag != f'{{{RELATIONSHIP_NAMESPACE}}}Relationships':
            raise ValueError('PPTX содержит некорректный корневой элемент отношений OOXML.')
        source = _relationship_source(name)
        for relation in root:
            if relation.tag != f'{{{RELATIONSHIP_NAMESPACE}}}Relationship':
                raise ValueError('PPTX содержит неизвестный элемент отношений OOXML.')
            if relation.get('TargetMode') == 'External':
                continue
            target = unquote(relation.get('Target', ''))
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or not target or '\\' in target or '\x00' in target:
                raise ValueError('PPTX содержит недопустимую внутреннюю ссылку OOXML.')
            resolved = normpath(join(dirname(source), parsed.path))
            if (not resolved or resolved == '..' or resolved.startswith('../')
                    or any(part == '..' for part in resolved.split('/'))):
                raise ValueError('PPTX содержит ссылку за пределы пакета OOXML.')
            if resolved not in names:
                raise ValueError('PPTX содержит ссылку на отсутствующую часть OOXML.')


def _validate_xml_parts(archive: ZipFile, names: set[str]) -> None:
    for name in names:
        if not name.endswith(('.xml', '.rels')):
            continue
        info = archive.getinfo(name)
        if info.file_size > MAX_XML_BYTES:
            raise ValueError('XML-часть PPTX превышает допустимый размер.')
        try:
            payload = archive.read(name)
            root = _parse_xml(payload)
        except ValueError as exc:
            if 'DTD и XML-сущности' in str(exc):
                raise
            raise ValueError('PPTX содержит некорректную XML-часть.') from exc
        if name == '[Content_Types].xml' and root.tag != '{http://schemas.openxmlformats.org/package/2006/content-types}Types':
            raise ValueError('PPTX содержит некорректный манифест OOXML.')
        if name == 'ppt/presentation.xml' and root.tag != '{http://schemas.openxmlformats.org/presentationml/2006/main}presentation':
            raise ValueError('PPTX содержит некорректную структуру презентации OOXML.')


def validate_pptx_archive(path: Path) -> None:
    """Reject malformed OOXML archives and ZIP resource-exhaustion payloads."""
    try:
        with ZipFile(path) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_ENTRIES:
                raise ValueError('В PPTX слишком много ZIP-записей.')

            names = set()
            total_uncompressed = 0
            for entry in entries:
                _validate_member_path(entry.filename)
                if entry.filename in names:
                    raise ValueError('PPTX содержит повторяющиеся части OOXML.')
                names.add(entry.filename)

                unix_mode = entry.external_attr >> 16
                if stat.S_ISLNK(unix_mode):
                    raise ValueError('PPTX содержит недопустимую ссылку в ZIP-архиве.')
                if entry.flag_bits & 0x1:
                    raise ValueError('Зашифрованные PPTX-файлы не поддерживаются.')
                if entry.file_size > MAX_ENTRY_BYTES:
                    raise ValueError('Часть PPTX превышает допустимый распакованный размер.')
                total_uncompressed += entry.file_size
                if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError('PPTX превышает допустимый распакованный размер.')
                if entry.file_size > 1024 and entry.file_size / max(entry.compress_size, 1) > MAX_COMPRESSION_RATIO:
                    raise ValueError('PPTX имеет недопустимый коэффициент сжатия.')

            if not REQUIRED_PARTS.issubset(names):
                raise ValueError('Файл не содержит обязательные части пакета OOXML презентации.')
            _validate_xml_parts(archive, names)
            _validate_relationships(archive, names)
            if archive.testzip() is not None:
                raise ValueError('PPTX содержит повреждённую ZIP-запись.')
    except (BadZipFile, OSError, EOFError, RuntimeError, NotImplementedError, zlib.error) as exc:
        raise ValueError('Файл не является корректным PPTX/ZIP-архивом.') from exc