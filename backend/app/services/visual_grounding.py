"""Conservative AI-only constraints; legacy/manual slides remain readable.

No computed or inferred numbers: a new chart must map explicit category/value
pairs in the material. This is a deterministic guard, not semantic fact-checking.
"""
import re
import csv
from ..icon_catalog import ICONS
from decimal import Decimal, InvalidOperation

UNIT_PATTERN = r'[%₽$€]|\b(?:шт\.?|руб(?:лей|ля|ль|лях)?\.?|кг|км|млн|млрд|тыс\.?|человек|участник\w*)(?!\w)'


def positional_labels(labels):
    return all(re.fullmatch(r'(?:значение|категория|позиция|элемент|пункт|число|данные|показатель|столбец|точка|value|category|item|point|column|№|#)?\s*' + str(index),
                           label.strip(), re.I) for index, label in enumerate(labels, 1))


def numeric_series(source):
    """Literal ordered series only; never collect unrelated numbers from prose."""
    decimal = r'[-+−]?\d+(?:[.,]\d+)?'
    dot = r'[-+−]?\d+(?:\.\d+)?'
    patterns = [(rf'{decimal}(?:\s*[;|]\s*{decimal})+', r'\s*[;|]\s*'),
                (rf'{dot}(?:,\s*{dot}){{2,}}', r',\s*'),
                (rf'{dot}(?:,\s+{dot})+', r',\s+')]
    results, seen = [], set()
    for pattern, separator in patterns:
        for match in re.finditer(r'(?<![\w.,])' + pattern + r'(?![\w,]|\.\d)', source):
            suffix = source[match.end():].split('\n', 1)[0].lstrip(' \t')
            unit_match = re.match(UNIT_PATTERN, suffix, re.I)
            unit = unit_match.group() if unit_match else ''
            if not unit:
                prefix = source[max(0,match.start()-50):match.start()]
                prefix_units = list(re.finditer(UNIT_PATTERN, prefix, re.I))
                if prefix_units and re.fullmatch(r'[ \t:=()]*', prefix[prefix_units[-1].end():]):
                    unit = prefix_units[-1].group()
            values = tuple(Decimal(value.replace('−', '-').replace(',', '.'))
                           for value in re.split(separator, match.group()))
            key = (values, unit)
            if not 2 <= len(values) <= 6 or key in seen:
                continue
            seen.add(key)
            results.append({'labels': [str(i) for i in range(1, len(values)+1)],
                            'values': [float(value) for value in values], 'unit': unit})
    return results

def normalized(text):
    return re.sub(r'\s+', ' ', str(text).casefold().replace('ё','е')).strip()

def normalize_model_icons(raw,key):
    """AI-only fallback. Public schemas still strictly reject arbitrary icon IDs/URLs."""
    if not isinstance(raw,dict) or not isinstance(raw.get(key),list): return raw
    result={**raw,key:[]}
    for item in raw[key]:
        if isinstance(item,dict) and isinstance(item.get('icon_names'),list):
            item={**item,'icon_names':[name if isinstance(name,str) and (name in ICONS or name=='auto') else 'auto' for name in item['icon_names']]}
        result[key].append(item)
    return result

def numbers(text):
    found=set()
    for value in re.findall(r'(?<![\w.])[-+−]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?(?!\w)',text):
        try: found.add(Decimal(re.sub(r'[ \u00a0\u202f]','',value).replace('−','-').replace(',','.')))
        except InvalidOperation: pass
    return found

def contains(text,value):
    value=normalized(value)
    if not value: return False
    pattern=(r'(?<!\w)' if value[0].isalnum() else '')+re.escape(value)+(r'(?!\w)' if value[-1].isalnum() else '')
    return bool(re.search(pattern,normalized(text)))

YEAR_HEADING = re.compile(r'(?:19|20)\d{2}(?:\s*(?:г\.?|год))?', re.I)


def structured_records(source):
    """Carry explicit column headings/units into CSV, TSV and Markdown table rows.

    Each cell becomes one record with its row label and its column heading, in both
    directions, so a chart may follow either the rows ("2023,120") or the columns
    ("Показатель,2023,2024" / "Выручка,120,150") of the same table.
    """
    records=[]
    for delimiter in ('|','\t',';',','):
        header=None
        for line in source.splitlines():
            if delimiter not in line: header=None;continue
            row=[c.strip() for c in next(csv.reader([line.strip().strip('|')],delimiter=delimiter))]
            if len(row)<2 or all(re.fullmatch(r'[-: ]*',cell) for cell in row): continue
            # Headings are words or years; any other number makes the row data.
            if all(not numbers(cell) or YEAR_HEADING.fullmatch(cell) for cell in row) and any(re.search(r'\w',cell) for cell in row):
                if header is None or all(not numbers(cell) for cell in row):
                    header=row;continue
            if not header: continue
            if len(row)==len(header): headings=header
            # "Год,Выручка, млн руб." — an unquoted comma inside the only value heading.
            elif len(row)==2 and len(header)>2: headings=[header[0],' '.join(header[1:])]
            else: continue
            for i,cell in enumerate(row[1:],1):
                records.append(f'{row[0]}: {cell} {headings[i]}')
                records.append(f'{row[0]} — {headings[i]}: {cell}')
    return records

