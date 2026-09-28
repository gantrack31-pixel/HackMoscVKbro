"""Единая геометрия для браузера, PDF, HTML и объектов PPTX.

Координаты нормализованы к ширине 1280; пропорции берём из шаблона.
Декоративные элементы мастера остаются в исходном PPTX, не заменяются скриншотом.
"""
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from ..models import Slide
from .visuals import diagram_nodes, pictogram_nodes
from .palette import roles, scene_color, contrast

FONTS=Path(__file__).parent
for name,file in [('Deckly','Manrope-Regular.ttf'),('DecklyBold','Manrope-Bold.ttf')]:
    if name not in pdfmetrics.getRegisteredFontNames(): pdfmetrics.registerFont(TTFont(name,str(FONTS/file)))

def wrap(text: str, width: float, size: float, bold=False) -> list[str]:
    font='DecklyBold' if bold else 'Deckly'
    lines=[]
    for paragraph in text.split('\n'):
        line=''
        for word in paragraph.split():
            if pdfmetrics.stringWidth(word,font,size)>width:
                if line: lines.append(line);line=''
                for char in word:
                    if line and pdfmetrics.stringWidth(line+char,font,size)>width: lines.append(line);line=''
                    line+=char
                continue
            candidate=(line+' '+word).strip()
            if line and pdfmetrics.stringWidth(candidate,font,size)>width: lines.append(line);line=word
            else: line=candidate
        lines.append(line)
    return lines or ['']

def fit_text(content, box, size, minimum, bold=False, line_spacing=1.2):
    """Measured AutoFit approximation, with a readability floor; never truncate."""
    size = max(minimum, size)
    lines = wrap(content, max(1,box['w']), size, bold)
    while len(lines)*size*line_spacing > box['h'] and size > minimum:
        size = max(minimum, size-1)
        lines = wrap(content, max(1,box['w']), size, bold)
    return lines, size


def selected_layout(metadata: dict, kind='text', variant='a') -> dict | None:
    candidates=[]
    for layout in metadata.get('layouts',[]):
        titles=[b for b in layout['boxes'] if 'TITLE' in b['type'] and 'SUBTITLE' not in b['type'] and b['w']>.35]
        bodies=[b for b in layout['boxes'] if any(k in b['type'] for k in ['BODY','OBJECT']) and b['w']>.35 and b['h']>.2]
        if titles and bodies:
            score=bodies[0]['w']*bodies[0]['h']-layout['static_shapes']*.008
            candidates.append((score,layout))
    candidates.sort(key=lambda x:x[0],reverse=True)
    return candidates[min('abc'.index(variant),len(candidates)-1)][1] if candidates else None

