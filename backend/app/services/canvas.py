"""User-directed canvas edits, rendered as the same editable native objects."""
from .palette import roles, protect_foregrounds
from .font_support import text_fonts


def explicit_layout(slide):
    designs = [slide.design, *slide.designs.values()]
    return bool(slide.elements or any(design and design.objects for design in designs))


def apply_canvas(scene, slide, metadata):
    from .layout import geometry_nodes, wrap
    from .icons import icon_data

    design = slide.design
    if not slide.elements and not (design and (design.objects or design.background_color
            or design.text_color or design.heading_color or design.accent_color)):
        return scene
    styles = design.objects if design else {}
    theme = roles(metadata)
    objects = scene['objects']
    background_color = ((styles.get('background').fill if styles.get('background') else None)
                        or (design.background_color if design else None))
    if background_color:
        background = objects[0]
        background.update(fill=background_color, override_template=True, explicit_style=True)
        # Cover source master graphics in PPTX as well as changing the slide fill.
        objects.insert(1, {'id': 'canvas-background', 'type': 'rect', 'x': 0, 'y': 0,
                          'w': scene['width'], 'h': scene['height'], 'fill': background_color,
                          'z_index': -1000, 'explicit_style': True})

    for element in slide.elements:
        obj = element.model_dump(include={'id', 'type', 'x', 'y', 'w', 'h', 'text', 'color',
            'fill', 'stroke', 'stroke_width', 'font_size', 'bold', 'z_index'})
        obj['explicit_style'] = True
        if element.type == 'chart':
            obj.update(labels=element.chart.labels, values=element.chart.values,
                       unit=element.chart.unit, chart_type=element.chart.chart_type,
                       theme={**theme, 'text': element.color})
        elif element.type == 'table':
            obj.update(rows=element.table, header_color=element.color, theme={**theme, 'text': element.color})
        elif element.type == 'line':
            obj.update(x1=element.x, x2=element.x+element.w,
                       y1=element.y+element.h if element.reverse_line else element.y,
                       y2=element.y if element.reverse_line else element.y+element.h)
        elif element.type in {'image', 'icon'}:
            asset = next((a for a in metadata.get('assets', []) if a['id'] == element.template_asset_id), {})
            src = icon_data(element.icon_name, element.color) if element.type == 'icon' else (
                slide.element_images.get(element.id) or asset.get('data', ''))
            if src:
                obj.update(type='image', src=src)
            else:
                obj.update(type='text', text='Изображение недоступно')
        objects.append(obj)

    editable = {obj['id'] for obj in objects}
    editable.update(node['id'] for obj in objects for node in geometry_nodes(obj))

    def customize(obj, style=None):
        if design and design.accent_color and (obj.get('fill') == design.accent_color or obj['type'] == 'chart'):
            obj.update(fill=design.accent_color, explicit_style=True)
        if style:
            old = {key: obj[key] for key in ('x', 'y', 'w', 'h')}
            obj.update(style.model_dump(exclude_none=True, exclude={'hidden'}))
            obj['explicit_style'] = True
            if obj['type'] in {'chart', 'table'} and style.color:
                obj['theme'] = {**obj.get('theme', theme), 'text': style.color}
                if obj['type'] == 'table': obj['header_color'] = style.color
            if obj['type'] == 'line':
                for axis, size in (('x', 'w'), ('y', 'h')):
                    for endpoint in ('1', '2'):
                        key = axis + endpoint
                        fraction = (obj[key]-old[axis])/old[size] if old[size] else (endpoint == '2')
                        obj[key] = obj[axis]+fraction*obj[size]
            if obj['type'] == 'polygon':
                obj['points'] = [
                    [obj['x']+(x-old['x'])*obj['w']/old['w'] if old['w'] else obj['x'],
                     obj['y']+(y-old['y'])*obj['h']/old['h'] if old['h'] else obj['y']]
                    for x, y in obj.get('points', [])]
        if obj['type'] == 'text':
            if design and (design.heading_color if obj['id'] == 'title' else design.text_color):
                obj['color'] = design.heading_color if obj['id'] == 'title' else design.text_color
                obj['explicit_style'] = True
            # Object colors have precedence over whole-slide text colors.
            if style and style.color:
                obj['color'] = style.color
            obj.update(text_fonts(obj.get('role','body'),obj.get('font_family'),obj.get('bold',False),obj.get('text','')))
            obj.setdefault('line_spacing', 1.2)
            obj.setdefault('bold', False)
            obj['lines'] = wrap(obj.get('text', ''), max(1, obj['w']), obj['font_size'], obj['bold'],obj['effective_font_family'])
            obj['used_height'] = len(obj['lines'])*obj['font_size']*obj['line_spacing']
        if obj['id'] == 'background':
            obj.update(x=0, y=0, w=scene['width'], h=scene['height'])
            if style and style.fill:
                obj['override_template'] = True
        return obj

    objects = [customize(obj, styles.get(obj['id'])) for obj in objects
               if obj['id'] == 'background' or not (styles.get(obj['id']) and styles[obj['id']].hidden)]
    objects = [objects[0], *[obj for _, obj in sorted(enumerate(objects[1:]),
               key=lambda item: (item[1].get('z_index', item[0]), item[0]))]]
    rendered, export_objects = [], []
    for obj in objects:
        children, expanded_edit = [], False
        for node in geometry_nodes(obj):
            if 'z_index' in obj: node.setdefault('z_index', obj['z_index'])
            if obj['type'] == 'chart' and node['type'] == 'text':
                if obj.get('font_size'): node['font_size'] = obj['font_size']
                if obj.get('color'): node['color'] = obj['color']
            if obj.get('explicit_style'):
                node['explicit_style'] = True
            style = styles.get(node['id']) if node['id'] != obj['id'] else None
            expanded_edit = expanded_edit or style is not None
            if style and style.hidden:
                continue
            children.append(customize(node, style))
        rendered.extend(children)
        export_objects.extend(children if expanded_edit else [obj])
    protect_foregrounds(rendered, metadata)
    if any(style.z_index is not None for style in styles.values()):
        def layers(items):
            background = [obj for obj in items if obj['id'] == 'background']
            rest = [(i,obj) for i,obj in enumerate(items) if obj['id'] != 'background']
            return background + [obj for _,obj in sorted(rest, key=lambda item:(item[1].get('z_index',item[0]),item[0]))]
        rendered, export_objects = layers(rendered), layers(export_objects)
    scene.update(objects=export_objects, render_objects=rendered, editable_object_ids=sorted(editable))
    return scene
