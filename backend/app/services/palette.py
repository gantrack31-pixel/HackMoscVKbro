"""Template-derived roles and tolerant, bounded RGB palette comparison."""
import math
import re


def hex_color(value):
    if not isinstance(value, str): return None
    value = value.strip().upper()
    if re.fullmatch(r'#[0-9A-F]{3}', value):
        value = '#' + ''.join(c*2 for c in value[1:])
    return value if re.fullmatch(r'#[0-9A-F]{6}', value) else None


def channels(color):
    return tuple(int(color[i:i+2], 16) for i in (1, 3, 5))


def blend(color, background, amount):
    return '#' + ''.join(f'{round(a*amount+b*(1-amount)):02X}' for a,b in zip(channels(color), channels(background)))


def luminance(color):
    values = [v/255 for v in channels(color)]
    values = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in values]
    return sum(v*w for v,w in zip(values, (.2126,.7152,.0722)))


def contrast(a, b):
    low, high = sorted((luminance(a), luminance(b)))
    return (high+.05)/(low+.05)


def roles(metadata):
    colors = metadata.get('colors', {})
    background = hex_color(metadata.get('background')) or hex_color(colors.get('lt1')) or '#FFFFFF'
    accent = hex_color(metadata.get('accent')) or hex_color(colors.get('accent1')) or '#0077FF'
    palette = [c for value in colors.values() if (c := hex_color(value))]
    # Black/white are accessibility fallbacks only when the source has no readable ink.
    ink = max(palette or ['#000000', '#FFFFFF'], key=lambda c:contrast(c, background))
    if contrast(ink, background) < 4.5:
        ink = max(('#000000','#FFFFFF'), key=lambda c:contrast(c,background))
    on_accent = max([*palette, '#000000', '#FFFFFF'], key=lambda c:contrast(c,accent))
    return {'background':background, 'accent':accent, 'text':ink, 'on_accent':on_accent,
            'surface':blend(accent,background,.08), 'border':blend(ink,background,.2),
            'muted':blend(ink,background,.76)}


def active_palette(metadata):
    values = [*metadata.get('colors', {}).values(), *metadata.get('palette', []), *roles(metadata).values()]
    return {c for value in values if (c := hex_color(value))}


def allowed_color(value, metadata, tolerance=24):
    value = hex_color(value)
    if value is None: return False
    candidates = active_palette(metadata)
    if value in candidates: return True
    background = roles(metadata)['background']
    # Include legitimate tints/shades and alpha compositing, not arbitrary nearest colors.
    for color in tuple(candidates):
        for amount in (.25,.5,.75,.9):
            candidates.update(blend(color,base,amount) for base in (background,'#FFFFFF','#000000'))
    return any(math.dist(channels(value),channels(candidate)) <= tolerance for candidate in candidates)


def scene_color(value, theme):
    """Resolve legacy renderer tokens into the current template, including nested charts."""
    return {'#FFFFFF':theme['background'], '#0F172A':theme['text'], '#475569':theme['text'],
            '#64748B':theme['muted'], '#F1F5F9':theme['surface'], '#CBD5E1':theme['border'],
            '#E2E8F0':theme['border'], '#94A3B8':theme['border']}.get(value, value)
