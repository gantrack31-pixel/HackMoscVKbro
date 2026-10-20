"""Pointer-driven layout overrides use the same geometry in previews and exports."""
from app.models import Slide
from app.services.canvas import apply_canvas


def test_polygon_points_follow_layout_box_without_mutating_source_geometry():
    scene = {'width': 1280, 'height': 720, 'objects': [
        {'id': 'background', 'type': 'rect', 'x': 0, 'y': 0, 'w': 1280, 'h': 720, 'fill': '#FFFFFF'},
        {'id': 'triangle', 'type': 'polygon', 'x': 100, 'y': 200, 'w': 200, 'h': 100,
         'points': [[100, 300], [200, 200], [300, 300]], 'fill': '#0077FF'},
    ]}
    original_points = scene['objects'][1]['points']
    slide = Slide(title='Layout', design={'objects': {'triangle': {'x': 300, 'y': 100, 'w': 400, 'h': 50}}})
    result = apply_canvas(scene, slide, {})
    polygon = next(obj for obj in result['render_objects'] if obj['id'] == 'triangle')
    assert polygon['points'] == [[300, 150], [500, 100], [700, 150]]
    assert original_points == [[100, 300], [200, 200], [300, 300]]
    assert next(obj for obj in result['objects'] if obj['id'] == 'triangle')['points'] == polygon['points']


def test_horizontal_and_reverse_lines_follow_layout_overrides():
    for y1, y2 in [(100, 100), (150, 100)]:
        scene = {'width': 1280, 'height': 720, 'objects': [
            {'id': 'background', 'type': 'rect', 'x': 0, 'y': 0, 'w': 1280, 'h': 720, 'fill': '#FFFFFF'},
            {'id': 'connector', 'type': 'line', 'x': 100, 'y': 100, 'w': 200, 'h': abs(y2-y1),
             'x1': 100, 'y1': y1, 'x2': 300, 'y2': y2, 'stroke': '#0077FF', 'stroke_width': 2},
        ]}
        slide = Slide(title='Layout', design={'objects': {'connector': {'x': 300, 'y': 200, 'w': 400}}})
        result = apply_canvas(scene, slide, {})
        line = next(obj for obj in result['render_objects'] if obj['id'] == 'connector')
        assert (line['x1'], line['x2']) == (300, 700)
        assert (line['y1'], line['y2']) == (200+y1-100, 200+y2-100)
