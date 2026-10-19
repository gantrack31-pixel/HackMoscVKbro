"""Deterministic, editable analytical scenes. No data are rounded before plotting.

The chart object retains the complete canonical series for native PPTX. Its
expanded geometry is shared by browser, HTML, PDF and object-linked audit.
"""
from __future__ import annotations
import math
from .palette import roles, hex_color, blend, safe_ink, protect_foregrounds, surface_at


def number_label(value: float | None) -> str:
    """Six significant figures, including tiny nonzero values; Russian decimals."""
    if value is None:
        return '—'
    if value == 0:
        return '0'
    return format(value, '.6g').replace('.', ',').replace('e-', 'e−')


def percent_label(value: float) -> str:
    # Ordinary shares need one decimal; very small shares retain significance.
    return (format(value, '.1f').replace('.', ',') if abs(value)>=.1 else number_label(value))+'%'


def axis_range(values, *, zero=True):
    values = [v for v in values if v is not None and math.isfinite(v)]
    if not values:
        return 0., 1.
    low, high = min(values), max(values)
    if zero:
        low, high = min(0., low), max(0., high)
    if low == high:
        pad = abs(low) * .1 or 1.
        return (0., pad) if zero and low == 0 else (low - pad, high + pad)
    if not zero:
        pad = (high - low) * .06
        low, high = low - pad, high + pad
    return low, high


def axis_scale(values, *, zero=True):
    low,high=axis_range(values,zero=zero)
    rough=(high-low)/4
    magnitude=10**math.floor(math.log10(rough))
    step=next(f for f in (1,2,2.5,5,10) if f>=rough/magnitude-1e-12)*magnitude
    start=math.floor(low/step+1e-10);end=math.ceil(high/step-1e-10)
    ticks=[i*step if i else 0. for i in range(start,end+1)]
    return ticks[0],ticks[-1],step,ticks


