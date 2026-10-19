"""Bounded tabular ingestion. No macros, formulas, network or filesystem references execute."""
import csv
import hashlib
import io
import json
import posixpath
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 10000
MAX_COLUMNS = 24
MAX_CELLS = 150000
MAX_TEXT = 3000000
MAX_CELL = 2000
MAX_TABLES = 8
ENGINE_VERSION = 'analysis-1'
MISSING = {'', 'null', 'none', 'na', 'n/a', 'nan', 'нет данных', '—', '-'}


class AnalysisError(ValueError):
    pass


def digest(value):
    data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    return hashlib.sha256(data).hexdigest()


def decode(data):
    for encoding in ('utf-8-sig', 'utf-16' if data[:2] in (b'\xff\xfe', b'\xfe\xff') else 'utf-8', 'cp1251'):
        try:
            text = data.decode(encoding)
            if '\x00' in text:
                continue
            return text, encoding
        except UnicodeError:
            continue
    raise AnalysisError('Не удалось прочитать кодировку. Сохраните таблицу в UTF-8.')


def _cell(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list, bool)):
        raise AnalysisError('Ячейки должны содержать текст, число или пустое значение, без вложенных объектов.')
    if isinstance(value, float) and not __import__('math').isfinite(value):
        raise AnalysisError('Числа NaN и бесконечность не поддерживаются.')
    value = str(value).strip()
    if len(value) > MAX_CELL:
        raise AnalysisError(f'В ячейке больше {MAX_CELL} символов. Вынесите длинный текст в контекст.')
    return value


def table(name, grid, locations=None):
    nonempty = [(i, row) for i, row in enumerate(grid) if any(_cell(c) for c in row)]
    if len(nonempty) < 2:
        raise AnalysisError(f'В таблице «{name}» нужны заголовок и хотя бы одна строка данных.')
    headers = [_cell(c) for c in nonempty[0][1]]
    if not 1 <= len(headers) <= MAX_COLUMNS:
        raise AnalysisError(f'Поддерживается от 1 до {MAX_COLUMNS} столбцов. Разделите широкую таблицу.')
    if any(not h for h in headers) or len(set(headers)) != len(headers):
        raise AnalysisError('У всех столбцов должны быть непустые уникальные названия.')
    rows, lineage = [], []
    for original_index, row in nonempty[1:]:
        if len(row) > len(headers) and any(_cell(c) for c in row[len(headers):]):
            raise AnalysisError(f'В строке {original_index + 1} больше значений, чем заголовков.')
        rows.append([_cell(c) for c in row[:len(headers)]] + [''] * max(0, len(headers) - len(row)))
        lineage.append(locations[original_index] if locations else original_index + 1)
    if len(rows) > MAX_ROWS:
        raise AnalysisError(f'Лимит — {MAX_ROWS} строк на таблицу. Разделите файл; строки не были обрезаны.')
    return {'name': name[:200], 'columns': headers, 'rows': rows, 'lineage': lineage,
            'transformations': ['Пустые строки исключены; порядок и номера исходных строк сохранены.']}


def _delimited(text, name, delimiter=None):
    if delimiter is None:
        try:
            delimiter = csv.Sniffer().sniff(text[:20000], delimiters=',;\t').delimiter
        except csv.Error:
            delimiter = '\t' if '\t' in text.splitlines()[0] else ';' if ';' in text.splitlines()[0] else ','
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    grid, locations = [], []
    try:
        for row in reader:
            grid.append(row)
            locations.append(reader.line_num)
            if len(grid) > MAX_ROWS + 1000:
                raise AnalysisError('Слишком много строк, включая пустые. Разделите файл.')
    except csv.Error as exc:
        raise AnalysisError('Некорректная CSV-таблица: проверьте кавычки и разделитель.') from exc
    result = table(name, grid, locations)
    result['delimiter'] = delimiter
    return result