def approved_material(deck):
    lines=[]
    for slide in deck.slides:
        lines.extend([slide.title,slide.body,*slide.bullets,slide.notes])
        lines.extend(' | '.join(row) for row in slide.table)
        if slide.chart:
            ordinal = positional_labels(slide.chart.labels)
            lines.extend(f'{"Позиция" if ordinal else label}: {value:g} {slide.chart.unit}' for label,value in zip(slide.chart.labels,slide.chart.values))
        for element in slide.elements:
            if element.type == 'text': lines.append(element.text)
            lines.extend(' | '.join(row) for row in element.table)
            if element.chart:
                ordinal = positional_labels(element.chart.labels)
                lines.extend(f'{"Позиция" if ordinal else label}: {value:g} {element.chart.unit}'
                             for label,value in zip(element.chart.labels,element.chart.values))
    return '\n'.join(lines)

def unit_key(text):
    """Compare units by meaning: '₽' is 'руб', abbreviation dots do not matter. Values are never normalized this way."""
    return re.sub(r'\s+', ' ', normalized(text).replace('₽', ' руб').replace('.', ' ').replace('_', ' ')).strip()

def validate_visual(slide,source,previous=None,*,allow_new_text=False):
    validate_diagram_design(slide,slide.design)
    for design in slide.designs.values(): validate_diagram_design(slide,design)
    if slide.kind=='chart' and (previous is None or slide.chart!=previous.chart or previous.kind!='chart'):
        chart=slide.chart
        if any(not s.strip() or len(s)>80 for s in chart.labels): raise ValueError('Подписи диаграммы: 1–80 символов.')
        literal_series = positional_labels(chart.labels) and any(
            [Decimal(str(value)) for value in chart.values] == [Decimal(str(value)) for value in series['values']]
            and normalized(chart.unit).rstrip('.') == normalized(series['unit']).rstrip('.')
            for series in numeric_series(source))
        # Each category and value must occur together in one source record.
        records=[normalized(s) for s in [*re.split(r'[\n;]|(?<=[.!?])\s+',source),*structured_records(source)] if s.strip()]
        def grounded_in(needle,value):
            matches=[r for r in records if contains(r,needle) and (not chart.unit.strip() or contains(unit_key(r),unit_key(chart.unit)))]
            # Restrict to the category's segment, not another category in the same line.
            def category_values(record):
                tail=record.split(needle,1)[1]
                for other in chart.labels:
                    if normalized(other)!=needle: tail=tail.split(normalized(other),1)[0]
                return numbers(tail)
            def grounded(record):
                if Decimal(str(value)) not in category_values(record): return False
                if chart.unit.strip(): return True
                if any(contains(other,needle) and Decimal(str(value)) in numbers(other)
                       and re.search(UNIT_PATTERN,other,re.I) for other in records): return False
                # Unitless labelled values are valid, but dropping a sourced unit is not;
                # a plain noun after the number ("1 200 клиентов") is not a unit.
                tail = record.split(needle, 1)[1].strip(' :=,—')
                number = re.match(r'[-+−]?\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d+)?', tail)
                return bool(number) and not re.search(UNIT_PATTERN, tail[number.end():], re.I)
            return any(grounded(r) for r in matches)
        for label,value in zip(chart.labels,chart.values):
            if literal_series: break
            needle=normalized(label)
            # "2023 г." on the chart is the same category as "2023" in the material.
            bare=re.sub(r'\s*(?:гг?\.?|год[аеу]?)$','',needle)
            if not any(grounded_in(n,value) for n in dict.fromkeys((needle,bare)) if n):
                raise ValueError('Категория, значение и единица диаграммы не подтверждены одной записью источника. Не выдумывай данные.')
    if slide.kind=='table' and (previous is None or slide.table!=previous.table or previous.kind!='table'):
        if len(slide.table)>7 or len(slide.table[0])>5:
            raise ValueError('AI-таблица: максимум 7 строк вместе с заголовком и 5 колонок; раздели материал.')
        material=normalized(source)
        for row in slide.table[1:]:
            for cell in row:
                if len(cell)>160: raise ValueError('Ячейка таблицы: до 160 символов.')
                if cell.strip() and not contains(material,cell) and not (allow_new_text and not numbers(cell)):
                    raise ValueError('Значение ячейки отсутствует в исходном материале; используй точные данные, без выдуманных строк.')
    if slide.kind in {'diagram','icons','steps'} and len(slide.bullets)>6:
        raise ValueError('Визуализация вмещает до 6 коротких элементов.')
    if slide.kind=='icons' and slide.icon_names and len(slide.icon_names)!=len(slide.bullets):
        raise ValueError('Каждому тезису нужен один разрешённый icon id.')
    from ..models import Slide
    previous_elements = {element.id: element for element in previous.elements} if previous else {}
    for element in slide.elements:
        old = previous_elements.get(element.id)
        if element.type in {'chart', 'table'}:
            visual = Slide(title='Объект', kind=element.type, chart=element.chart, table=element.table)
            prior = Slide(title='Объект', kind=old.type, chart=old.chart, table=old.table) if old and old.type in {'chart', 'table'} else None
            validate_visual(visual, source, prior, allow_new_text=allow_new_text)

def validate_diagram_design(slide,design):
    style=design.diagram_style if design and design.diagram_style else slide.diagram_type
    if slide.kind=='diagram' and style=='matrix' and len(slide.bullets)>4:
        raise ValueError('Матрица 2×2 вмещает до четырёх элементов; выбери другой тип схемы.')