def series_colors(metadata, count):
    theme = roles(metadata)
    colors = [c for value in metadata.get('chart_palette',[]) if (c:=hex_color(value))] or [theme['accent']]
    for value in [*metadata.get('palette', []), *metadata.get('colors', {}).values()]:
        color = hex_color(value)
        if color and color not in colors and color not in {theme['background'], theme['text']}:
            colors.append(color)
    # Derive additional series from brand ink/accent; never introduce unrelated hues.
    candidates = [blend(theme['accent'], theme['text'], v) for v in (.68, .36, .84, .52, .2)]
    colors.extend(c for c in candidates if c not in colors)
    return (colors * (count // len(colors) + 1))[:count]


def _text(identifier, value, x, y, w, h, size, color, *, bold=False, role='label', minimum=16):
    from .layout import fit_text
    lines, size = fit_text(str(value), {'x': x, 'y': y, 'w': max(1, w), 'h': max(1, h)}, size, minimum, bold, 1.18)
    return {'id': identifier, 'type': 'text', 'x': x, 'y': y, 'w': w, 'h': h,
            'text': str(value), 'lines': lines, 'font_size': size, 'bold': bold,
            'color': color, 'font_family': 'Manrope', 'line_spacing': 1.18,
            'used_height': len(lines) * size * 1.18, 'role': role}


def analysis_scene(slide, metadata, variant, index, *, layout=None, background_info=None, original_background=None):
    """Three compositions with invariant facts, sources, labels and calculations."""
    visual = slide.analytics
    theme = roles(metadata)
    width, height = 1280., 1280. / metadata.get('ratio', 16 / 9)
    margin = min(120., max(24., float(metadata.get('slide_margin', 56))))
    footer_y = height - 58
    objects = [{'id': 'background', 'type': 'rect', 'x': 0., 'y': 0., 'w': width, 'h': height,
                'fill': theme['background'], 'override_template': theme['background'] != original_background}]
    title_size = min(48., max(34., float(metadata.get('heading_pt', 32)) * 1.35))
    intro = slide.body.strip()
    if intro == slide.title.strip() or intro == visual.takeaway.strip():
        intro = ''
    if variant == 'b':
        # A narrative column beside the evidence, with a continuous vertical rule.
        left_w = 300.
        objects.append({'id': 'analysis-rule', 'type': 'rect', 'x': margin + left_w + 20,
                        'y': margin, 'w': 3., 'h': footer_y - margin - 16, 'fill': theme['accent']})
        objects.append(_text('title', slide.title, margin, margin, left_w, height * .42, title_size * .82,
                             theme['text'], bold=True, role='title', minimum=30))
        if intro:
            objects.append(_text('body', intro, margin, height * .53, left_w, max(70, footer_y - height * .53 - 20),
                                 22, theme['muted'], role='body', minimum=18))
        area = {'x': margin + left_w + 52, 'y': margin + 12,
                'w': width - 2 * margin - left_w - 52, 'h': footer_y - margin - 34}
    else:
        # A: takeaway above a wide plot. C: compact editorial heading, more evidence space.
        top = margin if variant == 'a' else margin + 12
        title_h = min(112., height * .18) if variant == 'a' else min(92., height * .15)
        objects.append(_text('title', slide.title, margin, top, width - margin * 2, title_h,
                             title_size if variant == 'a' else title_size * .87, theme['text'],
                             bold=True, role='title', minimum=28))
        if variant == 'c':
            objects.append({'id': 'analysis-rule', 'type': 'rect', 'x': margin, 'y': top - 12,
                            'w': width - margin * 2, 'h': 2., 'fill': theme['accent']})
        intro_h = 42. if intro else 0.
        if intro:
            objects.append(_text('body', intro, margin, top + title_h + 2, width - margin * 2,
                                 intro_h, 21, theme['muted'], role='body', minimum=18))
        area_y = top + title_h + intro_h + (14 if variant == 'a' else 6)
        area = {'x': margin, 'y': area_y, 'w': width - 2 * margin, 'h': footer_y - area_y - 22}

    if visual.chart_type == 'table':
        rows = [visual.columns, *visual.rows]
        objects.append({'id': 'analysis-table', 'type': 'table', **area, 'rows': rows,
                        'fill': theme['accent'], 'header_color': theme['on_accent'], 'theme': theme,
                        'font_size': 18., 'font_family': 'Manrope', 'analytical': True})
    elif visual.chart_type == 'kpi':
        count = len(visual.kpis)
        columns = min(3 if variant != 'b' else 2, count)
        row_count = math.ceil(count / columns)
        gap = min(48.,max(8.,float(metadata.get('grid_gap',24))))
        cell_w = (area['w'] - gap * (columns - 1)) / columns
        cell_h = (area['h'] - gap * (row_count - 1)) / row_count
        for i, item in enumerate(visual.kpis):
            x, y = area['x'] + (i % columns) * (cell_w + gap), area['y'] + (i // columns) * (cell_h + gap)
            objects.append({'id': f'kpi-rule-{i}', 'type': 'rect', 'x': x, 'y': y,
                            'w': 4., 'h': cell_h, 'fill': theme['accent']})
            objects.append(_text(f'kpi-label-{i}', item.label, x + 20, y + 8, cell_w - 30,
                                 cell_h * .25, 22, theme['text'], bold=True))
            display = number_label(item.value) + (f' {item.unit}' if item.unit else '')
            objects.append(_text(f'kpi-value-{i}', display, x + 20, y + cell_h * .3,
                                 cell_w - 30, cell_h * .36, 48 if variant != 'c' else 58,
                                 safe_ink(theme['accent'], theme['background'], metadata), bold=True, minimum=28))
            aggregation={'sum':'Сумма','mean':'Среднее','last':'Последний снимок','count':'Наблюдения','none':'Исходное значение'}.get(item.aggregation,item.aggregation)
            detail = ' · '.join(part for part in (aggregation, item.period) if part)
            objects.append(_text(f'kpi-context-{i}', detail, x + 20, y + cell_h * .72,
                                 cell_w - 30, cell_h * .25, 17, theme['muted']))
    else:
        objects.append({'id': 'analysis-chart', 'type': 'chart', **area,
                        'analytical': True, 'analysis': visual.model_dump(),
                        'labels': visual.labels, 'values': visual.series[0].values,
                        'unit': visual.series[0].unit, 'chart_type': visual.chart_type,
                        'fill': theme['accent'], 'theme': theme, 'font_family': 'Manrope',
                        'grid': metadata.get('chart_grid','major'),
                        'colors': series_colors(metadata, max(len(visual.labels) if visual.chart_type == 'pie' else len(visual.series), 1))})

    source = visual.source or slide.source_quote
    objects.append(_text('analysis-source', f'Источник: {source}' if source else 'Источник не указан',
                         margin, footer_y, width - 2 * margin - 72, 44., 15., theme['muted'],
                         role='source', minimum=14))
    objects.append(_text('footer', f'{index + 1:02}', width - margin - 40, footer_y, 40, 28,
                         15, theme['muted'], role='caption', minimum=14))
    from .layout import geometry_nodes
    corrections = protect_foregrounds(objects, metadata)
    rendered = [node for obj in objects for node in geometry_nodes(obj)]
    # Keep chart-series strokes visually distinct; only text ink needs WCAG correction.
    for position,node in enumerate(rendered):
        if node['type'] == 'text':
            node['color'] = safe_ink(node['color'], surface_at(node,rendered[:position],theme['background']), metadata)
    requested_font = metadata.get('body_font') or metadata.get('font', 'Manrope')
    font_warnings = [] if requested_font.casefold() == 'manrope' else [
        f'Шрифт «{requested_font}» заменён на Manrope в аналитических слайдах: нет подтверждённого файла шрифта для одинаковой вёрстки всех форматов.']
    scene={'width': width, 'height': height, 'variant': variant, 'objects': objects,
            'render_objects': rendered, 'color_corrections': corrections,
            'font_warnings': font_warnings, 'background_info': background_info or {},
            'template_background': original_background,
            'layout_key': {'master': layout['master'], 'index': layout['index']} if layout else None,
            'template_layout': layout['name'] if layout else 'Аналитическая композиция',
            'preview_note': 'Данные, подписи и источники общие для всех форматов. Размещение нативной диаграммы в Office может отличаться.'}
    if metadata.get('brand_logo'):
        from .brand_style import add_brand_logo
        scene=add_brand_logo(scene,metadata)
    return scene


def analytical_geometry(obj):
    data, theme = obj['analysis'], obj['theme']
    kind, series, labels = data['chart_type'], data['series'], data['labels']
    x, y, w, h = (obj[k] for k in ('x', 'y', 'w', 'h'))
    colors = obj['colors']
    nodes = []

    def text(id, value, tx, ty, tw, th, size=17, bold=False, role='chart-label'):
        node = _text('analysis-' + id, value, tx, ty, tw, th, size, theme['text'], bold=bold, role=role)
        node['parent_id'] = obj['id']
        nodes.append(node)

    def rect(id, rx, ry, rw, rh, fill):
        nodes.append({'id': 'analysis-' + id, 'type': 'rect', 'x': rx, 'y': ry, 'w': rw, 'h': rh,
                      'fill': fill, 'parent_id': obj['id']})

    def line(id, x1, y1, x2, y2, color, width=1):
        nodes.append({'id': 'analysis-' + id, 'type': 'line', 'x': min(x1, x2), 'y': min(y1, y2),
                      'w': abs(x2 - x1), 'h': abs(y2 - y1), 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
                      'stroke': color, 'stroke_width': width, 'parent_id': obj['id']})

    def dot(id, dx, dy, color):
        nodes.append({'id': 'analysis-' + id, 'type': 'ellipse', 'x': dx - 4, 'y': dy - 4,
                      'w': 8, 'h': 8, 'fill': color, 'parent_id': obj['id']})

    # Pie has a vertical text legend with percentages outside the sectors.
    if kind == 'pie':
        values = series[0]['values']
        total = math.fsum(values)
        side = min(w * .5, h - 8)
        radius, cx, cy = side / 2, x + side / 2, y + h / 2
        angle = -math.pi / 2
        for i, value in enumerate(values):
            end = angle + value / total * 2 * math.pi
            if value:
                steps = max(2, math.ceil((end - angle) * 30))
                points = [(cx, cy)] + [(cx + radius * math.cos(angle + (end-angle)*j/steps),
                                       cy + radius * math.sin(angle + (end-angle)*j/steps)) for j in range(steps+1)]
                nodes.append({'id': f'analysis-sector-{i}', 'type': 'polygon', 'x': cx-radius, 'y': cy-radius,
                              'w': side, 'h': side, 'points': points, 'fill': colors[i], 'parent_id': obj['id']})
            row_h = min(58., h / len(labels))
            ly = y + (h - row_h * len(labels)) / 2 + i * row_h
            lx = x + side + 30
            rect(f'pie-key-{i}', lx, ly + 8, 12, 12, colors[i])
            text(f'pie-label-{i}', labels[i], lx + 24, ly, w - side - 174, row_h - 4)
            text(f'pie-value-{i}', percent_label(value / total * 100), x + w - 112, ly, 112, row_h - 4, bold=True)
            angle = end
        return nodes

    legend_h = 0.
    if len(series) > 1:
        legend_cols = min(len(series), max(1, int(w // 210)))
        legend_rows = math.ceil(len(series) / legend_cols)
        legend_h = legend_rows * 36.
        for i, item in enumerate(series):
            lx, ly = x + (i % legend_cols) * (w / legend_cols), y + (i // legend_cols) * 36
            rect(f'legend-key-{i}', lx, ly + 9, 16, 5, colors[i])
            text(f'legend-label-{i}', item['name'], lx + 24, ly, w / legend_cols - 36, 32, role='legend')
    unit = series[0].get('unit', '')
    y_caption = data.get('y_label') or unit
    if y_caption and unit and unit not in y_caption:
        y_caption += f', {unit}'
    caption_h = 32. if y_caption else 0.
    if y_caption:
        text('y-title', y_caption, x, y + legend_h, w, 28, 16, role='axis-title')
    bottom_h = 64. + (28 if data.get('x_label') else 0)
    px, py = x + 82, y + legend_h + caption_h + 8
    pw, ph = w - 102, max(24., h - legend_h - caption_h - bottom_h - 8)
    values = [v for item in series for v in item['values'] if v is not None]
    if kind == 'stacked':
        values = [sum(max(0, item['values'][i] or 0) for item in series) for i in range(len(labels))] + [
            sum(min(0, item['values'][i] or 0) for item in series) for i in range(len(labels))]
    low, high, y_step, y_ticks = axis_scale(values)
    value_y = lambda value: py + (high-value)/(high-low)*ph
    for tick,value in enumerate(y_ticks):
        ty = value_y(value)
        if obj.get('grid','major')!='none':line(f'grid-{tick}', px, ty, px+pw, ty, theme['border'])
        text(f'y-tick-{tick}', number_label(value), x, ty-10, 72, 26, 16, role='axis-tick')
    line('zero-axis', px, value_y(0), px+pw, value_y(0), theme['muted'], 1.5)
    obj['axis_bounds'] = {'y_min': low, 'y_max': high, 'y_step':y_step}
    obj['plot_box'] = {'x': px, 'y': py, 'w': pw, 'h': ph}
    if data.get('x_label'):
        text('x-title', data['x_label'], px, y+h-26, pw, 26, 16, role='axis-title')

    if kind == 'scatter':
        xs = data['x_values']
        xlow, xhigh, x_step, x_ticks = axis_scale(xs, zero=False)
        obj['axis_bounds'].update(x_min=xlow, x_max=xhigh, x_step=x_step)
        for tick,vx in enumerate(x_ticks):
            tx = px + pw*(vx-xlow)/(xhigh-xlow)
            text(f'x-tick-{tick}', number_label(vx), max(x, min(tx-30, x+w-90)), py+ph+12, 90, 28, 16, role='axis-tick')
        for si, item in enumerate(series):
            for i, (vx, vy) in enumerate(zip(xs, item['values'])):
                if vx is not None and vy is not None:
                    dot(f'point-{si}-{i}', px+(vx-xlow)/(xhigh-xlow)*pw, value_y(vy), colors[si])
        return nodes

    step = pw / len(labels)
    # All observations are drawn. Dense axis labels use a documented stride, not data truncation.
    stride = max(1, math.ceil(len(labels) / max(2, int(pw // 95))))
    obj['label_stride'] = stride
    available = min(step * stride * .9, 180)
    def label_box(i):
        return max(px, min(px + (i+.5)*step - available/2, px+pw-available))
    selected=[]
    for i in range(0,len(labels),stride):
        if not selected or label_box(i)>=label_box(selected[-1])+available+8:
            selected.append(i)
    # Clamping the final label into the plot can collide with the preceding
    # stride tick. Reserve the endpoint first and remove its nearby neighbour.
    last=len(labels)-1
    if last not in selected:
        while selected and label_box(last)<label_box(selected[-1])+available+8:
            selected.pop()
        selected.append(last)
    obj['label_indices']=selected
    for i in selected:
        text(f'category-{i}', labels[i], label_box(i), py+ph+10, available, 48, 16, role='category')
    for si, item in enumerate(series):
        previous = None
        for i, value in enumerate(item['values']):
            if value is None:
                previous = None  # missing observations remain visible as line gaps
                continue
            tx = px + (i+.5)*step
            ty = value_y(value)
            if kind == 'line':
                if previous:
                    line(f'segment-{si}-{i}', *previous, tx, ty, colors[si], 3)
                dot(f'point-{si}-{i}', tx, ty, colors[si])
                previous = tx, ty
            else:
                if kind == 'stacked':
                    base = sum((s['values'][i] or 0) for s in series[:si]
                               if ((s['values'][i] or 0) >= 0) == (value >= 0))
                    top, bottom = value_y(base+value), value_y(base)
                    bx, bw = tx-step*.33, step*.66
                elif kind == 'grouped' or len(series) > 1:
                    bw = step*.78 / len(series)
                    bx = tx-step*.39+si*bw
                    top, bottom = ty, value_y(0)
                    bw *= .92
                else:
                    bw = step*(.98 if kind == 'histogram' else .66)
                    bx, top, bottom = tx-bw/2, ty, value_y(0)
                rect(f'bar-{si}-{i}', bx, min(top,bottom), bw, abs(bottom-top), colors[si])
    return nodes
