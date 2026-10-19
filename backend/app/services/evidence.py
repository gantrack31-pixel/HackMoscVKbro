"""Versioned supplementary sources travel with the draft, proposal and undo history."""
from hashlib import sha256
from ..models import DeckContent, EvidenceSource


def source_text(original, content):
    if isinstance(content, dict):
        extra = [item['text'] for item in content.get('evidence_sources', [])]
    else:
        extra = [item.text for item in content.evidence_sources]
    return '\n\n'.join(part for part in [original, *extra] if part)


def attach_material(content, material):
    if not material.strip():
        return content
    key = sha256(material.encode()).hexdigest()
    if any(item.id == key for item in content.evidence_sources):
        return content
    return DeckContent.model_validate({**content.model_dump(), 'evidence_sources': [
        *[s.model_dump() for s in content.evidence_sources], EvidenceSource(id=key, text=material).model_dump()]})
