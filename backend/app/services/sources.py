"""Deterministic source locations: Unicode code-point offsets, end exclusive."""
import re
from hashlib import sha256


def source_chunks(source: str) -> list[dict]:
    version = sha256(source.encode('utf-8')).hexdigest()[:12]
    return [{'id':f'{version}:{start}', 'start':start, 'end':min(start+1600,len(source)),
             'text':source[start:start+1600]} for start in range(0, len(source), 1600)]


def locate_quote(quote: str, source: str) -> list[dict]:
    if not quote.strip() or not source.strip(): return []
    # Match whitespace flexibly while preserving offsets in the ORIGINAL source.
    pattern = r'\s+'.join(re.escape(word) for word in quote.split())
    match = re.search(pattern, source)
    if not match: return []
    return [{'chunk_id':chunk['id'], 'start':max(match.start(),chunk['start']),
             'end':min(match.end(),chunk['end']),
             'quote':source[max(match.start(),chunk['start']):min(match.end(),chunk['end'])]}
            for chunk in source_chunks(source) if chunk['start'] < match.end() and chunk['end'] > match.start()]


def slide_binding(slide, source: str) -> dict:
    quote = slide.source_quote
    refs = locate_quote(quote, source)
    inferred = False
    if not quote.strip():
        # Only literal whole claims; do not manufacture evidence by fuzzy matching.
        for claim in [slide.body, *slide.bullets, slide.title]:
            if len(claim.strip()) >= 20:
                refs = locate_quote(claim, source)
                if refs:
                    inferred = True
                    break
    return {'status':'matched' if refs else 'missing' if not quote.strip() else 'not_found',
            'bindings':refs, 'inferred_literal':inferred, 'semantic_verified':False}


def validate_bindings(refs, source: str) -> list[dict]:
    if not isinstance(refs, list): return []
    chunks = {c['id']:c for c in source_chunks(source)}
    result = []
    for ref in refs[:12]:
        if not isinstance(ref, dict): continue
        chunk = chunks.get(ref.get('chunk_id')) if isinstance(ref.get('chunk_id'),str) else None
        start, end = ref.get('start'), ref.get('end')
        if (chunk and type(start) is int and type(end) is int
                and chunk['start'] <= start < end <= chunk['end']
                and ref.get('quote') == source[start:end]):
            result.append({k:ref[k] for k in ('chunk_id','start','end','quote')})
    return result