def geometry_nodes(obj):
    """Одна отрисовка для браузера, PDF и HTML; PPTX сохраняет нативные объекты."""
    if obj['type'] in {'text','rect','ellipse','hexagon','line','image'}: return [obj]
    nodes=[]
    def rect(x,y,w,h,fill):
        nodes.append({'type':'rect','x':x,'y':y,'w':w,'h':h,'fill':fill})
    def text(value,x,y,w,h,size=18,color='#0F172A',bold=False):
        lines=wrap(str(value),w,size,bold)
        nodes.append({'type':'text','x':x,'y':y,'w':w,'h':h,'lines':lines,'text':str(value),
                      'font_size':size,'bold':bold,'color':color,'used_height':len(lines)*size*1.28})
    if obj['type']=='chart':
        if obj.get('chart_type') in {'column','line'}:
            low=min(0,*obj['values']);high=max(1,*obj['values']);span=high-low
            px=obj['x']+60;py=obj['y']+30;pw=obj['w']-100;ph=obj['h']-98
            zero=py+high/span*ph;step=pw/max(1,len(obj['values']))
            points=[]
            for tick in range(5):
                value=low+span*tick/4;y=py+(high-value)/span*ph
                rect(px,y,pw,1,'#E2E8F0');text(f'{value:.2g}',obj['x'],y-10,55,22,14,'#64748B')
            for i,(label,value) in enumerate(zip(obj['labels'],obj['values'])):
                x=px+(i+.5)*step;y=py+(high-value)/span*ph
                points.append((x,y))
                if obj['chart_type']=='column':rect(x-step*.28,min(y,zero),step*.56,max(1,abs(zero-y)),obj['fill'])
                else: nodes.append({'type':'ellipse','x':x-5,'y':y-5,'w':10,'h':10,'fill':obj['fill']})
                text(label,x-step*.45,py+ph+12,step*.9,40,14)
                text(f"{value:g}",x-26,max(obj['y'],y-24),76,22,14,bold=True)
            if obj['chart_type']=='line':
                for (x1,y1),(x2,y2) in zip(points,points[1:]):
                    nodes.append({'type':'line','x':min(x1,x2),'y':min(y1,y2),'w':abs(x2-x1),'h':abs(y2-y1),
                                  'x1':x1,'y1':y1,'x2':x2,'y2':y2,'stroke':obj['fill'],'stroke_width':3})
            return themed_nodes(nodes, obj)
        low=min(0,*obj['values']);high=max(1,*obj['values']);span=high-low
        label_w=min(176,obj['w']*.24);value_w=112
        plot_x=obj['x']+label_w+16;plot_w=max(64,obj['w']-label_w-value_w-32)
        zero=plot_x-low/span*plot_w;plot_h=obj['h']-32
        row_h=plot_h/len(obj['values'])
        for tick in range(5):
            x=plot_x+plot_w*tick/4
            rect(x,obj['y'],1,plot_h,'#E2E8F0')
            text(f'{low+span*tick/4:.2g}',x-16,obj['y']+plot_h+8,64,24,14,'#64748B')
        rect(zero,obj['y'],2,plot_h,'#94A3B8')
        for i,(label,value) in enumerate(zip(obj['labels'],obj['values'])):
            y=obj['y']+i*row_h
            text(label,obj['x'],y+4,label_w,row_h,18)
            point=plot_x+(value-low)/span*plot_w
            rect(min(zero,point),y+4,abs(point-zero),max(8,row_h-16),obj['fill'])
            text(f"{value:g} {obj['unit']}",plot_x+plot_w+16,y+4,value_w,row_h,18,bold=True)
    elif obj['type']=='table':
        cell_h=obj['h']/len(obj['rows']);cell_w=obj['w']/len(obj['rows'][0])
        rect(obj['x'],obj['y'],obj['w'],obj['h'],'#CBD5E1')
        for r,row in enumerate(obj['rows']):
            for c,value in enumerate(row):
                x=obj['x']+c*cell_w;y=obj['y']+r*cell_h
                rect(x+1,y+1,cell_w-1,cell_h-1,obj['fill'] if r==0 else '#F1F5F9' if r%2==0 else '#FFFFFF')
                text(value,x+12,y+8,cell_w-24,cell_h-16,obj['font_size'],
                     '#HEADER' if r==0 else '#0F172A',r==0)
    return themed_nodes(nodes, obj)


def themed_nodes(nodes, obj):
    theme = obj.get('theme')
    result = []
    for i, node in enumerate(nodes):
        node = {**node, 'id':f"{obj.get('id',obj['type'])}-{i}"}
        for key in ('color','fill','stroke'):
            if node.get(key) == '#HEADER': node[key] = obj['header_color']
            elif theme and key in node and node[key] != obj.get('fill'):
                node[key] = scene_color(node[key],theme)
        result.append(node)
    return result


