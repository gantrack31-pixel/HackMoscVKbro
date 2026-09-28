"""Deterministic source locations: Unicode code-point offsets, end exclusive."""
import re
from hashlib import sha256
from difflib import SequenceMatcher


def related_chunks(slide, source):
    """Rank likely source passages. Similarity is explicitly NOT semantic verification."""
    text = ' '.join([slide.body, *slide.bullets]) or slide.title
    def tokens(value):
        stop={'это','как','для','при','или','что','его','она','они','the','and','with','from'}
        return {t for t in re.findall(r'[\w]+',value.casefold().replace('ё','е')) if len(t)>2 and t not in stop}
    wanted=tokens(text)
    if len(wanted)<3 or not source.strip(): return []
    numbers=set(re.findall(r'\d+(?:[.,]\d+)?',text))
    ranked=[]
    for chunk in source_chunks(source):
        available=tokens(chunk['text'])
        if not numbers <= set(re.findall(r'\d+(?:[.,]\d+)?',chunk['text'])): continue
        # Conservative fuzzy token alignment handles inflection and minor paraphrases.
        common=sum(any(t==s or (min(len(t),len(s))>=5 and abs(len(t)-len(s))<=3
                               and SequenceMatcher(None,t,s).ratio()>=.8) for s in available) for t in wanted)
        score=common/len(wanted)
        if common>=3 and score>=.65: ranked.append((score,chunk))
    ranked.sort(key=lambda item:item[0],reverse=True)
    return [{'chunk_id':c['id'],'start':c['start'],'end':c['end'],'quote':c['text'],
             'similarity':round(score,3)} for score,c in ranked[:2]]


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
    candidates=related_chunks(slide,source) if not refs else []
    return {'status':'matched' if refs else 'not_found' if quote.strip() else 'related' if candidates else 'missing',
            'bindings':refs, 'candidates':candidates, 'inferred_literal':inferred, 'semantic_verified':False}


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
