"""Проверки геометрии воспроизводимы; смысловые замечания LLM помечены отдельно."""
import re
from ..models import DeckContent, Issue
from .layout import build_scene, wrap
from .sources import slide_binding

def luminance(hex_color):
    channels=[int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    channels=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in channels]
    return sum(c*w for c,w in zip(channels,[.2126,.7152,.0722]))

def contrast(a,b='#FFFFFF'):
    values=sorted([luminance(a),luminance(b)])
    return (values[1]+.05)/(values[0]+.05)

def normalize(text): return re.sub(r'\s+',' ',text).strip()

def hex_upper(h):
    """Normalize hex color to upper case for comparison."""
    if not h:
        return ''
    h = h.lstrip('#')
    return '#' + h.upper()

def source_status(quote: str, source: str) -> str:
    if not quote.strip(): return 'missing'
    return 'matched' if normalize(quote) in normalize(source) else 'not_found'

def _check_font_from_template(scene_objects, template, index, add):
    """Проверка: шрифт не из шаблона / гарнитур больше двух."""
    meta = template['metadata']
    template_fonts = set(meta.get('fonts') or [meta.get('font','Manrope')])
    template_fonts.update(f for f in (meta.get('heading_font'),meta.get('body_font')) if f)
    used_families = set()
    for obj in scene_objects:
        if obj['type'] == 'text':
            # font_name может быть задан явно или по умолчанию — Manrope
            fam = obj.get('font_family', 'Manrope')
            used_families.add(fam)
            if fam not in template_fonts:
                add('font_unknown',
                    'Шрифт не из шаблона',
                    f'Используется шрифт «{fam}», которого нет в палитре шаблона («{", ".join(sorted(template_fonts))}»).',
                    category='template',obj=obj['id'])
    if len(used_families) > 2:
        add('font_too_many',
            'Слишком много гарнитур',
            f'На слайде использовано {len(used_families)} шрифтов (максимум 2). Сведите к одному-двум.',
            category='template')

def _check_color_palette(scene_objects, template, index, add):
    """Проверка: цвет не из палитры шаблона."""
    pal_raw = template['metadata'].get('colors', {})
    palette = {hex_upper(v) for v in pal_raw.values()} | {'#FFFFFF', '#000000'}
    for obj in scene_objects:
        for key in ('color', 'fill'):
            val = obj.get(key)
            if not val:
                continue
            norm = hex_upper(val)
            if norm in {'#FFFFFF', '#000000'}:
                continue
            if norm not in palette:
                add('color_off_palette',
                    'Цвет не из палитры шаблона',
                    f'Цвет «{norm}» отсутствует в палитре шаблона («{", ".join(sorted(palette))}»). Используйте цвет из шаблона.',
                    category='template',obj=obj['id'])

def _check_slide_density(scene_objects, scene, index, add):
    """Проверка: слайд заполнен менее чем на 25 % или более чем на 75 %."""
    total_area = scene['width'] * scene['height']
    if total_area <= 0:
        return
    content_area = sum(o.get('w', 0) * o.get('h', 0)
                       for o in scene_objects
                       if o.get('type') != 'rect' and o.get('w', 0) > 0 and o.get('h', 0) > 0)
    ratio = content_area / total_area
    if ratio < 0.25:
        pct = round(ratio * 100)
        add('empty_slide',
            'Слайд заполнен менее чем на 25 %',
            f'Заполнено ~{pct} %. Добавьте содержание или выберите другой макет.',
            category='density', severity='warning')
    elif ratio > 0.75:
        pct = round(ratio * 100)
        add('overfull_slide',
            'Слайд заполнен более чем на 75 %',
            f'Заполнено ~{pct} %. Разделите контент на несколько слайдов или уменьшите объём текста.',
            category='density', severity='warning')



