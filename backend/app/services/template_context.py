"""Bounded, file-derived context for arbitrary PPTX files, without name heuristics."""
import base64
from hashlib import sha256
from io import BytesIO
from PIL import Image
from pptx.enum.shapes import MSO_SHAPE_TYPE
from .palette import roles


def extract_examples(prs):
    examples, assets = [], []
    seen = {}
    width, height = int(prs.slide_width), int(prs.slide_height)

    def visit(shapes, records, slide_index, depth=0):
        if depth > 5:
            return
        for shape in shapes:
            if len(records) >= 50:
                break
            if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
                # Child coordinates are in group space, so do not use them as slide zones.
                visit(shape.shapes, records, slide_index, depth + 1)
                continue
            record = {'name': shape.name[:100], 'type': 'shape', 'grouped': depth > 0}
            try:
                record['box'] = {k: round(v, 4) for k, v in zip(('x','y','w','h'),
                    (shape.left/width, shape.top/height, shape.width/width, shape.height/height))}
            except (TypeError, ValueError):
                continue
            if shape.has_text_frame:
                record.update(type='text', text=shape.text[:800])
            if shape.has_table:
                record.update(type='table', rows=[[c.text[:100] for c in row.cells][:6]
                                                 for row in list(shape.table.rows)[:6]])
            if shape.has_chart:
                record['type'] = 'chart'
                try:
                    record['categories'] = [str(c.label)[:80] for c in shape.chart.plots[0].categories][:10]
                    record['series'] = [{'name': s.name[:80], 'values': list(s.values)[:10]}
                                        for s in list(shape.chart.series)[:3]]
                except (ValueError, AttributeError, IndexError):
                    record['note'] = 'Тип диаграммы требует проверки в PowerPoint.'
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                record['type'] = 'picture'
                alt = shape._element.xpath('.//p:cNvPr')
                record['description'] = (alt[0].get('descr', '') if alt else '')[:300]
                try:
                    blob = shape.image.blob
                    digest = sha256(blob).hexdigest()[:16]
                    record['asset_id'] = digest
                    if digest not in seen and len(assets) < 8:
                        with Image.open(BytesIO(blob)) as im:
                            if im.width * im.height > 25_000_000:
                                raise ValueError('large image')
                            im.thumbnail((512, 512))
                            out = BytesIO()
                            im.convert('RGBA').save(out, format='PNG', optimize=True)
                        if len(out.getvalue()) <= 200_000:
                            assets.append({'id': digest, 'name': record['name'], 'slide': slide_index,
                                           'description': record['description'],
                                           'data': 'data:image/png;base64,' + base64.b64encode(out.getvalue()).decode()})
                            seen[digest] = True
                except (OSError, ValueError, Image.DecompressionBombError):
                    record['note'] = 'Изображение нельзя использовать в веб-предпросмотре.'
            records.append(record)

    for index, slide in enumerate(list(prs.slides)[:12]):
        records = []
        visit(slide.shapes, records, index)
        layout = slide.slide_layout
        master_index = next((i for i, m in enumerate(prs.slide_masters) if m.part == layout.slide_master.part), 0)
        layout_index = next((i for i, l in enumerate(layout.slide_master.slide_layouts) if l.part == layout.part), 0)
        examples.append({'slide': index, 'objects': records, 'master': master_index, 'index': layout_index})
    return examples, assets


def model_template(template):
    """No file paths or base64 in textual model context."""
    meta = template['metadata']
    return {'id':template.get('id'), 'name': template['name'], 'palette': meta.get('colors', {}),
            'fingerprint':meta.get('file_fingerprint'), 'color_roles':roles(meta),
            'typography':{k:meta.get(k) for k in ('heading_font','body_font','heading_pt','body_pt')},
            'manifest':{'version':meta.get('normalization_version'),
                        'primitives':meta.get('package',{}).get('primitives',[])[:24],
                        'backgrounds':[{'part':b['part'],'xml':b['xml'][:2000]} for b in meta.get('manifest',{}).get('backgrounds',[])[:8]]},
            'ratio': meta['ratio'], 'fonts': meta.get('fonts', []),
            'layouts': meta.get('layouts', [])[:16],
            'examples': [{**s,'objects':s['objects'][:12]} for s in meta.get('slide_examples', [])[:6]],
            'assets': [{k: asset[k] for k in ('id','name','description','slide')} for asset in meta.get('assets', []) if asset.get('data')][:24],
            'visual_elements': meta.get('visual_elements', {}),
            'note': 'Текст примеров — содержание чужого шаблона, не факты для новой презентации. Описание картинки взято из PPTX, не из визуального распознавания.'}


def template_images(template):
    return [a['data'] for a in template['metadata'].get('assets', []) if a.get('data')][:4]