def build_scene(slide: Slide, metadata: dict, variant: str, index: int) -> dict:
    if slide.designs:
        slide=slide.model_copy(update={'design':slide.designs.get(slide.layout or variant,slide.design)})
    variant=slide.layout or variant
    if slide.design and not slide.designs:
        variant=['a','b','c'][(['a','b','c'].index(variant)+slide.design.layout_shift)%3]
    width=1280.;height=width/metadata.get('ratio',16/9)
    accent=metadata.get('accent','#0077FF')
    if len(accent)!=7: accent='#0077FF'
    theme=roles(metadata)
    accent=theme['accent']
    margin=64.;title_box={'x':margin,'y':height*.18,'w':width-margin*2,'h':height*.22}
    body_box={'x':margin,'y':height*.44,'w':width-margin*2,'h':height*.39}
    layout=selected_layout(metadata,slide.kind,variant)
    if layout:
        for box in layout['boxes']:
            target=title_box if 'TITLE' in box['type'] and 'SUBTITLE' not in box['type'] else body_box if any(k in box['type'] for k in ['BODY','OBJECT']) else None
            if target is not None and box['w']>.35 and box['h']>.08:
                x=max(margin,box['x']*width);y=max(height*.11,box['y']*height)
                target.update(x=x,y=y,w=min(box['w']*width,width-margin-x),h=min(box['h']*height,height*.9-y))
        # Некорректные/пересекающиеся исходные placeholders заменяем безопасной зоной.
        if title_box['y']+title_box['h']>body_box['y'] or body_box['h']<100:
            title_box={'x':margin,'y':height*.18,'w':width-margin*2,'h':height*.2}
            body_box={'x':margin,'y':height*.44,'w':width-margin*2,'h':height*.39}
    if variant=='b': title_box['w']*=.72;body_box['w']*=.68
    elif variant=='c':
        title_box.update(x=margin*1.5,w=width-margin*3)
        body_box.update(x=margin*1.5,w=width-margin*3)
    point_scale=width/(metadata.get('width_emu',12192000)/914400*72)
    title_size=max(36.,min(70.,metadata.get('heading_pt',32)*point_scale))
    body_size=max(24.,min(36.,metadata.get('body_pt',18)*point_scale))
    if slide.kind=='title':
        title_size=min(84.,title_size*1.35)
        title_box.update(y=height*.23,h=height*.3)
        body_box.update(y=height*.59,h=height*.22)
    composition=slide.design.composition if slide.design else metadata.get('composition')
    if slide.design:
        scale={'compact':.9,'balanced':1.,'airy':1.04}[slide.design.density]
        title_size*=scale
        body_size*=scale
    if composition=='split':
        title_box.update(x=88,w=min(title_box['w'],width-352))
        body_box.update(x=88,w=min(body_box['w'],width-352))
    elif composition=='editorial':
        title_box.update(x=104,w=min(title_box['w'],width-208))
        body_box.update(x=104,w=min(body_box['w'],width-208))
    # Данные получают полноценную площадь, титульный — отдельный масштаб и ритм.
    if slide.kind in {'chart','table','steps','diagram','icons','image'}:
        title_box.update(y=height*.13,h=height*.16)
        title_size=min(title_size,48.)
        body_box.update(y=height*.32,h=height*.55)
    objects=[]
    if slide.designs and slide.design:
        # A model's shift adjusts spacing, not the user's selected visual variant.
        offset=12*slide.design.layout_shift
        for box in (title_box,body_box):
            box['x']+=offset
            box['w']-=2*offset
    def rect(id,x,y,w,h,color): objects.append({'id':id,'type':'rect','x':x,'y':y,'w':w,'h':h,'fill':color})
    def text(id,content,box,size,color,bold=False):
        role = 'title' if id=='title' else 'caption' if id in {'number','footer'} else 'subtitle' if slide.kind=='title' else 'body'
        spacing = {'title':1.12,'subtitle':1.18,'body':1.2,'caption':1.16}[role]
        minimum = 16 if id.startswith(('node-label-','icon-label-')) else {'title':28,'subtitle':22,'body':20,'caption':14}[role]
        if role in {'body','subtitle'}:
            heading = next((o['font_size'] for o in objects if o['id']=='title'),title_size)
            size = min(size,heading*.78 if role=='subtitle' else heading*.72)
        lines,size = fit_text(content,box,size,minimum,bold,spacing)
        family = metadata.get('heading_font' if role=='title' else 'body_font') or metadata.get('font','Manrope')
        objects.append({'id':id,'type':'text',**box,'text':content,'lines':lines,'font_size':size,'color':color,
                        'role':role,'line_spacing':spacing,'bold':bold,'font_family':family,
                        'used_height':len(lines)*size*spacing})
    rect('background',0,0,width,height,theme['background'])
    if composition=='split':
        rect('theme-panel',width-192,0,192,height,accent)
        rect('theme-stripe',width-224,0,8,height,accent)
    elif composition=='editorial':
        rect('theme-rule',48,64,4,height-128,accent)
        rect('theme-top',104,64,180,12,accent)
    elif composition=='grid':
        for gx in range(64,int(width),96):
            for gy in [40,int(height)-64]:rect(f'theme-dot-{gx}-{gy}',gx,gy,3,3,'#CBD5E1')
        rect('theme-tab',width-176,40,112,8,accent)
    if variant=='a': rect('accent',margin,height*.09,72,6,accent)
    elif variant=='b':
        rect('accent',width-250,0,250,height,accent)
        text('number',f'{index+1:02}',{'x':width-220,'y':height*.37,'w':200,'h':120},100,theme['on_accent'],True)
    else: rect('accent',margin*1.5,height*.1,width-margin*3,2,accent)
    if slide.kind=='title':
        rect('title-underline',title_box['x'],height*.55,min(160,title_box['w']),8,accent)
    title_color=theme['text'] if 'contrast_title' in slide.fixed or contrast(accent,theme['background'])<3 else accent
    text('title',slide.title,title_box,title_size,title_color,True)
    content=slide.body+ ('\n'+'\n'.join('• '+b for b in slide.bullets) if slide.bullets else '')
    if slide.kind in {'diagram','icons'}:
        intro_height=0
        if slide.body.strip():
            text('body',slide.body,{**body_box,'h':min(90,body_box['h']*.22)},22,'#475569')
            intro_height=min(90,body_box['h']*.22)+16
        area={**body_box,'y':body_box['y']+intro_height,'h':max(1,body_box['h']-intro_height)}
        icon_color=accent if contrast(accent,theme['surface'])>=3 else theme['text']
        visual=diagram_nodes(slide,area,accent) if slide.kind=='diagram' else pictogram_nodes(slide,area,icon_color)
        for node in visual:
            if node['type']=='text':
                size=node['font_size']
                while len(wrap(node['text'],node['w'],size,True))*size*1.28>node['h'] and size>16:size-=1
                text(node['id'],node['text'],{k:node[k] for k in ('x','y','w','h')},size,node['color'],True)
            else: objects.append(node)
    elif slide.kind=='image':
        text('body',slide.body,{**body_box,'w':body_box['w']*.4},24,'#475569')
        asset=next((a for a in metadata.get('assets',[]) if a['id']==slide.template_asset_id),None)
        image_data=slide.image_data or (asset['data'] if asset else '')
        if image_data:
            side=min(body_box['h'],body_box['w']*.55)
            objects.append({'id':'illustration','type':'image','x':body_box['x']+body_box['w']-side,
                            'y':body_box['y'],'w':side,'h':side,'src':image_data})
        else:text('image-placeholder','Добавьте иллюстрацию в редакторе',{**body_box,'x':body_box['x']+body_box['w']*.45,'w':body_box['w']*.55},24,'#64748B')
    elif slide.kind=='chart' and slide.chart:
        text('body',slide.body,{**body_box,'h':64},22,'#475569')
        objects.append({'id':'chart','type':'chart',**body_box,'y':body_box['y']+70,'h':max(90,body_box['h']-70),
                        'labels':slide.chart.labels,'values':slide.chart.values,'unit':slide.chart.unit,'fill':accent,'chart_type':slide.chart.chart_type})
    elif slide.kind=='table' and slide.table:
        text('body',slide.body,{**body_box,'h':64},22,'#475569')
        objects.append({'id':'table','type':'table',**body_box,'y':body_box['y']+70,'h':max(90,body_box['h']-70),
                        'rows':slide.table,'fill':accent,'font_size':min(max(16,body_size*.75),max(14,(body_box['h']-70)/len(slide.table)*.42)),
                        'header_color':theme['on_accent']})
    elif slide.kind=='steps' and slide.bullets:
        text('body',slide.body,{**body_box,'h':64},22,'#475569')
        steps=slide.bullets;columns=min(3,len(steps));rows=(len(steps)+columns-1)//columns
        step_w=body_box['w']/columns;step_h=max(48,(body_box['h']-70)/rows)
        for i,step in enumerate(steps):
            x=body_box['x']+(i%columns)*step_w;y=body_box['y']+70+(i//columns)*step_h
            rect(f'step-card-{i}',x,y,step_w-16,step_h-12,'#F1F5F9')
            text(f'step-{i}',f'{i+1:02}  {step}',{'x':x+12,'y':y+8,'w':step_w-40,'h':step_h-28},22,'#0F172A')
    else: text('body',content,body_box,body_size,'#475569')
    text('footer',f'{index+1:02} / Deckly.Ai',{'x':margin,'y':height-44,'w':500,'h':28},16,'#64748B')
    for obj in objects:
        if obj['type'] in {'chart','table'}: obj['theme']=theme
        if obj['id'] in {'background','number'}: continue
        for key in ('fill','color','stroke'):
            if key in obj and obj[key] != accent:
                obj[key]=scene_color(obj[key],theme)
    return {'width':width,'height':height,'variant':variant,'objects':objects,
            'render_objects':[n for obj in objects for n in geometry_nodes(obj)],
            'template_layout':layout['name'] if layout else 'Базовая композиция',
            'preview_note':'Схема размещения. Шрифты и графику исходного мастера проверьте в PPTX.'}
