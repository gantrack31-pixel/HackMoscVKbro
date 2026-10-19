"""Shared, versioned templates shipped with the application, never user uploads."""
import json
from pathlib import Path
from .. import database as db

PACK_ROOT = Path(__file__).resolve().parents[2] / 'template_pack'
PACK = json.loads((PACK_ROOT / 'manifest.json').read_text(encoding='utf-8'))
PACK_BY_ID = {item['id']: item for item in PACK}


def pack_cover(tid: str) -> Path | None:
    item = PACK_BY_ID.get(tid)
    if not item:
        return None
    path = PACK_ROOT / item['cover']
    return path if path.is_file() else None


def seed_pack():
    # Metadata is a lightweight, validated build-time index. Full layout analysis
    # happens only when a template is selected, not for every gallery request.
    for item in PACK:
        path = PACK_ROOT / item['file']
        if not path.is_file():
            continue
        existing = db.template_get(item['id'])
        if existing and existing.get('user_id'):
            continue
        metadata = existing['metadata'] if existing else item['metadata']
        catalog = {key: value for key, value in item['metadata'].items() if key in
                   {'category', 'cover_title', 'bundled_pack', 'original_name', 'master_only', 'cover_slide'}}
        metadata = {**metadata, **catalog}
        if (existing and existing.get('path') == str(path)
                and existing['name'] == item['name'] and existing['metadata'] == metadata):
            continue
        db.template_save(item['id'], item['name'], str(path), metadata)