def audit_deck(content: DeckContent, template: dict, variant: str, source: str) -> list[Issue]:
    issues=[]
    for index,slide in enumerate(content.slides):
        scene=build_scene(slide,template['metadata'],variant,index)
        def add(code,title,detail,category='layout',severity='warning',fixable=False,obj='body'):
            issues.append(Issue(id=f'{index}:{code}:{obj}',slide=index,code=code,title=title,detail=detail,
                                category=category,severity=severity,fixable=fixable,object_id=obj))
        for obj in scene['objects']:
            if obj['x']<0 or obj['y']<0 or obj['x']+obj['w']>scene['width']+.1 or obj['y']+obj['h']>scene['height']+.1:
                add('bounds','Объект выходит за слайд','Измените композицию или сократите содержание.',severity='error',obj=obj['id'])
            if obj['type']=='text' and obj['id'] not in {'number','footer'}:
                if obj['used_height']>obj['h']:
                    add('overflow','Текст не помещается в блок','Можно уменьшить размер до безопасного минимума. Если этого недостаточно, разделите содержание.',severity='error',fixable='overflow' not in slide.fixed,obj=obj['id'])
                point_scale=1280/(template['metadata'].get('width_emu',12192000)/914400*72)
                point_size=obj['font_size']/point_scale
                threshold=3.0 if point_size>=24 or (obj.get('bold') and point_size>=18) else 4.5
                if contrast(obj['color'],scene['objects'][0]['fill'])<threshold:
                    add('contrast_title','Недостаточный контраст',f'Контраст ниже {threshold:g}:1 для этого размера текста. Цвет заголовка можно заменить на тёмный.',category='template',fixable=obj['id']=='title',obj=obj['id'])
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
        # --- расширенные проверки диаграмм ---
        if slide.kind=='chart' and slide.chart and not slide.chart.unit:
            add('chart_unit','Не указана единица измерения','Добавьте единицу измерения в данные диаграммы.',category='content',obj='chart')
        if slide.kind=='chart' and slide.chart and slide.chart.labels and len(slide.chart.labels) <= 1:
            add('chart_no_legend','Нет легенды или подписей осей','Диаграмма без легенды или подписей осей воспринимается без контекста.',category='content',obj='chart')

        # --- таблица: строки / колонки ---
        if slide.kind == 'table' and slide.table:
            rows = len(slide.table)
            cols = max(len(r) for r in slide.table) if slide.table else 0
            if rows > 7:
                add('table_rows','Таблица больше 7 строк',f'В таблице {rows} строк (допустимо до 7). Разбейте на несколько слайдов или сократите данные.',category='density',obj='table')
            if cols > 5:
                add('table_cols','Таблица больше 5 колонок',f'В таблице {cols} колонок (допустимо до 5). Сведите ключевые показатели к одному слайду.',category='density',obj='table')

        status=slide_binding(slide,source)['status']
        if status!='matched':
            add('source_missing' if status=='missing' else 'source_not_found',
                'Нет привязки к источнику' if status=='missing' else 'Цитата не найдена в материалах',
                'Укажите точную цитату из материалов и проверьте, что она подтверждает тезис.',category='source',severity='info' if status=='missing' else 'warning')
        if re.search(r'\blorem ipsum\b|\bTODO\b|вставьте текст',slide.title+' '+slide.body,re.I):
            add('placeholder','Остался служебный текст','Замените заглушку содержанием.',category='content',severity='error')
        if slide.kind=='image' and not slide.image_data and not any(a['id']==slide.template_asset_id for a in template['metadata'].get('assets',[])):
            add('image_missing','Нет иллюстрации','Подключите генератор изображений и создайте иллюстрацию в редакторе.',category='content',severity='error',obj='image-placeholder')
        if slide.kind in {'icons','diagram'} and len(slide.bullets)>6:
            add('visual_capacity','Схема содержит больше шести элементов','Разделите схему: на этом слайде показаны только первые шесть пунктов.',category='content',severity='error')

        # === высокоприоритетные проверки шаблона и плотности ===
        _check_font_from_template(scene['objects'], template, index, add)
        _check_color_palette(scene['objects'], template, index, add)

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

        # === заполненность слайда (плотность) ===
        _check_slide_density(scene['objects'], scene, index, add)

    # === глобальная проверка: дубликаты слайдов ===
    seen_keys = {}
    for idx, sl in enumerate(content.slides):
        key = (normalize(sl.title), normalize(sl.body), tuple(normalize(b) for b in sl.bullets),
               str(sl.chart), str(sl.table), sl.template_asset_id, sl.image_data)
        if key in seen_keys:
            issues.append(Issue(id=f'{idx}:duplicate:body',slide=idx,code='duplicate',
                title='Слайд дублирует предыдущий',detail=f'Слайд {idx+1} повторяет содержание слайда {seen_keys[key]+1}.',
                category='integrity',severity='warning'))
        else:
            seen_keys[key] = idx

    return issues
