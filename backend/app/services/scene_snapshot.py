"""Bounded PNG of the current preview scene for vision-capable providers.

Uses the same expanded primitives and bundled fonts, never opens network URLs.
It is a preview rendering, not a promise of PowerPoint pixel parity.
"""
import base64
from functools import lru_cache
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from .layout import FONTS, geometry_nodes


@lru_cache(maxsize=128)
def font(size, bold):
    return ImageFont.truetype(str(FONTS / ('Manrope-Bold.ttf' if bold else 'Manrope-Regular.ttf')), size)


def scene_image(scene):
    image = Image.new('RGB', (max(1, round(scene['width'])), max(1, round(scene['height']))), 'white')
    draw = ImageDraw.Draw(image)
    for obj in scene.get('render_objects', scene['objects']):
        for node in ([obj] if 'render_objects' in scene else geometry_nodes(obj)):
            kind = node['type']
            x, y = node.get('x', 0), node.get('y', 0)
            w, h = node.get('w', 0), node.get('h', 0)
            if kind in {'rect', 'ellipse'}:
                if w > 0 and h > 0:
                    getattr(draw, 'rectangle' if kind == 'rect' else 'ellipse')((x, y, x+w, y+h), fill=node['fill'])
            elif kind == 'line':
                draw.line((node['x1'], node['y1'], node['x2'], node['y2']), fill=node['stroke'], width=max(1, round(node['stroke_width'])))
            elif kind in {'polygon', 'hexagon'}:
                if kind == 'hexagon':
                    from .visuals import hexagon_points
                    points = hexagon_points(node)
                else:
                    points = node['points']
                draw.polygon(points, fill=node['fill'])
            elif kind == 'image' and node.get('src', '').startswith('data:image/png;base64,'):
                with Image.open(BytesIO(base64.b64decode(node['src'].split(',', 1)[1]))) as asset:
                    resized = asset.convert('RGBA').resize((max(1, round(w)), max(1, round(h))))
                    image.paste(resized, (round(x), round(y)), resized)
            elif kind == 'text':
                size = node['font_size']
                face = font(max(1, round(size)), node.get('bold', False))
                for i, line in enumerate(node['lines']):
                    draw.text((x, y+i*size*node.get('line_spacing', 1.28)), line, font=face, fill=node['color'], anchor='lt')
    image.thumbnail((1280, 960))
    stream = BytesIO()
    image.save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()
