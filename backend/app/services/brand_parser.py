"""Pure, bounded brand-file parsers. This module never imports app settings.

Called in a short-lived subprocess with a stripped environment. Text in uploaded
guidelines is evidence, not executable instructions or a model system prompt.
"""
from __future__ import annotations
import base64
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import PurePosixPath
import re
import stat
from zipfile import ZipFile, BadZipFile
from PIL import Image
from pypdf import PdfReader
from lxml import etree

MAX_BYTES = 8 * 1024 * 1024
MAX_UNPACKED = 24 * 1024 * 1024
MAX_MEMBERS = 80
VERSION = 'brand-1'


class BrandError(ValueError):
    pass


def color(value):
    if not isinstance(value,str): return None
    value=value.strip().upper()
    if re.fullmatch(r'#[0-9A-F]{3}',value):value='#'+''.join(c*2 for c in value[1:])
    return value if re.fullmatch(r'#[0-9A-F]{6}',value) else None


def blank(name,kind):
    return {'name':PurePosixPath(name.replace('\\','/')).stem[:200], 'kind':kind,
            'tokens':{'colors':{},'palette':[],'typography':{},'spacing':{},'chart':{}},
            'logos':[], 'rules':[], 'unresolved_rules':[], 'warnings':[], 'evidence':[], 'inputs':[]}


def _walk(value, path='', depth=0, budget=None):
    if depth>28:raise BrandError('В JSON слишком глубокая структура; экспортируйте только стили или токены.')
    budget=budget or [0]
    budget[0]+=1
    if budget[0]>50000:raise BrandError('В JSON слишком много элементов; экспортируйте выбранную библиотеку стилей.')
    yield path,value
    if isinstance(value,dict):
        for key,item in value.items():yield from _walk(item,f'{path}.{key}' if path else str(key),depth+1,budget)
    elif isinstance(value,list):
        for index,item in enumerate(value):yield from _walk(item,f'{path}.{index}',depth+1,budget)


def role(name):
    name=name.casefold()
    if any(v in name for v in ('background','surface','фон','canvas','lt1')):return 'background'
    if any(v in name for v in ('foreground','text','текст','ink','dk1')):return 'text'
    if any(v in name for v in ('primary','accent','brand','акцент','основн')):return 'accent'
    return None


def _font(value):
    if isinstance(value,dict):value=value.get('family') or value.get('fontFamily') or value.get('value') or value.get('$value')
    if not isinstance(value,str) or not value.strip() or len(value)>100:return None
    if any(ord(c)<32 for c in value):return None
    return value.strip()


def _add_color(result,path,value,method='exact'):
    value=color(value)
    if not value:return
    if value not in result['tokens']['palette']:result['tokens']['palette'].append(value)
    token_role=role(path)
    if token_role:result['tokens']['colors'][token_role]=value
    result['evidence'].append({'field':f'color:{path[:160]}','value':value,'method':method})


