"""Private brand records and deterministic template/brand conflict resolution."""
from __future__ import annotations
from copy import deepcopy
from hashlib import sha256
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4
from .. import database as db
from .brand_parser import BrandError, MAX_BYTES, merge_brands


def initialize():
    with db.connection() as conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS brand_styles (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
            source_name TEXT NOT NULL, original BLOB NOT NULL, payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS brand_styles_owner ON brand_styles(user_id,created_at);
        CREATE TRIGGER IF NOT EXISTS brand_styles_user_cleanup AFTER DELETE ON users
        BEGIN DELETE FROM brand_styles WHERE user_id=OLD.id; END;
        ''')


def parse_isolated(data,name):
    if not data or len(data)>MAX_BYTES:raise BrandError('Загрузите файл стиля размером до 8 МБ.')
    filename=Path(str(name).replace('\\','/')).name[:200]
    if not filename or '\x00' in filename:raise BrandError('Некорректное имя файла.')
    # The parser cannot inherit provider keys, DB credentials, or .env loading.
    environment={key:value for key,value in os.environ.items() if key.upper() in {'SYSTEMROOT','WINDIR','PATH','TEMP','TMP'}}
    environment.update(PYTHONUTF8='1',PYTHONIOENCODING='utf-8')
    worker=Path(__file__).with_name('brand_worker.py')
    with TemporaryDirectory(prefix='deckly-brand-') as temp:
        source=Path(temp)/'input.bin';output=Path(temp)/'result.json'
        source.write_bytes(data)
        try:
            process=subprocess.run([sys.executable,'-I',str(worker),str(source),filename,str(output)],
                                   cwd=temp,env=environment,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,
                                   stderr=subprocess.PIPE,timeout=12,check=False,
                                   creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        except subprocess.TimeoutExpired:raise BrandError('Разбор стиля занял больше 12 секунд. Уменьшите файл или экспортируйте только JSON-токены.') from None
        if process.returncode or not output.is_file() or output.stat().st_size>6*1024*1024:
            # The user sees a safe generic message; the operator needs the parser's own reason.
            logging.getLogger(__name__).warning('brand worker failed code=%s stderr=%s',process.returncode,
                                                process.stderr.decode('utf-8','replace')[-2000:].strip() or '<empty>')
            raise BrandError('Не удалось безопасно разобрать стиль. Загрузите компактный JSON или раздел PDF со стилем.')
        result=json.loads(output.read_text(encoding='utf-8'))
        if result.get('error'):raise BrandError(result['error'])
        return result['result']


def summary(payload):
    return {key:payload.get(key) for key in ('id','name','kind','fingerprint','parser_version','created_at')}


def save(user_id,payload,original,source_name):
    initialize()
    item={**payload,'id':uuid4().hex,'created_at':db.now()}
    with db.connection() as conn:
        quota=conn.execute('SELECT COUNT(*) AS count,COALESCE(SUM(LENGTH(original)),0) AS bytes FROM brand_styles WHERE user_id=?',(user_id,)).fetchone()
        if quota['count']>=40 or quota['bytes']+len(original)>100*1024*1024:
            raise BrandError('Сохранено слишком много стилей: максимум 40 файлов и 100 МБ. Удалите неиспользуемые стили.')
        conn.execute('INSERT INTO brand_styles VALUES (?,?,?,?,?,?,?)',
                     (item['id'],user_id,item['name'],source_name,original,json.dumps(item,ensure_ascii=False,allow_nan=False),item['created_at']))
    return item


def upload(user_id,data,name):
    return save(user_id,parse_isolated(data,name),data,Path(name.replace('\\','/')).name[:200])


def get(user_id,brand_id):
    initialize()
    with db.connection() as conn:
        row=conn.execute('SELECT payload FROM brand_styles WHERE id=? AND user_id=?',(brand_id,user_id)).fetchone()
    if row is None:raise KeyError(brand_id)
    return json.loads(row['payload'])


def list_owned(user_id):
    initialize()
    with db.connection() as conn:
        return [summary(json.loads(row['payload'])) for row in conn.execute('SELECT payload FROM brand_styles WHERE user_id=? ORDER BY created_at DESC',(user_id,))]


def original(user_id,brand_id):
    initialize()
    with db.connection() as conn:
        row=conn.execute('SELECT source_name,original FROM brand_styles WHERE id=? AND user_id=?',(brand_id,user_id)).fetchone()
    if row is None:raise KeyError(brand_id)
    return row['source_name'],bytes(row['original'])


def remove(user_id,brand_id):
    get(user_id,brand_id)
    with db.connection() as conn:
        used=any(json.loads(row['content']).get('brand_style_id')==brand_id
                 for row in conn.execute('SELECT content FROM projects WHERE user_id=?',(user_id,)))
        if used:raise BrandError('Этот стиль используется в презентации. Сначала выберите для неё другой стиль.')
        conn.execute('DELETE FROM brand_styles WHERE id=? AND user_id=?',(brand_id,user_id))


def combine(user_id,brand_ids,name):
    if not 2<=len(brand_ids)<=8 or len(set(brand_ids))!=len(brand_ids):
        raise BrandError('Объедините от 2 до 8 разных стилей в нужном порядке.')
    items=[get(user_id,brand_id) for brand_id in brand_ids]
    payload=merge_brands(items,name)
    original=json.dumps({'name':name,'inputs':[summary(item) for item in items],'tokens':payload['tokens']},ensure_ascii=False).encode()
    payload.update(fingerprint=sha256(original).hexdigest(),parser_version='brand-1')
    return save(user_id,payload,original,name+'.json')


def resolve_brand(template,brand,prefer_template=False):
    """Never mutate the original template record or use network resources."""
    result=deepcopy(template);metadata=result['metadata'];tokens=brand['tokens']
    conflicts=[]
    effective={}
    color_map={'accent':'accent','background':'background','text':'text_color'}
    for source,target in color_map.items():
        if source in tokens['colors']:effective[target]=tokens['colors'][source]
    inferred_accent=False
    if 'accent' not in effective and tokens['palette']:
        effective['accent']=next((c for c in tokens['palette'] if c not in {'#FFFFFF','#000000'}),tokens['palette'][0])
        inferred_accent=True
    for key in ('heading_pt','body_pt'):
        if key in tokens['typography']:effective[key]=tokens['typography'][key]
    if tokens['spacing'].get('slide_margin') is not None:
        effective['slide_margin']=max(24,min(120,tokens['spacing']['slide_margin']))
    if tokens['spacing'].get('grid_gap') is not None:effective['grid_gap']=tokens['spacing']['grid_gap']
    for key,value in effective.items():
        previous=metadata.get(key)
        if previous is not None and previous!=value:conflicts.append({'field':key,'template':previous,'brand':value,'effective':previous if prefer_template else value})
        if not prefer_template or previous is None:metadata[key]=value
    if tokens['palette'] and not prefer_template:
        metadata['palette']=tokens['palette']
        metadata['colors']={**metadata.get('colors',{}),**{f'accent{i+1}':v for i,v in enumerate(tokens['palette'][:6])}}
        if 'background' in effective:metadata['colors']['lt1']=metadata['background']
        if 'text_color' in effective:metadata['colors']['dk1']=metadata['text_color']
        if 'accent' in effective:metadata['colors']['accent1']=metadata['accent']
    if not prefer_template and 'background' in effective:
        metadata['background_info']={'kind':'solid','color':metadata['background']}
        metadata['brand_background_override']=True
        metadata['preserve_template_background']=False
    font_mapping=[]
    from .font_support import normalized, system_assets
    assets=list(brand.get('fonts',[]))
    for field in ('heading_font','body_font'):
        requested=tokens['typography'].get(field) or next((f['family'] for f in assets if f['style']=='normal'),None)
        if not requested:continue
        template_value=metadata.get(field) or metadata.get('font','Manrope')
        chosen=template_value if prefer_template else requested
        if normalized(chosen) != normalized('Manrope') and not any(normalized(f['family'])==normalized(chosen) and f['style']=='normal' for f in assets):
            assets.extend(system_assets(chosen))
        effective_font=next((f['family'] for f in assets if normalized(f['family'])==normalized(chosen) and f['style']=='normal'),'Manrope')
        font_mapping.append({'role':field,'requested':chosen,'effective':effective_font,'substituted':normalized(chosen)!=normalized(effective_font)})
        if requested!=template_value:conflicts.append({'field':field,'template':template_value,'brand':requested,'effective':effective_font})
        metadata[field]=effective_font
    if font_mapping:
        metadata['font']=metadata.get('body_font','Manrope')
        used={mapping['effective'] for mapping in font_mapping}
        metadata['font_assets']=[f for f in assets if f['family'] in used]
    chart=tokens.get('chart',{})
    if chart.get('series_palette') and not prefer_template:metadata['chart_palette']=chart['series_palette']
    elif tokens['palette'] and not prefer_template:metadata['chart_palette']=[c for c in tokens['palette'] if c not in {metadata.get('background'),metadata.get('text_color')}]
    if chart.get('grid') and not prefer_template:metadata['chart_grid']=chart['grid']
    if brand.get('logos'):
        logo=deepcopy(brand['logos'][-1]);rule=tokens.get('logo',{})
        placement=rule.get('placement','bottom-right')
        if placement!='bottom-right':
            conflicts.append({'field':'logo.placement','brand':placement,'effective':'bottom-right','reason':'Поддерживается нижний правый угол с сохранением свободного пространства.'})
        def bounded(value,default,low,high):
            return min(high,max(low,float(value))) if isinstance(value,(int,float)) else default
        logo.update(placement='bottom-right',clear_space=bounded(rule.get('clear_space',tokens['spacing'].get('logo_clear_space')),12,4,40),
                    max_width=bounded(rule.get('max_width'),112,40,160),max_height=bounded(rule.get('max_height'),30,16,40))
        metadata['brand_logo']=logo
    warnings=list(brand.get('warnings',[]))
    if inferred_accent:warnings.append('Роль акцента не задана; выбран первый цвет палитры, отличный от белого и чёрного. Проверьте этот выбор в предпросмотре стиля.')
    for mapping in font_mapping:
        if mapping['substituted']:warnings.append(f'Шрифт «{mapping["requested"]}» заменён на Manrope: добавьте статические TTF-начертания отдельно или в ZIP брендбука.')
    if template['metadata'].get('background_info',{}).get('kind')=='complex':
        warnings.append('Графика исходного мастера PPTX сохраняется. Проверьте её совместимость с выбранным брендбуком в PowerPoint.')
    metadata['brand_style']={'id':brand['id'],'name':brand['name'],'fingerprint':brand['fingerprint'],
                             'inputs':brand.get('inputs',[]),'precedence':'template' if prefer_template else 'brand',
                             'conflicts':[*brand.get('conflicts',[]),*conflicts],'font_mapping':font_mapping,
                             'warnings':list(dict.fromkeys(warnings)),'unresolved_rules':brand.get('unresolved_rules',[]),
                             'effective':{key:metadata.get(key) for key in ('accent','background','text_color','font','heading_font','body_font','heading_pt','body_pt','slide_margin','grid_gap','chart_palette','chart_grid')}}
    metadata['warnings']=list(dict.fromkeys([*metadata.get('warnings',[]),*warnings]))
    return result


def apply_brand(template,brand_id,user_id,prefer_template=False):
    if not brand_id:return template
    return resolve_brand(template,get(user_id,brand_id),prefer_template)


def add_brand_logo(scene,metadata):
    logo=metadata.get('brand_logo')
    if not logo:return scene
    ratio=logo['width']/logo['height']
    w=min(logo['max_width'],logo['max_height']*ratio);h=w/ratio
    margin=max(24,float(metadata.get('slide_margin',56)))
    x,y=scene['width']-margin-w,scene['height']-18-h
    for obj in scene['objects']:
        if obj['id']=='analysis-source':
            obj['w']=max(40,x-logo['clear_space']-64-obj['x'])
            from .layout import fit_text
            obj['lines'],obj['font_size']=fit_text(obj['text'],obj,obj['font_size'],14,line_spacing=1.18)
            obj['used_height']=len(obj['lines'])*obj['font_size']*1.18
        if obj['id']=='footer' and obj['x']>x-50:
            obj['x']=x-logo['clear_space']-40
    node={'id':'brand-logo','type':'image','x':x,'y':y,'w':w,'h':h,'src':logo['src'],'brand_asset':True}
    scene['objects'].append(node)
    # Reuse exact objects when there are already expanded chart/table primitives.
    rendered=scene.get('render_objects',[])
    by_id={o['id']:o for o in scene['objects']}
    scene['render_objects']=[by_id.get(o['id'],o) for o in rendered]+[node] if rendered else list(scene['objects'])
    return scene
