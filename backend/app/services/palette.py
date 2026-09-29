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


def safe_ink(requested, background, metadata, inverse=None, minimum=4.5):
    palette=[*metadata.get('colors',{}).values(),*metadata.get('palette',[])]
    candidates=[requested,*palette,inverse,'#000000','#FFFFFF']
    for value in candidates:
        color=hex_color(value)
        if color and contrast(color,background)>=minimum: return color
    return max(('#000000','#FFFFFF'),key=lambda c:contrast(c,background))

def roles(metadata):
    colors = metadata.get('colors', {})
    background = hex_color(metadata.get('background')) or hex_color(colors.get('lt1')) or '#FFFFFF'
    accent = hex_color(metadata.get('accent')) or hex_color(colors.get('accent1')) or '#0077FF'
    palette = [c for value in colors.values() if (c := hex_color(value))]
    # Black/white are accessibility fallbacks only when the source has no readable ink.
    ink=safe_ink(metadata.get('text_color') or colors.get('dk1'),background,metadata,colors.get('lt1'))
    on_accent=safe_ink(colors.get('lt1'),accent,metadata,colors.get('dk1'))
    surface=blend(accent,background,.08)
    # The same native table body ink is used on both striped surfaces.
    if contrast(ink,surface)<4.5: surface=background
    return {'background':background, 'accent':accent, 'text':ink, 'on_accent':on_accent,
            'surface':surface, 'border':blend(ink,background,.2),
            'muted':safe_ink(blend(ink,background,.76),background,metadata,ink)}

def design_metadata(metadata,design):
    if not design: return metadata
    result=dict(metadata)
    colors=[c for value in metadata.get('colors',{}).values() if (c:=hex_color(value))]
    supported=metadata.get('source')!='pptx' or metadata.get('background_info',{}).get('kind') in {'solid','implicit'}
    if supported and design.background_role=='accent': result['background']=roles(metadata)['accent']
    elif supported and colors and design.background_role in {'light','dark'}:
        result['background']=(max if design.background_role=='light' else min)(colors,key=luminance)
    result['heading_font']=metadata.get(design.heading_role+'_font') or metadata.get('font','Manrope')
    if design.foreground_role=='inverse': result['text_color']=metadata.get('colors',{}).get('lt1')
    result['body_font']=metadata.get(design.body_role+'_font') or metadata.get('font','Manrope')
    return result

def surface_at(obj,previous,default):
    surfaces=[o for o in previous if o['type'] in {'rect','ellipse','hexagon'} and hex_color(o.get('fill'))
              and o['x']<=obj['x']+1 and o['y']<=obj['y']+1
              and o['x']+o['w']>=obj['x']+obj['w']-1 and o['y']+o['h']>=obj['y']+obj['h']-1]
    return surfaces[-1]['fill'] if surfaces else default

def protect_foregrounds(objects,metadata):
    """Last deterministic pass. Never changes text, geometry or template backgrounds."""
    from .icons import icon_data
    background=roles(metadata)['background']
    changes=[]
    for index,obj in enumerate(objects):
        surface=surface_at(obj,objects[:index],background)
        key='color' if obj['type']=='text' else 'stroke' if obj['type']=='line' else None
        if key and hex_color(obj.get(key)):
            fixed=safe_ink(obj[key],surface,metadata)
            if fixed!=obj[key]: changes.append(obj['id']);obj[key]=fixed
        if obj.get('icon_name'):
            color=safe_ink(metadata.get('accent'),surface,metadata)
            obj['src']=icon_data(obj['icon_name'],color);obj['icon_color']=color
    return changes


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
