"""Проверки геометрии воспроизводимы; смысловые замечания LLM помечены отдельно."""
import re
from ..models import DeckContent, Issue
from .layout import build_scene, wrap
from .sources import slide_binding
from .palette import allowed_color, surface_at

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


def audit_deck(content: DeckContent, template: dict, variant: str, source: str, *, scenes=None, bindings=None) -> list[Issue]:
    if scenes is not None and len(scenes)!=len(content.slides): raise ValueError('Scene count does not match content')
    issues=[]
    for index,slide in enumerate(content.slides):
        scene=scenes[index] if scenes is not None else build_scene(slide,template['metadata'],variant,index)
        def add(code,title,detail,category='layout',severity='warning',fixable=False,obj='body'):
            issues.append(Issue(id=f'{index}:{code}:{obj}',slide=index,code=code,title=title,detail=detail,
                                category=category,severity=severity,fixable=fixable,object_id=obj))
        rendered=scene.get('render_objects',scene['objects'])
        brand=template['metadata'].get('brand_style',{})
        for mapping in brand.get('font_mapping',[]):
            if mapping.get('substituted'):
                add('brand_font_'+mapping['role'],'Шрифт брендбука заменён',
                    f'Запрошен {mapping["requested"]}; для согласованного отображения используется {mapping["effective"]}.',
                    category='template',severity='info',obj='title')
        if brand.get('unresolved_rules') and index==0:
            add('brand_unresolved_rules','Часть правил требует ручной проверки',
                f'В руководстве осталось {len(brand["unresolved_rules"])} правил, которые нельзя надёжно применить автоматически. Они сохранены в настройках стиля.',
                category='template',severity='info',obj='title')
        logo=template['metadata'].get('brand_logo',{})
        if logo.get('visible_colors') and all(contrast(c,scene['objects'][0]['fill'])<3 for c in logo['visible_colors']):
            add('brand_logo_contrast','Логотип сливается с фоном','Выберите подходящий вариант исходного логотипа или фон. Цвета логотипа не меняются автоматически.',category='template',obj='brand-logo')
        for position,obj in enumerate(rendered):
            if obj['type']=='text' or obj.get('icon_color'):
                color=obj.get('icon_color') or obj.get('color')
                background=surface_at(obj,rendered[:position],scene['objects'][0]['fill'])
                if color and contrast(color,background)<4.5:
                    add('contrast_title' if obj['id']=='title' else 'contrast_visual','Недостаточный контраст',
                        'Контраст ниже 4.5:1. Безопасный цвет применяется при пересборке слайда без изменения текста.',
                        category='template',fixable=True,obj=obj['id'])
            if slide.analytics and obj['id'].startswith(('analysis-bar-','analysis-point-','analysis-segment-','analysis-sector-','analysis-legend-key-')):
                color=obj.get('fill') or obj.get('stroke')
                if color and contrast(color,scene['objects'][0]['fill'])<3:
                    add('analysis_mark_contrast','Данные сливаются с фоном','Выберите контрастный цвет ряда в стиле. Исходные числа и фирменные цвета не меняются автоматически.',category='template',obj=obj['id'])
        if (scene.get('template_background') and not scene['objects'][0].get('override_template')
                and scene['objects'][0]['fill']!=scene['template_background']):
            add('background_replaced','Фон отличается от шаблона','Пересоберите визуальные метаданные с исходным фоном.',category='template',fixable=True,obj='background')
        color_issues={}
        color_validity={}
        for obj in scene.get('render_objects',scene['objects']):
            if obj.get('explicit_style'): continue
            for key in ('color','fill','stroke'):
                value=obj.get(key)
                if value and value not in color_validity:
                    color_validity[value]=allowed_color(value,template['metadata'])
                if value and not color_validity[value]:color_issues.setdefault(value,set()).add(obj['id'])
        for value, ids in color_issues.items():
            add('color_off_palette_'+value.lstrip('#'),'Цвет не из палитры шаблона',
                f'Цвет {value} используется в {len(ids)} объектах и отличается от палитры активного шаблона. Проверьте оформление.',
                category='template',obj=sorted(ids)[0])
        # Inspect expanded chart labels, ticks, legends, table cells and sources too.
        # Parent chart/table bounds alone cannot prove that their content fits.
        audit_objects={obj['id']:obj for obj in [*scene['objects'],*rendered]}
        for obj in audit_objects.values():
            if not all(isinstance(obj.get(key),(int,float)) for key in ('x','y','w','h')):
                add('geometry_missing','Геометрия объекта недоступна','Пересоберите слайд, чтобы проверить размещение этого объекта.',severity='error',obj=obj['id'])
                continue
            if obj['x']<0 or obj['y']<0 or obj['x']+obj['w']>scene['width']+.1 or obj['y']+obj['h']>scene['height']+.1:
                add('bounds','Объект выходит за слайд','Измените композицию или сократите содержание.',severity='error',obj=obj['id'])
            if obj['type']=='text' and obj['id'] not in {'number','footer'}:
                if obj['used_height']>obj['h']:
                    add('overflow','Текст не помещается в блок','Автоподбор уже достиг безопасного минимума. Сократите текст, измените композицию или разделите содержание.',severity='error',fixable=False,obj=obj['id'])
            if obj['type']=='table':
                cell_width=obj['w']/len(obj['rows'][0])-24;cell_height=obj['h']/len(obj['rows'])-16
                if any(len(wrap(cell,cell_width,obj['font_size']))*obj['font_size']*1.28>cell_height for row in obj['rows'] for cell in row):
                    add('table_density','Текст в таблице не помещается','Сократите ячейки или разделите таблицу на несколько слайдов.',severity='error',obj=obj['id'])
            if obj['type']=='chart' and not obj.get('analytical'):
                row_height=(obj['h']-32)/len(obj['labels'])-8
                if any(len(wrap(label,min(176,obj['w']*.24),18))*23>row_height for label in obj['labels']):
                    add('chart_labels','Подписи диаграммы слишком длинные','Сократите подписи категорий, сохранив смысл.',category='content',obj=obj['id'])
        if len(slide.bullets)>6: add('density','Слишком много тезисов','На слайде больше шести пунктов. Разделите их.',category='content')
        if any(len(b.split())>15 for b in slide.bullets): add('long_bullet','Длинный пункт списка','Есть пункт длиннее 15 слов. Сократите или вынесите пояснение в заметки.',category='content')
        if slide.kind=='chart' and slide.chart and not slide.chart.unit:
            add('chart_unit','Не указана единица измерения','Добавьте единицу измерения в данные диаграммы.',category='content',obj='chart')
        if slide.analytics:
            analysis=slide.analytics
            from .analytics_plan import validate_analytical_visual
            for number,detail in enumerate(validate_analytical_visual(analysis)):
                add(f'analysis_invalid_{number}','Расчёты требуют обновления',detail,
                    category='content',severity='error',obj='analysis-chart')
            if not analysis.source.strip():
                add('analysis_source_missing','Источник данных не указан','Укажите файл или таблицу, на которых основаны расчёты.',category='source',obj='analysis-source')
            if not analysis.dataset_fingerprint:
                add('analysis_lineage_missing','Нет версии исходных данных','Пересоберите анализ из исходной таблицы, чтобы связать выводы с проверенными данными.',category='source',obj='analysis-chart')
            if analysis.chart_type not in {'table','kpi','pie'} and not (analysis.y_label or all(s.unit for s in analysis.series)):
                add('analysis_unit_missing','Не указана величина по оси','Добавьте название показателя и единицу измерения.',category='content',obj='analysis-chart')
            for number,warning in enumerate(analysis.warnings):
                add(f'analysis_data_warning_{number}','Ограничение исходных данных',warning,category='content',obj='analysis-chart')
            if analysis.chart_type=='kpi' and any(not item.aggregation or not item.period for item in analysis.kpis):
                add('analysis_kpi_context','Уточните расчёт показателя','Для KPI нужны способ расчёта и период или дата снимка.',category='content',obj='kpi-context-0')
            if analysis.takeaway and slide.title.strip()!=analysis.takeaway.strip():
                add('analysis_headline_changed','Вывод изменён после расчёта','Текущий заголовок отличается от вычисленного вывода. Проверьте числа и смысл или пересоберите анализ.',category='content',obj='title')
            for warning in scene.get('font_warnings',[]):
                add('analysis_font_fallback','Использован доступный шрифт',warning,category='template',severity='info',obj='title')
        binding=bindings[index] if bindings is not None else slide_binding(slide,source) if not slide.analytics else {'status':'matched'}
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
        for element in slide.elements:
            if element.type == 'image' and not slide.element_images.get(element.id) and not any(
                    a['id'] == element.template_asset_id and a.get('data') for a in template['metadata'].get('assets', [])):
                add('image_missing', 'Нет изображения объекта', 'Выберите доступное изображение или создайте иллюстрацию.',
                    category='content', severity='error', obj=element.id)
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

        if not slide.analytics:
            for warning in scene.get('font_warnings',[]):
                add('font_fallback','Использован переносимый шрифт',warning,category='template',severity='info',obj='title')

        if slide.analytics:
            # Text marks are separate editable/annotatable objects. Intentional
            # containment (a label over a colored cell) is not a text collision.
            text_marks=[o for o in rendered if o['type']=='text' and o['id'].startswith(('analysis-','kpi-'))
                        and o.get('text','').strip()]
            collided=set()
            for left_index,a in enumerate(text_marks):
                for b in text_marks[left_index+1:]:
                    iw=min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])
                    ih=min(a['y']+min(a['h'],a['used_height']),b['y']+min(b['h'],b['used_height']))-max(a['y'],b['y'])
                    if iw>5 and ih>5 and b['id'] not in collided:
                        collided.add(b['id'])
                        add('analysis_label_overlap','Подписи данных пересекаются','Уменьшите число категорий на слайде, измените композицию или вынесите таблицу в приложение.',severity='error',obj=b['id'])

    return issues
