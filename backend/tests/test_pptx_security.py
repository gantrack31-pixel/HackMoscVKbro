"""Limits and structural checks for untrusted PPTX ZIP archives."""
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from app.services.pptx_security import validate_pptx_archive


def make_archive(entries):
    stream = BytesIO()
    with ZipFile(stream, 'w', ZIP_DEFLATED) as archive:
        for name, content in entries:
            archive.writestr(name, content)
    return stream.getvalue()


def minimal_pptx(entries=()):
    return make_archive([
        ('[Content_Types].xml', b'''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'''),
        ('_rels/.rels', b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'''),
        ('ppt/presentation.xml', b'''<presentation xmlns="http://schemas.openxmlformats.org/presentationml/2006/main"/>'''),
        ('ppt/_rels/presentation.xml.rels', b'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'''),
        *entries,
    ])


def test_accepts_well_formed_minimal_ooxml_package(tmp_path):
    path = tmp_path / 'valid.pptx'
    path.write_bytes(minimal_pptx())

    validate_pptx_archive(path)


def test_rejects_non_zip_input(tmp_path):
    path = tmp_path / 'not-a-zip.pptx'
    path.write_bytes(b'not a zip archive')

    with pytest.raises(ValueError, match='ZIP'):
        validate_pptx_archive(path)


def test_rejects_zip_without_required_ooxml_parts(tmp_path):
    path = tmp_path / 'wrong-package.pptx'
    path.write_bytes(make_archive([('document.xml', b'<document/>')]))

    with pytest.raises(ValueError, match='OOXML'):
        validate_pptx_archive(path)


def test_rejects_excessive_number_of_entries(tmp_path):
    path = tmp_path / 'many-entries.pptx'
    path.write_bytes(minimal_pptx([
        (f'ppt/media/image-{index}.bin', b'x') for index in range(1201)
    ]))

    with pytest.raises(ValueError, match='записей'):
        validate_pptx_archive(path)


def test_rejects_excessive_uncompressed_size(tmp_path):
    path = tmp_path / 'large-expanded.pptx'
    path.write_bytes(minimal_pptx([('ppt/media/image.bin', b'x' * (129 * 1024 * 1024))]))

    with pytest.raises(ValueError, match='распакованный размер'):
        validate_pptx_archive(path)


def test_rejects_extreme_compression_ratio(tmp_path):
    path = tmp_path / 'high-ratio.pptx'
    path.write_bytes(minimal_pptx([('ppt/media/image.bin', b'a' * (2 * 1024 * 1024))]))

    with pytest.raises(ValueError, match='сжатия'):
        validate_pptx_archive(path)


@pytest.mark.parametrize('unsafe_name', [
    '../outside.xml',
    '/absolute.xml',
    'ppt\\..\\outside.xml',
])
def test_rejects_unsafe_entry_paths(tmp_path, unsafe_name):
    path = tmp_path / 'unsafe-path.pptx'
    path.write_bytes(minimal_pptx([(unsafe_name, b'payload')]))

    with pytest.raises(ValueError, match='путь'):
        validate_pptx_archive(path)


def test_rejects_duplicate_package_parts(tmp_path):
    path = tmp_path / 'duplicate.pptx'
    with pytest.warns(UserWarning, match='Duplicate name'):
        path.write_bytes(minimal_pptx([('[Content_Types].xml', b'<Types/>')]))

    with pytest.raises(ValueError, match='повторя'):
        validate_pptx_archive(path)


def test_rejects_corrupt_member_crc(tmp_path):
    path = tmp_path / 'corrupt.pptx'
    path.write_bytes(minimal_pptx([('ppt/media/image.bin', b'payload')]))
    raw = bytearray(path.read_bytes())
    with ZipFile(BytesIO(raw)) as archive:
        entry = archive.getinfo('ppt/media/image.bin')
        data_offset = entry.header_offset + 30 + len(entry.filename.encode()) + len(entry.extra)
    raw[data_offset] ^= 0xFF
    path.write_bytes(raw)

    with pytest.raises(ValueError, match='корректным PPTX'):
        validate_pptx_archive(path)


def test_rejects_internal_relationship_target_outside_package(tmp_path):
    path = tmp_path / 'traversal-relationship.pptx'
    path.write_bytes(minimal_pptx([
        ('ppt/slides/_rels/slide1.xml.rels', b'''<?xml version="1.0"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="slide" Target="../../outside.xml"/>
            </Relationships>'''),
    ]))

    with pytest.raises(ValueError, match='ссылку'):
        validate_pptx_archive(path)


def test_rejects_relationship_target_to_missing_package_part(tmp_path):
    path = tmp_path / 'missing-target.pptx'
    path.write_bytes(minimal_pptx([
        ('ppt/slides/_rels/slide1.xml.rels', b'''<?xml version="1.0"?>
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="slide" Target="slides/missing.xml"/>
            </Relationships>'''),
    ]))

    with pytest.raises(ValueError, match='отсутствующую'):
        validate_pptx_archive(path)


def test_rejects_xml_doctype_and_entities(tmp_path):
    path = tmp_path / 'xml-entity.pptx'
    path.write_bytes(minimal_pptx([
        ('ppt/slides/slide1.xml', b'''<!DOCTYPE slide [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
            <slide xmlns="http://schemas.openxmlformats.org/presentationml/2006/main">&xxe;</slide>'''),
    ]))

    with pytest.raises(ValueError, match='DTD и XML-сущности'):
        validate_pptx_archive(path)