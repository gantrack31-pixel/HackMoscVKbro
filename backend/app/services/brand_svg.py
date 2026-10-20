"""Bounded, offline SVG ingestion; the browser/exporters receive raster pixels."""
import math
import re
from pathlib import Path
from lxml import etree


def rasterize_svg(data):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)
    root = etree.fromstring(data, parser)
    if root.getroottree().docinfo.doctype or etree.QName(root).localname != 'svg':
        raise ValueError('SVG содержит DTD или неверный корневой элемент.')
    nodes = list(root.iter())
    if len(nodes) > 5000: raise ValueError('SVG содержит слишком много элементов.')
    forbidden = {'script', 'foreignObject', 'animate', 'animateTransform', 'set', 'iframe', 'audio', 'video'}
    for node in nodes:
        if not isinstance(node.tag, str): continue
        if etree.QName(node).localname in forbidden: raise ValueError('Активное содержимое SVG не поддерживается.')
        for key, value in node.attrib.items():
            local = etree.QName(key).localname.lower()
            if local.startswith('on') or local in {'base', 'src'}: raise ValueError('Активные атрибуты SVG запрещены.')
            if local == 'href' and not re.fullmatch(r'#[\w.-]+', value): raise ValueError('Внешние ресурсы SVG запрещены.')
        content = ' '.join([*node.attrib.values(), node.text or ''])
        if re.search(r'@import|@font-face|\\|<!ENTITY', content, re.I): raise ValueError('Внешние стили SVG запрещены.')
        for reference in re.findall(r'url\s*\((.*?)\)', content, re.I):
            if not re.fullmatch(r'[\s\"\']*#[\w.-]+[\s\"\']*', reference): raise ValueError('Внешние ссылки SVG запрещены.')
    viewbox = re.split(r'[\s,]+', root.get('viewBox', '').strip())
    dimensions = [float(value) for value in viewbox] if len(viewbox) == 4 else None
    def length(value):
        match = re.fullmatch(r'(\d+(?:\.\d+)?)(?:px)?', value or '')
        return float(match[1]) if match else None
    width = length(root.get('width')) or (dimensions[2] if dimensions else None)
    height = length(root.get('height')) or (dimensions[3] if dimensions else None)
    if not width or not height or not all(math.isfinite(v) and 0 < v <= 4096 for v in (width, height)):
        raise ValueError('SVG: задайте размеры или viewBox до 4096 px.')
    from resvg_py import svg_to_bytes
    scale = min(1, 1024 / max(width, height))
    fonts=Path(__file__).parent
    png=svg_to_bytes(svg_string=etree.tostring(root, encoding='unicode'),
                     width=max(1, round(width*scale)), height=max(1, round(height*scale)), skip_system_fonts=True,
                     font_family='Manrope',font_files=[str(fonts/'Manrope-Regular.ttf'),str(fonts/'Manrope-Bold.ttf')])
    warnings=[]
    if any(isinstance(node.tag,str) and etree.QName(node).localname=='text' for node in nodes):
        warnings.append('SVG содержит текст: при преобразовании используется Manrope. Для точного фирменного логотипа переведите текст SVG в кривые.')
    return png,width,height,warnings
