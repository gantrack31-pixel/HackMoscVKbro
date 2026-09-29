"""Conservative AI-only constraints; legacy/manual slides remain readable.

No computed or inferred numbers: a new chart must map explicit category/value
pairs in the material. This is a deterministic guard, not semantic fact-checking.
"""
import re
import csv
from decimal import Decimal, InvalidOperation

def normalized(text):
    return re.sub(r'\s+', ' ', str(text).casefold().replace('ё','е')).strip()

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

def structured_records(source):
    """Carry explicit column headings/units into CSV, TSV and Markdown table rows."""
    records=[]
    for delimiter in ('|','\t',';',','):
        header=None
        for line in source.splitlines():
            if delimiter not in line: header=None;continue
            row=[c.strip() for c in next(csv.reader([line.strip().strip('|')],delimiter=delimiter))]
            if len(row)<2: continue
            if all(not numbers(cell) for cell in row):
                if any(re.search(r'\w',cell) for cell in row): header=row
                continue
            if header and len(row)==len(header):
                records.extend(f'{row[0]}: {cell} {header[i]}' for i,cell in enumerate(row[1:],1))
    return records

def approved_material(deck):
    lines=[]
    for slide in deck.slides:
        lines.extend([slide.title,slide.body,*slide.bullets,slide.notes])
        lines.extend(' | '.join(row) for row in slide.table)
        if slide.chart:
            lines.extend(f'{label}: {value:g} {slide.chart.unit}' for label,value in zip(slide.chart.labels,slide.chart.values))
    return '\n'.join(lines)

def validate_visual(slide,source,previous=None):
    validate_diagram_design(slide,slide.design)
    for design in slide.designs.values(): validate_diagram_design(slide,design)
    if slide.kind=='chart' and (previous is None or slide.chart!=previous.chart or previous.kind!='chart'):
        chart=slide.chart
        if not chart.unit.strip(): raise ValueError('У диаграммы нужна единица из источника; при отсутствии данных выбери текст или схему.')
        if any(not s.strip() or len(s)>80 for s in chart.labels): raise ValueError('Подписи диаграммы: 1–80 символов.')
        # Each category and value must occur together in one source record.
        records=[normalized(s) for s in [*re.split(r'[\n;]|(?<=[.!?])\s+',source),*structured_records(source)] if s.strip()]
        for label,value in zip(chart.labels,chart.values):
            needle=normalized(label)
            matches=[r for r in records if contains(r,needle) and contains(r,chart.unit)]
            # Restrict to the category's segment, not another category in the same line.
            def category_values(record):
                tail=record.split(needle,1)[1]
                for other in chart.labels:
                    if normalized(other)!=needle: tail=tail.split(normalized(other),1)[0]
                return numbers(tail)
            if not any(Decimal(str(value)) in category_values(r) for r in matches):
                raise ValueError('Категория, значение и единица диаграммы не подтверждены одной записью источника. Не выдумывай данные.')
    if slide.kind=='table' and (previous is None or slide.table!=previous.table or previous.kind!='table'):
        if len(slide.table)>7 or len(slide.table[0])>5:
            raise ValueError('AI-таблица: максимум 7 строк вместе с заголовком и 5 колонок; раздели материал.')
        material=normalized(source)
        for row in slide.table[1:]:
            for cell in row:
                if len(cell)>160: raise ValueError('Ячейка таблицы: до 160 символов.')
                if cell.strip() and not contains(material,cell):
                    raise ValueError('Значение ячейки отсутствует в исходном материале; используй точные данные, без выдуманных строк.')
    if slide.kind in {'diagram','icons','steps'} and len(slide.bullets)>6:
        raise ValueError('Визуализация вмещает до 6 коротких элементов.')
    if slide.kind=='icons' and slide.icon_names and len(slide.icon_names)!=len(slide.bullets):
        raise ValueError('Каждому тезису нужен один разрешённый icon id.')

def validate_diagram_design(slide,design):
    style=design.diagram_style if design and design.diagram_style else slide.diagram_type
    if slide.kind=='diagram' and style=='matrix' and len(slide.bullets)>4:
        raise ValueError('Матрица 2×2 вмещает до четырёх элементов; выбери другой тип схемы.')