def _json_tables(text, name):
    try:
        value = json.loads(text, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except (ValueError, RecursionError) as exc:
        raise AnalysisError('Некорректный JSON. Нужен массив объектов или объект columns/rows.') from exc
    blocks = value.get('tables', [value]) if isinstance(value, dict) else [value]
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= MAX_TABLES:
        raise AnalysisError(f'Поддерживается до {MAX_TABLES} таблиц в JSON.')
    results = []
    for i, block in enumerate(blocks):
        label = block.get('name', f'{name} · {i + 1}') if isinstance(block, dict) else name
        if isinstance(block, dict) and isinstance(block.get('columns'), list) and isinstance(block.get('rows'), list):
            grid = [block['columns'], *block['rows']]
        elif isinstance(block, list) and block and all(isinstance(r, dict) for r in block):
            headers = list(dict.fromkeys(k for row in block for k in row))
            grid = [headers, *[[row.get(h) for h in headers] for row in block]]
        else:
            raise AnalysisError('JSON: используйте массив объектов с одинаковыми полями или columns/rows.')
        if any(not isinstance(row, list) for row in grid):
            raise AnalysisError('JSON rows должен содержать массивы ячеек.')
        results.append(table(str(label), grid))
    return results


def _markdown_tables(text, name):
    lines = text.splitlines()
    results, removed = [], set()
    def split(line):
        return [part.replace('\\|', '|').strip() for part in re.split(r'(?<!\\)\|', line.strip().strip('|'))]
    index = 0
    while index + 1 < len(lines):
        if '|' in lines[index] and re.fullmatch(r'[\s|:\-]+', lines[index + 1]) and '-' in lines[index + 1]:
            grid, locations = [split(lines[index])], [index + 1]
            removed.update([index, index + 1])
            end = index + 2
            while end < len(lines) and '|' in lines[end] and lines[end].strip():
                grid.append(split(lines[end])); locations.append(end + 1); removed.add(end); end += 1
            results.append(table(f'{name} · таблица {len(results) + 1}', grid, locations))
            index = end
        else:
            index += 1
    if not results:
        return [_delimited(text, name)], ''
    return results, '\n'.join(line for i, line in enumerate(lines) if i not in removed).strip()


def _xlsx_tables(data):
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        infos = archive.infolist()
        if len(infos) > 1000 or sum(item.file_size for item in infos) > 32 * 1024 * 1024:
            raise AnalysisError('XLSX слишком велик после распаковки. Удалите лишние листы или используйте CSV.')
        if any('..' in PurePosixPath(i.filename).parts or i.filename.startswith('/') or i.flag_bits & 1 for i in infos):
            raise AnalysisError('Небезопасный или зашифрованный XLSX.')
        def xml(path):
            raw = archive.read(path)
            if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
                raise AnalysisError('XML с внешними сущностями не поддерживается.')
            return ET.fromstring(raw)
        shared = [''.join(item.itertext()) for item in xml('xl/sharedStrings.xml').findall('m:si', ns)] if 'xl/sharedStrings.xml' in archive.namelist() else []
        workbook = xml('xl/workbook.xml')
        props = workbook.find('m:workbookPr', ns)
        epoch = datetime(1904, 1, 1) if props is not None and props.get('date1904') in {'1', 'true'} else datetime(1899, 12, 30)
        rels = {r.get('Id'): r for r in xml('xl/_rels/workbook.xml.rels')}
        date_styles, percent_styles, zero_styles, currency_styles = set(), set(), {}, {}
        if 'xl/styles.xml' in archive.namelist():
            styles = xml('xl/styles.xml')
            formats = {int(f.get('numFmtId')): f.get('formatCode', '') for f in styles.findall('m:numFmts/m:numFmt', ns)}
            for i, xf in enumerate(styles.findall('m:cellXfs/m:xf', ns)):
                fid = int(xf.get('numFmtId', 0))
                original_format=formats.get(fid, '')
                fmt = re.sub(r'"[^"]*"|\[[^\]]*\]', '', original_format).lower()
                if fid in {*range(14, 23), *range(45, 48)} or ('y' in fmt and ('d' in fmt or 'm' in fmt)):
                    date_styles.add(i)
                if fid in {9,10} or '%' in fmt: percent_styles.add(i)
                if re.fullmatch(r'0{2,20}',fmt): zero_styles[i]=len(fmt)
                for symbol,unit in [('₽','₽'),('$','USD'),('€','EUR')]:
                    if symbol in original_format: currency_styles[i]=unit;break
        sheets = workbook.findall('m:sheets/m:sheet', ns)
        if len(sheets) > MAX_TABLES:
            raise AnalysisError(f'В XLSX больше {MAX_TABLES} листов. Выберите нужные листы в отдельном файле.')
        results, warnings = [], []
        for sheet in sheets:
            rel = rels.get(sheet.get(f"{{{ns['r']}}}id"))
            if rel is None or rel.get('TargetMode') == 'External':
                raise AnalysisError('Внешние связи XLSX не поддерживаются.')
            target = rel.get('Target', '')
            path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            if not path.startswith('xl/') or '..' in PurePosixPath(path).parts:
                raise AnalysisError('Некорректный путь листа XLSX.')
            grid, locations = [], []
            for row in xml(path).findall('m:sheetData/m:row', ns):
                values = {}
                for cell in row.findall('m:c', ns):
                    address = cell.get('r', '')
                    match = re.match(r'([A-Z]+)', address)
                    if not match:
                        raise AnalysisError('Не удалось определить координаты ячейки XLSX.')
                    col = 0
                    for char in match.group(1): col = col * 26 + ord(char) - 64
                    v, formula = cell.find('m:v', ns), cell.find('m:f', ns)
                    raw = v.text if v is not None and v.text else ''
                    kind = cell.get('t')
                    if formula is not None and not raw:
                        warnings.append(f'{sheet.get("name")}!{address}: формула без сохранённого результата; значение пропущено.')
                    if kind == 's' and raw:
                        raw = shared[int(raw)]
                    elif kind == 'inlineStr':
                        inline = cell.find('m:is', ns); raw = ''.join(inline.itertext()) if inline is not None else ''
                    elif kind == 'e':
                        warnings.append(f'{sheet.get("name")}!{address}: ошибка формулы {raw}; значение пропущено.'); raw = ''
                    elif raw and int(cell.get('s', 0)) in date_styles:
                        raw = (epoch + timedelta(days=float(raw))).isoformat().replace('T00:00:00', '')
                    elif raw and (kind is None or kind=='n'):
                        style=int(cell.get('s',0))
                        if style in percent_styles: raw=format(float(raw)*100,'.15g')+'%'
                        elif style in zero_styles and float(raw).is_integer() and float(raw)>=0:
                            raw=str(int(float(raw))).zfill(zero_styles[style])
                        elif style in currency_styles: raw+=' '+currency_styles[style]
                    if col > MAX_COLUMNS and raw:
                        raise AnalysisError(f'Лист шире {MAX_COLUMNS} столбцов.')
                    if col <= MAX_COLUMNS: values[col - 1] = raw
                if values and any(values.values()):
                    grid.append([values.get(c, '') for c in range(max(values) + 1)])
                    locations.append(int(row.get('r', len(grid))))
                if len(grid) > MAX_ROWS + 1:
                    raise AnalysisError(f'Лист содержит больше {MAX_ROWS} строк.')
            if grid:
                results.append(table(sheet.get('name', 'Лист'), grid, locations))
        return results, list(dict.fromkeys(warnings))[:100]
    except AnalysisError:
        raise
    except (zipfile.BadZipFile, KeyError, ET.ParseError, ValueError, IndexError, OverflowError) as exc:
        raise AnalysisError('Не удалось прочитать XLSX. Проверьте файл или сохраните таблицу в CSV.') from exc


def ingest(data: bytes, name: str, context='', intent=''):
    if not data or len(data) > MAX_BYTES:
        raise AnalysisError('Размер файла должен быть от 1 байта до 8 МБ.')
    name = name.replace('\\', '/').split('/')[-1][:200]
    ext = PurePosixPath(name).suffix.lower()
    warnings, embedded, encoding = [], '', ''
    if ext == '.xlsx':
        tables, warnings = _xlsx_tables(data)
    else:
        text, encoding = decode(data)
        if ext == '.json': tables = _json_tables(text, name)
        elif ext in {'.md', '.txt'}: tables, embedded = _markdown_tables(text, name)
        elif ext in {'.csv', '.tsv'}: tables = [_delimited(text, name, '\t' if ext == '.tsv' else None)]
        else: raise AnalysisError('Поддерживаются CSV, TSV, XLSX, табличный JSON, TXT и Markdown. Макросы XLSM не выполняются.')
    if not 1 <= len(tables) <= MAX_TABLES:
        raise AnalysisError(f'Нужна хотя бы одна таблица; максимум {MAX_TABLES}.')
    cells = sum(len(t['columns']) * len(t['rows']) for t in tables)
    chars = sum(len(c) for t in tables for row in t['rows'] for c in row)
    if cells > MAX_CELLS or chars > MAX_TEXT:
        raise AnalysisError(f'Лимит — {MAX_CELLS} ячеек и {MAX_TEXT} символов. Разделите данные; ничего не обрезано.')
    for i, t in enumerate(tables): t['id'] = f't{i + 1}'
    full_context = '\n\n'.join(filter(None, [context.strip(), embedded]))
    if len(full_context) > 50000:
        raise AnalysisError('Контекст превышает 50 000 символов. Сократите пояснение.')
    return {'name': name, 'format': ext.lstrip('.'), 'encoding': encoding, 'source_fingerprint': digest(data),
            'tables': tables, 'context': full_context, 'intent': intent, 'warnings': warnings, 'engine_version': ENGINE_VERSION}