def parse_json(data,name):
    try:payload=json.loads(data.decode('utf-8-sig'),parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
    except (ValueError,RecursionError,UnicodeError):raise BrandError('JSON повреждён или содержит недопустимые числовые значения.') from None
    if not isinstance(payload,dict):raise BrandError('Ожидается объект JSON с цветами, шрифтами или документом Figma.')
    figma=isinstance(payload.get('document'),dict) or (payload.get('type') in {'DOCUMENT','CANVAS','FRAME'})
    result=blank(name,'figma-json' if figma else 'tokens-json')
    if isinstance(payload.get('name'),str):result['name']=payload['name'][:200]
    typography=result['tokens']['typography'];sizes=[];families=[]
    for path,value in _walk(payload):
        if isinstance(value,str) and color(value):_add_color(result,path,value)
        if isinstance(value,str) and re.fullmatch(r'\{[\w. -]+\}',value):
            result['warnings'].append('Ссылки между JSON-токенами требуют развёрнутого экспорта с конечными значениями; неразрешённые ссылки не применены.')
        if isinstance(value,dict) and ('$value' in value or 'value' in value):
            v=value.get('$value',value.get('value'));typ=value.get('$type',value.get('type','')).lower()
            if typ=='color':_add_color(result,path,v)
            if typ in {'fontfamily','font-family'} and (family:=_font(v)):
                typography['heading_font' if any(k in path.lower() for k in ('head','title','заголов')) else 'body_font']=family
            if typ in {'dimension','spacing','number'}:
                dimension=v.get('value') if isinstance(v,dict) else v
                if isinstance(dimension,str):dimension=re.sub(r'(px|pt)$','',dimension.strip())
                try:dimension=float(dimension)
                except (ValueError,TypeError):continue
                if not math.isfinite(dimension):continue
                if any(k in path.lower() for k in ('margin','отступ')) and 24<=dimension<=120:
                    result['tokens']['spacing']['slide_margin']=dimension
                if any(k in path.lower() for k in ('gap','grid')) and 4<=dimension<=64:
                    result['tokens']['spacing']['grid_gap']=dimension
        if not figma or not isinstance(value,dict):continue
        node_name=str(value.get('name',path))[:160]
        for fill in value.get('fills',[]) if isinstance(value.get('fills',[]),list) else []:
            if isinstance(fill,dict) and fill.get('type')=='SOLID' and fill.get('visible',True) and isinstance(fill.get('color'),dict):
                rgb=fill['color']
                if all(isinstance(rgb.get(c),(int,float)) and 0<=rgb[c]<=1 for c in ('r','g','b')):
                    _add_color(result,node_name,'#'+''.join(f'{round(rgb[c]*255):02X}' for c in ('r','g','b')),'exact-figma-fill')
        style=value.get('style',{})
        if isinstance(style,dict) and (family:=_font(style.get('fontFamily'))):
            size=style.get('fontSize',18)
            if isinstance(size,(int,float)) and math.isfinite(size) and 6<=size<=200:
                sizes.append((size,family));families.append(family)
        if value.get('layoutMode') in {'HORIZONTAL','VERTICAL'}:
            gap=value.get('itemSpacing')
            if isinstance(gap,(int,float)) and 4<=gap<=64:result['tokens']['spacing'].setdefault('grid_gap',gap)
    direct=payload.get('typography',{})
    if isinstance(direct,dict):
        for destination,keys in [('heading_font',('heading','heading_font','headingFont')),('body_font',('body','body_font','bodyFont'))]:
            for key in keys:
                if family:=_font(direct.get(key)):typography[destination]=family;break
        for key in ('heading_pt','body_pt'):
            if isinstance(direct.get(key),(int,float)) and 10<=direct[key]<=72:typography[key]=direct[key]
    if sizes:
        typography.setdefault('heading_font',max(sizes)[1]);typography.setdefault('body_font',Counter(families).most_common(1)[0][0])
        result['warnings'].append('Назначение шрифтов заголовка и текста определено по текстовым узлам Figma; проверьте роли.')
    for key,value in payload.get('spacing',{}).items() if isinstance(payload.get('spacing'),dict) else []:
        if key in {'slide_margin','grid_gap','logo_clear_space'} and isinstance(value,(int,float)) and math.isfinite(value) and 0<=value<=120:
            result['tokens']['spacing'][key]=value
    chart=payload.get('chart',{})
    if isinstance(chart,dict):
        if isinstance(chart.get('series_palette'),list):
            result['tokens']['chart']['series_palette']=[c for v in chart['series_palette'] if (c:=color(v))][:16]
        if chart.get('grid') in {'major','none'}:result['tokens']['chart']['grid']=chart['grid']
    raw_rules=payload.get('rules',[])
    if isinstance(raw_rules,str):raw_rules=[raw_rules]
    if isinstance(raw_rules,list):result['unresolved_rules']=[str(r)[:1000] for r in raw_rules[:30]]
    logo=payload.get('logo',{})
    if isinstance(logo,dict):
        for key in ('placement','clear_space','max_width','max_height'):
            if key in logo:result['tokens'].setdefault('logo',{})[key]=logo[key]
    result['tokens']['palette']=result['tokens']['palette'][:40]
    result['evidence']=result['evidence'][:200]
    if not any(result['tokens'][key] for key in ('palette','typography','spacing','chart')):
        raise BrandError('Не найдены применимые цвета, шрифты или интервалы. Используйте JSON дизайн-токенов или экспорт документа Figma с fills/style.')
    return result


def parse_pdf(data,name):
    if not data.startswith(b'%PDF-'):raise BrandError('Файл не является PDF.')
    try:pdf=PdfReader(BytesIO(data),strict=True)
    except Exception:raise BrandError('Не удалось прочитать PDF-руководство.') from None
    if pdf.is_encrypted:raise BrandError('Снимите пароль с PDF перед загрузкой.')
    if len(pdf.pages)>50:raise BrandError('Руководство ограничено 50 страницами; загрузите раздел со стилем.')
    texts=[]
    for page in pdf.pages:
        texts.append((page.extract_text() or '')[:20000])
        if sum(map(len,texts))>150000:raise BrandError('В PDF слишком много текста; оставьте раздел с цветами и типографикой.')
    text='\n'.join(texts)
    result=blank(name,'pdf-guide')
    for line in text.splitlines():
        for match in re.findall(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b',line):_add_color(result,line[:160],match,'exact-pdf-text')
        match=re.search(r'(?:heading\s*font|шрифт\s*заголовк\w*)\s*[:=]\s*([^;\n]{2,80})',line,re.I)
        if match:result['tokens']['typography']['heading_font']=match.group(1).strip()
        match=re.search(r'(?:body\s*font|основной\s*шрифт|шрифт\s*текста)\s*[:=]\s*([^;\n]{2,80})',line,re.I)
        if match:result['tokens']['typography']['body_font']=match.group(1).strip()
        match=re.search(r'(?:slide\s*margin|отступ\w*\s*слайда)\s*[:=]\s*(\d+(?:\.\d+)?)',line,re.I)
        if match and 24<=float(match.group(1))<=120:result['tokens']['spacing']['slide_margin']=float(match.group(1))
    recognized=r'#[0-9a-fA-F]{3,6}\b|heading\s*font|body\s*font|шрифт|slide\s*margin|отступ\w*\s*слайда'
    result['unresolved_rules']=[line.strip()[:1000] for line in text.splitlines() if line.strip() and not re.search(recognized,line,re.I)][:60]
    if not text.strip():
        result['warnings'].append('PDF содержит изображения или сканы. OCR не выполнялся; добавьте JSON-токены с точными цветами и шрифтами.')
    else:result['warnings'].append('Применены только явно записанные HEX-цвета, шрифты и отступы. Остальные правила PDF требуют подтверждения.')
    result['evidence']=result['evidence'][:200]
    return result


def parse_image(data,name):
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {'PNG','JPEG','WEBP'}:raise BrandError('Логотип: используйте PNG, JPEG или WebP.')
            if image.width*image.height>8_000_000 or max(image.size)>4096:raise BrandError('Логотип слишком большой: максимум 4096 px и 8 мегапикселей.')
            image.load();width,height=image.size
            image=image.convert('RGBA');image.thumbnail((1024,1024))
            sample=image.copy();sample.thumbnail((64,64))
            ink=Counter((r,g,b) for r,g,b,a in sample.get_flattened_data() if a>=180).most_common(8)
            output=BytesIO();image.save(output,format='PNG')
    except BrandError:raise
    except Exception:raise BrandError('Логотип повреждён или имеет неподдерживаемый формат.') from None
    return {'name':PurePosixPath(name).name[:200],'width':width,'height':height,
            'src':'data:image/png;base64,'+base64.b64encode(output.getvalue()).decode(),
            'visible_colors':['#'+''.join(f'{c:02X}' for c in rgb) for rgb,_ in ink],
            'sha256':sha256(data).hexdigest(),'method':'original-colors-aspect-preserved'}


def parse_sample_image(data,name):
    image=parse_image(data,name)
    result=blank(name,'sample-image')
    result['tokens']['palette']=image['visible_colors']
    result['evidence']=[{'field':'palette','value':image['visible_colors'],'method':'sampled-image-approximation'}]
    result['warnings'].append('Палитра образцового изображения определена приблизительно. Шрифты и правила компоновки по изображению не устанавливались; точные JSON/PDF-значения имеют приоритет.')
    result['inputs']=[{'name':PurePosixPath(name).name,'sha256':image['sha256'],'kind':'sample-image'}]
    return result


def _archive(data,max_members=MAX_MEMBERS):
    try:z=ZipFile(BytesIO(data))
    except BadZipFile:raise BrandError('Повреждён ZIP-архив.') from None
    infos=z.infolist()
    if len(infos)>max_members or sum(i.file_size for i in infos)>MAX_UNPACKED:
        raise BrandError('Пакет слишком большой: до 80 файлов и 24 МБ после распаковки.')
    names=set()
    for entry in infos:
        path=PurePosixPath(entry.filename)
        if (not entry.filename or '\\' in entry.filename or path.is_absolute() or '..' in path.parts or ':' in entry.filename
                or '\x00' in entry.filename or entry.filename in names or stat.S_ISLNK(entry.external_attr>>16)):
            raise BrandError('В архиве обнаружен небезопасный или повторяющийся путь.')
        names.add(entry.filename)
        if entry.flag_bits&1:raise BrandError('Зашифрованные файлы в ZIP не поддерживаются.')
        if entry.file_size>MAX_BYTES or (entry.file_size>1024 and entry.file_size/max(1,entry.compress_size)>100):
            raise BrandError('Превышен допустимый размер или коэффициент сжатия файла в ZIP.')
    return z


def parse_sample_pptx(data,name):
    result=blank(name,'sample-pptx')
    with _archive(data,1000) as z:
        if 'ppt/presentation.xml' not in z.namelist():raise BrandError('Образец не является PPTX.')
        for part in sorted(z.namelist()):
            if not re.fullmatch(r'ppt/theme/theme\d+\.xml',part):continue
            payload=z.read(part)
            if len(payload)>2*1024*1024:raise BrandError('XML темы PPTX слишком большой.')
            parser=etree.XMLParser(resolve_entities=False,load_dtd=False,no_network=True)
            root=etree.fromstring(payload,parser)
            if root.getroottree().docinfo.doctype:raise BrandError('DTD в PPTX запрещён.')
            ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
            for node in root.findall('.//a:clrScheme/*',ns):
                child=next(iter(node),None)
                if child is not None:_add_color(result,etree.QName(node).localname,'#'+(child.get('val') or child.get('lastClr') or ''),'exact-pptx-theme')
            for role_name,query in [('heading_font','.//a:majorFont/a:latin'),('body_font','.//a:minorFont/a:latin')]:
                node=root.find(query,ns)
                if node is not None and _font(node.get('typeface')):result['tokens']['typography'][role_name]=node.get('typeface')
            break
    result['warnings'].append('Из образца PPTX взята тема: цвета и шрифты. Композиция отдельных образцовых слайдов не копируется автоматически.')
    return result


def merge_brands(items,name):
    result=blank(name,'combined')
    conflicts=[]
    for item in items:
        for group in ('colors','typography','spacing','chart','logo'):
            incoming=item['tokens'].get(group,{})
            target=result['tokens'].setdefault(group,{})
            for field,value in incoming.items():
                if field in target and target[field]!=value:
                    conflicts.append({'field':f'{group}.{field}','before':target[field],'after':value,'winner':item['name']})
                target[field]=value
        if item['tokens']['palette']:
            result['tokens']['palette']=item['tokens']['palette'][:40]
        for key in ('logos','rules','unresolved_rules','warnings','evidence','inputs'):
            result[key].extend(item.get(key,[]))
    result['conflicts']=conflicts
    result['logos']=result['logos'][:12]
    result['evidence']=result['evidence'][:300]
    result['unresolved_rules']=result['unresolved_rules'][:100]
    result['warnings']=list(dict.fromkeys(result['warnings']))
    result['precedence']='later-input-wins'
    return result


def parse_brand(data,name):
    if not data or len(data)>MAX_BYTES:raise BrandError('Размер файла стиля: от 1 байта до 8 МБ.')
    suffix=PurePosixPath(name.replace('\\','/')).suffix.lower()
    if suffix=='.fig':raise BrandError('Бинарный .fig не поддерживается. Экспортируйте JSON документа через Figma REST API /v1/files/{key} или JSON дизайн-токенов и загрузите файл сюда.')
    if suffix=='.json':result=parse_json(data,name)
    elif suffix=='.pdf':result=parse_pdf(data,name)
    elif suffix=='.pptx':result=parse_sample_pptx(data,name)
    elif suffix in {'.png','.jpg','.jpeg','.webp'}:
        result=blank(name,'logo');result['logos']=[parse_image(data,name)]
    elif suffix=='.zip':
        items=[]
        with _archive(data) as z:
            members=[i.filename for i in z.infolist() if not i.is_dir() and not i.filename.startswith('__MACOSX/')]
            allowed={'.json','.pdf','.png','.jpg','.jpeg','.webp','.pptx','.txt','.md'}
            if any(PurePosixPath(n).suffix.lower() not in allowed for n in members):
                raise BrandError('ZIP принимает JSON, PDF, логотипы PNG/JPEG/WebP, образцы PPTX и текстовые правила. Вложенные архивы и исполняемые файлы запрещены.')
            # Explicit tokens override inferred PDF/sample rules. Within a class,
            # sorted filenames make precedence deterministic and visible.
            priority={'.pptx':0,'.pdf':1,'.png':0,'.jpg':0,'.jpeg':0,'.webp':0,'.txt':3,'.md':3,'.json':4}
            for member in sorted(members,key=lambda n:(priority[PurePosixPath(n).suffix.lower()],n.casefold())):
                payload=z.read(member)
                if PurePosixPath(member).suffix.lower() in {'.txt','.md'}:
                    item=blank(member,'text-rules')
                    item['unresolved_rules']=[payload.decode('utf-8-sig')[:20000]]
                elif PurePosixPath(member).suffix.lower() in {'.png','.jpg','.jpeg','.webp'} and re.search(r'sample|slide|пример|слайд',member,re.I):
                    item=parse_sample_image(payload,member)
                else:item=parse_brand(payload,member)
                items.append(item)
        if not items:raise BrandError('Пакет стиля пуст.')
        result=merge_brands(items,PurePosixPath(name).stem)
        result['kind']='brand-package'
        result['warnings'].append('Приоритет в пакете: образцы PPTX/изображений → PDF → текстовые правила → JSON. Внутри типа применяется порядок имён файлов; последнее значение побеждает. Изображения с sample/slide/пример/слайд в имени считаются образцами, остальные — логотипами.')
    else:raise BrandError('Загрузите PDF, JSON, ZIP с логотипами и образцами, либо логотип PNG/JPEG/WebP.')
    result['inputs'].append({'name':PurePosixPath(name.replace('\\','/')).name[:200],'sha256':sha256(data).hexdigest(),'kind':result['kind']})
    result['fingerprint']=sha256(data).hexdigest();result['parser_version']=VERSION
    return result
