"""Проверки геометрии воспроизводимы; смысловые замечания LLM помечены отдельно."""
import re
from ..models import DeckContent, Issue
from .layout import build_scene, wrap
from .sources import slide_binding
from .palette import allowed_color

def luminance(hex_color):
    channels=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    channels=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in channels]
    return sum(c*w for c,w in zip(channels,[.2126,.7152,.0722]))

def contrast(a,b='#FFFFFF'):
    values=sorted([luminance(a),luminance(b)])
    return (values[1]+.05)/(values[0]+.05)

def normalize(text): return re.sub(r'\s+',' ',text).strip()

def source_status(quote: str, source: str) -> str:
    if not quote.strip(): return 'missing'
    return 'matched' if normalize(quote) in normalize(source) else 'not_found'


def audit_deck(content: DeckContent, template: dict, variant: str, source: str) -> list[Issue]:
    issues=[]
    for index,slide in enumerate(content.slides):
        scene=build_scene(slide,template['metadata'],variant,index)
        def add(code,title,detail,category='layout',severity='warning',fixable=False,obj='body'):
            issues.append(Issue(id=f'{index}:{code}:{obj}',slide=index,code=code,title=title,detail=detail,
                                category=category,severity=severity,fixable=fixable,object_id=obj))
        color_issues={}
        color_validity={}
        for obj in scene.get('render_objects',scene['objects']):
            for key in ('color','fill','stroke'):
                value=obj.get(key)
                if value and value not in color_validity:
                    color_validity[value]=allowed_color(value,template['metadata'])
                if value and not color_validity[value]:color_issues.setdefault(value,set()).add(obj['id'])
        for value, ids in color_issues.items():
            add('color_off_palette_'+value.lstrip('#'),'Цвет не из палитры шаблона',
                f'Цвет {value} используется в {len(ids)} объектах и отличается от палитры активного шаблона. Проверьте оформление.',
                category='template',obj=sorted(ids)[0])
        for obj in scene['objects']:
            if obj['x']<0 or obj['y']<0 or obj['x']+obj['w']>scene['width']+.1 or obj['y']+obj['h']>scene['height']+.1:
                add('bounds','Объект выходит за слайд','Измените композицию или сократите содержание.',severity='error',obj=obj['id'])
            if obj['type']=='text' and obj['id'] not in {'number','footer'}:
                if obj['used_height']>obj['h']:
                    add('overflow','Текст не помещается в блок','Можно уменьшить размер до безопасного минимума. Если этого недостаточно, разделите содержание.',severity='error',fixable='overflow' not in slide.fixed,obj=obj['id'])
                point_scale=1280/(template['metadata'].get('width_emu',12192000)/914400*72)
                point_size=obj['font_size']/point_scale
                threshold=3.0 if point_size>=24 or (obj.get('bold') and point_size>=18) else 4.5
                surfaces=[o for o in scene['objects'][:scene['objects'].index(obj)] if o['type'] in {'rect','ellipse','hexagon'}
                          and o['x']<=obj['x'] and o['y']<=obj['y'] and o['x']+o['w']>=obj['x']+obj['w'] and o['y']+o['h']>=obj['y']+obj['h']]
                background=surfaces[-1]['fill'] if surfaces else scene['objects'][0]['fill']
                if obj.get('text','').strip() and contrast(obj['color'],background)<threshold:
                    add('contrast_title','Недостаточный контраст',f'Контраст ниже {threshold:g}:1 для этого размера текста. Выберите более контрастный цвет из шаблона.',category='template',fixable=obj['id']=='title',obj=obj['id'])
            if obj['type']=='table':
                cell_width=obj['w']/len(obj['rows'][0])-24;cell_height=obj['h']/len(obj['rows'])-16
                if any(len(wrap(cell,cell_width,obj['font_size']))*obj['font_size']*1.28>cell_height for row in obj['rows'] for cell in row):
                    add('table_density','Текст в таблице не помещается','Сократите ячейки или разделите таблицу на несколько слайдов.',severity='error',obj=obj['id'])
            if obj['type']=='chart':
                row_height=(obj['h']-32)/len(obj['labels'])-8
                if any(len(wrap(label,min(176,obj['w']*.24),18))*23>row_height for label in obj['labels']):
                    add('chart_labels','Подписи диаграммы слишком длинные','Сократите подписи категорий, сохранив смысл.',category='content',obj=obj['id'])
        if len(slide.bullets)>6: add('density','Слишком много тезисов','На слайде больше шести пунктов. Разделите их.',category='content')
        if any(len(b.split())>15 for b in slide.bullets): add('long_bullet','Длинный пункт списка','Есть пункт длиннее 15 слов. Сократите или вынесите пояснение в заметки.',category='content')
        if slide.kind=='chart' and slide.chart and not slide.chart.unit:
            add('chart_unit','Не указана единица измерения','Добавьте единицу измерения в данные диаграммы.',category='content',obj='chart')
        binding=slide_binding(slide,source)
        status=binding['status']
        if status=='related':
            add('source_related','Найден похожий фрагмент источника',
                'Текст перефразирован. Найден возможный источник; смысловое соответствие нужно подтвердить.',category='source',severity='info')
            issues[-1].source_bindings=[{k:r[k] for k in ('chunk_id','start','end','quote')} for r in binding['candidates']]
            issues[-1].grounding='unverified'
        elif status!='matched':
            add('source_missing' if status=='missing' else 'source_not_found',
                'Источник не указан' if status=='missing' else 'Цитата не найдена в материалах',
                'Укажите точную цитату из материалов и проверьте, что она подтверждает тезис.',category='source',severity='info' if status=='missing' else 'warning')
        if re.search(r'\blorem ipsum\b|\bTODO\b|вставьте текст',slide.title+' '+slide.body,re.I):
            add('placeholder','Остался служебный текст','Замените заглушку содержанием.',category='content',severity='error')
        if slide.kind=='image' and not slide.image_data and not any(a['id']==slide.template_asset_id for a in template['metadata'].get('assets',[])):
            add('image_missing','Нет иллюстрации','Подключите генератор изображений и создайте иллюстрацию в редакторе.',category='content',severity='error',obj='image-placeholder')
        if slide.kind in {'icons','diagram'} and len(slide.bullets)>6:
            add('visual_capacity','Схема содержит больше шести элементов','Разделите схему: на этом слайде показаны только первые шесть пунктов.',category='content',severity='error')
        if slide.kind=='diagram' and not slide.bullets:
            add('visual_empty','Нет данных для схемы','Добавьте названия узлов в поле «Тезисы».',category='content',severity='info')
        if slide.kind=='diagram' and slide.diagram_type=='matrix' and len(slide.bullets)>4:
            add('matrix_capacity','Матрица содержит больше четырёх элементов','Для матрицы 2x2 оставьте четыре тезиса или выберите другой тип схемы.',category='content')
        essential=[o for o in scene['objects'] if o['type'] in {'text','chart','table','image'}
                   and o['id'] not in {'number','footer'} and (o['type']!='text' or o.get('text','').strip())]
        overlapping=set()
        for left_index,a in enumerate(essential):
            for b in essential[left_index + 1:]:
                iw=min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])
                ih=min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])
                if iw>8 and ih>8 and b['id'] not in overlapping:
                    overlapping.add(b['id'])
                    add('overlap','Блоки содержания пересекаются','Измените композицию или сократите текст; перекрытие требует проверки.',severity='error',obj=b['id'])

    return issues
