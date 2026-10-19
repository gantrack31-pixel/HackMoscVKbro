"""Small, deterministic model context. Full source validation always stays server-side."""
import re
from .sources import source_chunks


def relevant_source(source, query, limit=16000):
    if len(source) <= limit:
        return source
    wanted = set(re.findall(r'\w{3,}', query.casefold()))
    chunks = source_chunks(source)
    ranked = sorted(enumerate(chunks), key=lambda item: (
        -len(wanted & set(re.findall(r'\w{3,}', item[1]['text'].casefold()))), item[0]))
    chosen = sorted(ranked[:max(1, limit // 1600)])
    return '\n\n'.join(chunk['text'] for _, chunk in chosen)[:limit]


def presentation_context(content, allowed):
    result = content.model_dump(exclude={'evidence_sources'})
    for index, slide in enumerate(result['slides']):
        if index not in allowed:
            result['slides'][index] = {'slide': index, 'title': slide['title'], 'kind': slide['kind'],
                                       'context_only': True}
        else:
            slide['has_image'] = bool(slide.pop('image_data', ''))
            slide.pop('resource_icon_data', None)
            if slide.get('analytics'):
                # Immutable analytical evidence is validated locally, never rewritten by LLM.
                data = slide['analytics']
                slide['analytics'] = {k: data[k] for k in ('chart_type', 'question', 'takeaway', 'warnings')}
                slide['analytics']['read_only'] = True
    return result


def scene_context(scene):
    return {'width': scene['width'], 'height': scene['height'], 'objects': [
        {key: obj[key] for key in ('id', 'type', 'x', 'y', 'w', 'h', 'font_size', 'used_height') if key in obj}
        for obj in scene.get('render_objects', scene['objects'])],
        # Preserve the original text_boxes contract for compatible providers.
        'text_boxes': [{key: obj[key] for key in ('id', 'x', 'y', 'w', 'h', 'font_size', 'used_height')}
                       for obj in scene['objects'] if obj['type'] == 'text']}
