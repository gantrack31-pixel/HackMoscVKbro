"""Экспорт на Python. Тексты, таблицы и диаграммы PPTX остаются редактируемыми."""
from io import BytesIO
from copy import deepcopy
from html import escape
import base64
from zipfile import ZipFile
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.chart import XL_CHART_TYPE
from pptx.chart.data import CategoryChartData
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from ..models import DeckContent
from .layout import build_scene, selected_layout, FONTS, geometry_nodes
from .visuals import hexagon_points
from .icons import ATTRIBUTION

def rgb(value): return RGBColor.from_string(value.lstrip('#'))

def scene_svg(scene):
    parts=[]
    for obj in scene.get('render_objects',scene['objects']):
        for n in ([obj] if 'render_objects' in scene else geometry_nodes(obj)):
            if n['type']=='rect': parts.append(f'<rect x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" fill="{n["fill"]}"/>')
            elif n['type']=='ellipse': parts.append(f'<ellipse cx="{n["x"]+n["w"]/2}" cy="{n["y"]+n["h"]/2}" rx="{n["w"]/2}" ry="{n["h"]/2}" fill="{n["fill"]}"/>')
            elif n['type']=='hexagon':
                points=' '.join(f'{x},{y}' for x,y in hexagon_points(n))
                parts.append(f'<polygon points="{points}" fill="{n["fill"]}"/>')
            elif n['type']=='line': parts.append(f'<line x1="{n["x1"]}" y1="{n["y1"]}" x2="{n["x2"]}" y2="{n["y2"]}" stroke="{n["stroke"]}" stroke-width="{n["stroke_width"]}"/>')
            elif n['type']=='image': parts.append(f'<image x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" href="{escape(n["src"],quote=True)}"/>')
            else:
                spans=''.join(f'<tspan x="{n["x"]}" y="{n["y"]+n["font_size"]+i*n["font_size"]*n.get("line_spacing",1.28)}">{escape(line)}</tspan>' for i,line in enumerate(n['lines']))
                parts.append(f'<text font-family="Manrope, Arial" font-size="{n["font_size"]}" font-weight="{750 if n["bold"] else 400}" fill="{n["color"]}">{spans}</text>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {scene["width"]} {scene["height"]}" role="img">'+''.join(parts)+'</svg>'

def export_html(content,template,variant):
    font=base64.b64encode((FONTS/'Manrope-Regular.ttf').read_bytes()).decode()
    slides=''.join('<section>'+scene_svg(build_scene(slide,template['metadata'],variant,i))+'</section>' for i,slide in enumerate(content.slides))
    attribution=f'<footer>{escape(ATTRIBUTION)}</footer>' if any(s.kind=='icons' for s in content.slides) else ''
    html=f'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(content.title)}</title><style>@font-face{{font-family:Manrope;src:url(data:font/ttf;base64,{font})}}body{{background:#e2e8f0;margin:0;padding:24px}}section{{max-width:1280px;margin:0 auto 24px;break-after:page}}svg{{display:block;width:100%;background:white}}@media print{{body{{padding:0}}section{{margin:0}}@page{{size:landscape;margin:0}}}}</style>{slides}{attribution}</html>'
    return html.encode('utf-8')

def export_pdf(content,template,variant):
    stream=BytesIO();metadata=template['metadata'];height=1280/metadata['ratio']
    pdf=canvas.Canvas(stream,pagesize=(1280,height));pdf.setTitle(content.title)
    if any(s.kind=='icons' for s in content.slides): pdf.setSubject(ATTRIBUTION)
    for i,slide in enumerate(content.slides):
        scene=build_scene(slide,metadata,variant,i)
        for obj in scene.get('render_objects',scene['objects']):
            for n in ([obj] if 'render_objects' in scene else geometry_nodes(obj)):
                if n['type']=='rect':
                    pdf.setFillColor(HexColor(n['fill']));pdf.rect(n['x'],height-n['y']-n['h'],n['w'],n['h'],fill=1,stroke=0)
                elif n['type']=='ellipse':
                    pdf.setFillColor(HexColor(n['fill']));pdf.ellipse(n['x'],height-n['y']-n['h'],n['x']+n['w'],height-n['y'],fill=1,stroke=0)
                elif n['type']=='hexagon':
                    points=hexagon_points(n); path=pdf.beginPath();path.moveTo(points[0][0],height-points[0][1])
                    for x,y in points[1:]:path.lineTo(x,height-y)
                    path.close();pdf.setFillColor(HexColor(n['fill']));pdf.drawPath(path,fill=1,stroke=0)
                elif n['type']=='line':
                    pdf.setStrokeColor(HexColor(n['stroke']));pdf.setLineWidth(n['stroke_width'])
                    pdf.line(n['x1'],height-n['y1'],n['x2'],height-n['y2'])
                elif n['type']=='image':
                    pdf.drawImage(ImageReader(BytesIO(base64.b64decode(n['src'].split(',',1)[1]))),
                                  n['x'],height-n['y']-n['h'],n['w'],n['h'],mask='auto')
                else:
                    pdf.setFont('DecklyBold' if n['bold'] else 'Deckly',n['font_size']);pdf.setFillColor(HexColor(n['color']))
                    for j,line in enumerate(n['lines']):pdf.drawString(n['x'],height-n['y']-n['font_size']-j*n['font_size']*n.get('line_spacing',1.28),line)
        pdf.showPage()
    pdf.save();return stream.getvalue()

def export_pptx(content: DeckContent, template: dict, variant: str, *, scenes=None):
    if scenes is not None and len(scenes)!=len(content.slides): raise ValueError('Scene count does not match content')
    metadata=template['metadata'];prs=Presentation(template['path']) if template.get('path') else Presentation()
    retained_parts={str(part.partname).lstrip('/'):part for part in prs.part.package.iter_parts()}
    if template.get('path'):
        # В python-pptx пока нет публичного remove_slide. Удаляем только слайды копии,
        # сохраняя мастера, макеты, тему и связанные с ними ресурсы.
        for slide_id in list(prs.slides._sldIdLst):
            prs.part.drop_rel(slide_id.rId);prs.slides._sldIdLst.remove(slide_id)
    else:
        prs.slide_width=Inches(13.333333);prs.slide_height=Inches(13.333333/metadata['ratio'])
    scale=prs.slide_width/1280;point_scale=scale/12700
    for index,slide_content in enumerate(content.slides):
        scene=scenes[index] if scenes is not None else build_scene(slide_content,metadata,variant,index)
        chosen=scene.get('layout_key') or selected_layout(metadata,slide_content.kind,slide_content.layout or variant)
        layout=prs.slide_masters[chosen['master']].slide_layouts[chosen['index']] if chosen else min(prs.slide_layouts,key=lambda l:len(l.placeholders))
        slide=prs.slides.add_slide(layout)
        for ph in list(slide.placeholders):
            element=ph._element;element.getparent().remove(element)
        background_info=scene.get('background_info',{})
        if template.get('path') and not scene['objects'][0].get('override_template') and background_info.get('kind')=='complex':
            source=retained_parts.get(background_info.get('part'))
            backgrounds=source._element.xpath('./p:cSld/p:bg') if source is not None else []
            if backgrounds:
                bg=deepcopy(backgrounds[0])
                for node in bg.iter():
                    for key,value in list(node.attrib.items()):
                        if key.startswith('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'):
                            rel=source.rels[value]
                            if not rel.is_external: node.set(key,slide.part.relate_to(rel.target_part,rel.reltype))
                existing=slide._element.cSld.find('{http://schemas.openxmlformats.org/presentationml/2006/main}bg')
                if existing is not None: slide._element.cSld.remove(existing)
                slide._element.cSld.insert(0,bg)
        for obj in scene['objects']:
            x,y,w,h=[int(obj[key]*scale) for key in ['x','y','w','h']]
            if obj['id']=='background':
                if template.get('path') and metadata.get('preserve_template_background',True) and not obj.get('override_template') and background_info.get('kind') not in {'solid','implicit'}: continue
                slide.background.fill.solid();slide.background.fill.fore_color.rgb=rgb(obj['fill']);continue
            if obj['type'] in {'rect','ellipse','hexagon'}:
                shape=slide.shapes.add_shape({'ellipse':MSO_SHAPE.OVAL,'hexagon':MSO_SHAPE.HEXAGON,'rect':MSO_SHAPE.RECTANGLE}[obj['type']],x,y,w,h)
                if obj['type']=='hexagon': shape.adjustments[0]=.18
                shape.fill.solid();shape.fill.fore_color.rgb=rgb(obj['fill']);shape.line.fill.background()
            elif obj['type']=='line':
                line=slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,*[int(obj[k]*scale) for k in ('x1','y1','x2','y2')])
                line.line.color.rgb=rgb(obj['stroke']);line.line.width=Pt(obj['stroke_width']*point_scale)
            elif obj['type']=='image':
                image_bytes=base64.b64decode(obj['src'].split(',',1)[1])
                asset=next((a for a in metadata.get('assets',[]) if a['id']==slide_content.template_asset_id),None)
                if obj['id']=='illustration' and not slide_content.image_data and asset and asset.get('original_part') and template.get('path'):
                    with ZipFile(template['path']) as original:
                        full_image=original.read(asset['original_part'])
                    # Native formats preserve full resolution; other formats keep the safe preview.
                    if asset['original_part'].lower().endswith(('.png','.jpg','.jpeg','.gif','.bmp','.tif','.tiff')):
                        image_bytes=full_image
                slide.shapes.add_picture(BytesIO(image_bytes),x,y,w,h)
            elif obj['type']=='text':
                shape=slide.shapes.add_textbox(x,y,w,h);frame=shape.text_frame;frame.clear()
                frame.margin_left=frame.margin_right=frame.margin_top=frame.margin_bottom=0
                frame.word_wrap=True
                for j,line in enumerate(obj['lines']):
                    paragraph=frame.paragraphs[0] if j==0 else frame.add_paragraph()
                    paragraph.text=line;paragraph.font.name=obj.get('font_family',metadata.get('font','Manrope'))
                    paragraph.font.size=Pt(obj['font_size']*point_scale);paragraph.font.bold=obj['bold']
                    paragraph.font.color.rgb=rgb(obj['color']);paragraph.space_after=Pt(0);paragraph.line_spacing=obj.get('line_spacing',1.28)
            elif obj['type']=='chart':
                data=CategoryChartData();data.categories=obj['labels'];data.add_series(obj['unit'] or 'Значение',obj['values'])
                chart_type={'bar':XL_CHART_TYPE.BAR_CLUSTERED,'column':XL_CHART_TYPE.COLUMN_CLUSTERED,'line':XL_CHART_TYPE.LINE_MARKERS}[obj.get('chart_type','bar')]
                chart=slide.shapes.add_chart(chart_type,x,y,w,h,data).chart
                chart.has_legend=False;chart.value_axis.has_title=True;chart.value_axis.axis_title.text_frame.text=obj['unit'] or 'Значение'
                chart.series[0].format.fill.solid();chart.series[0].format.fill.fore_color.rgb=rgb(obj['fill'])
                chart.series[0].format.line.color.rgb=rgb(obj['fill'])
                chart.font.color.rgb=rgb(obj['theme']['text'])
                for axis in (chart.category_axis,chart.value_axis):
                    axis.tick_labels.font.color.rgb=rgb(obj['theme']['text'])
                for paragraph in chart.value_axis.axis_title.text_frame.paragraphs:
                    paragraph.font.color.rgb=rgb(obj['theme']['text'])
                # Chart area defaults must not silently use white on a dark slide.
                from pptx.oxml.xmlchemy import OxmlElement
                sp=OxmlElement('c:spPr');fill=OxmlElement('a:solidFill');color=OxmlElement('a:srgbClr')
                color.set('val',obj['theme']['background'].lstrip('#'));fill.append(color);sp.append(fill)
                chart._chartSpace.insert_element_before(sp,'c:txPr','c:externalData','c:printSettings','c:userShapes','c:extLst')
            elif obj['type']=='table':
                rows=obj['rows'];table=slide.shapes.add_table(len(rows),len(rows[0]),x,y,w,h).table
                for ri,row in enumerate(rows):
                    for ci,value in enumerate(row):
                        cell=table.cell(ri,ci);cell.text=value
                        for paragraph in cell.text_frame.paragraphs:
                            paragraph.font.size=Pt(obj['font_size']*point_scale);paragraph.font.name=metadata.get('font','Manrope')
                            paragraph.font.bold=ri==0;paragraph.font.color.rgb=rgb(obj['header_color'] if ri==0 else obj['theme']['text'])
                        cell.fill.solid();cell.fill.fore_color.rgb=rgb(obj['fill'] if ri==0 else obj['theme']['surface'] if ri%2==0 else obj['theme']['background'])
        slide.notes_slide.notes_text_frame.text=slide_content.notes+('\nИсточник: '+slide_content.source_quote if slide_content.source_quote else '')
        if slide_content.kind=='icons': slide.notes_slide.notes_text_frame.text+='\n'+ATTRIBUTION
    stream=BytesIO();prs.save(stream);return stream.getvalue()
