"""Format-independent profiling and explainable, conservative chart choices."""
import math
import re
import statistics
from datetime import datetime
from .analytics_ingest import AnalysisError, MISSING, digest

ID_RE = re.compile(r'(^|\W)(id|sku|код|артикул|индекс|номер|account|postal|zip|identifier|year|год)(\W|$)', re.I)
RATE_RE = re.compile(r'%|дол[яи]|процент|конверси|марж|ставк|rate|ratio|margin|percent|conversion|share', re.I)
BALANCE_RE = re.compile(r'остат|баланс|запас|численност|balance|stock|inventory|headcount|snapshot', re.I)
ADD_RE = re.compile(r'выруч|продаж|доход|расход|прибыл|затрат|сумма|количеств|заказ|объём|объем|revenue|sales|cost|expense|profit|amount|quantity|count|orders|units', re.I)
UNITS = {'₽': '₽', 'руб': '₽', 'руб.': '₽', 'rub': '₽', '$': 'USD', 'usd': 'USD', '€': 'EUR', 'eur': 'EUR', '%': '%', 'кг': 'кг', 'kg': 'кг', 'шт': 'шт', 'шт.': 'шт'}


def number(value):
    raw = str(value).strip().replace('\u2212', '-').replace('\u00a0', ' ').replace('\u202f', ' ')
    if raw.lower() in MISSING: return None, ''
    unit = ''
    for symbol in sorted(UNITS, key=len, reverse=True):
        if raw.lower().endswith(symbol):
            raw = raw[:-len(symbol)].strip(); unit = UNITS[symbol]; break
        if raw.lower().startswith(symbol):
            raw = raw[len(symbol):].strip(); unit = UNITS[symbol]; break
    if raw.startswith('(') and raw.endswith(')'): raw = '-' + raw[1:-1]
    raw = raw.replace(' ', '').replace("'", '')
    if ',' in raw and '.' in raw:
        raw = raw.replace(',', '') if raw.rfind('.') > raw.rfind(',') else raw.replace('.', '').replace(',', '.')
    elif ',' in raw:
        if raw.count(',') == 1: raw = raw.replace(',', '.')
        elif re.fullmatch(r'-?\d{1,3}(,\d{3})+', raw): raw = raw.replace(',', '')
    if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', raw): return None, unit
    try: result = float(raw)
    except ValueError: return None, unit
    return (result, unit) if math.isfinite(result) else (None, unit)


def date(value):
    raw = str(value).strip()
    if re.fullmatch(r'\d{4}', raw): return None  # a year is a dimension, not an Excel serial date
    try:
        result = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return result.replace(tzinfo=None)
    except ValueError: pass
    for fmt in ('%Y-%m', '%Y/%m/%d', '%d.%m.%Y', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y %H:%M', '%d.%m.%Y %H:%M:%S'):
        try: return datetime.strptime(raw, fmt)
        except ValueError: pass
    months = {'январь': 1, 'января': 1, 'февраль': 2, 'февраля': 2, 'март': 3, 'марта': 3, 'апрель': 4, 'апреля': 4, 'май': 5, 'мая': 5, 'июнь': 6, 'июня': 6, 'июль': 7, 'июля': 7, 'август': 8, 'августа': 8, 'сентябрь': 9, 'сентября': 9, 'октябрь': 10, 'октября': 10, 'ноябрь': 11, 'ноября': 11, 'декабрь': 12, 'декабря': 12}
    parts = raw.lower().split()
    try:
        if len(parts) == 2 and parts[0] in months: return datetime(int(parts[1]), months[parts[0]], 1)
        if len(parts) == 3 and parts[1] in months: return datetime(int(parts[2]), months[parts[1]], int(parts[0]))
    except ValueError: pass
    return None


def header_unit(name):
    match = re.search(r'\(([^()]{1,25})\)|\[([^\[\]]{1,25})\]', name)
    if match:
        declared=next(v for v in match.groups() if v).strip()
        # Keep scale qualifiers: 12 million rubles is not labelled as 12 rubles.
        return UNITS.get(declared.lower(),declared)
    for symbol in sorted(UNITS, key=len, reverse=True):
        if re.search(r'(?<![\w])' + re.escape(symbol) + r'(?![\w])', name.lower()): return UNITS[symbol]
    return ''


def fmt(value):
    if value == 0: return '0'
    if abs(value) < 0.001 or abs(value) >= 1e9: return f'{value:.5g}'
    return f'{value:,.6f}'.rstrip('0').rstrip('.').replace(',', ' ').replace('.', ',')


def _quantile(values, q):
    if len(values) == 1: return values[0]
    ordered = sorted(values); pos = (len(ordered) - 1) * q; lo = math.floor(pos); hi = math.ceil(pos)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)


def profile_table(table, roles=None, semantics=None):
    roles, semantics = roles or {}, semantics or {}
    if (set(roles) | set(semantics)) - set(table['columns']):
        raise AnalysisError('Корректировка относится к неизвестному столбцу.')
    columns, normalized = [], []
    for ci, name in enumerate(table['columns']):
        values = [row[ci] for row in table['rows']]
        observed = [v for v in values if v.lower() not in MISSING]
        numeric = [number(v) for v in values]
        dates = [date(v) for v in values]
        n_numeric = sum(v is not None for v, _ in numeric); n_date = sum(v is not None for v in dates)
        ratio = n_numeric / len(observed) if observed else 0
        reason, confidence = [], 1.0
        leading_zero = any(re.fullmatch(r'0\d+', v) for v in observed)
        if ID_RE.search(name) or leading_zero:
            role = 'identifier'; reason.append('Название похоже на идентификатор или есть ведущие нули; значения не суммируются.')
        elif observed and n_date / len(observed) >= .8:
            role = 'date'; confidence = n_date / len(observed); reason.append('Большинство непустых значений распознано как календарные даты.')
        elif ratio >= .8:
            role = 'numeric'; confidence = ratio; reason.append('Большинство непустых значений — конечные числа.')
        elif len(set(observed)) <= max(30, len(observed) * .5) and max(map(len, observed), default=0) < 120:
            role = 'category'; reason.append('Повторяющиеся короткие метки подходят для группировки.')
        else:
            role = 'text'; reason.append('Свободный текст или неоднозначный формат; сохранён без преобразования.')
        if name in roles:
            role = roles[name]; reason.append('Роль явно выбрана пользователем.'); confidence = 1.0
        units = sorted(set(unit for val, unit in numeric if val is not None and unit))
        declared = header_unit(name)
        if declared and declared not in units: units.append(declared)
        mixed = len(units) > 1
        semantics_value = 'identifier' if role == 'identifier' else 'rate' if RATE_RE.search(name) or units == ['%'] else 'balance' if BALANCE_RE.search(name) else 'additive' if ADD_RE.search(name) else 'unknown'
        if name in semantics: semantics_value = semantics[name]
        unit = units[0] if len(units) == 1 else ''
        parsed = [v if role == 'numeric' else d.isoformat() if d and role == 'date' else raw for raw, (v, _), d in zip(values, numeric, dates)]
        normalized.append(parsed)
        invalid = [i for i, v in enumerate(values) if v.lower() not in MISSING and ((role == 'numeric' and numeric[i][0] is None) or (role == 'date' and dates[i] is None))]
        col = {'name': name, 'type': role, 'confidence': confidence, 'reasons': reason, 'semantics': semantics_value,
               'unit': unit, 'units': units, 'mixed_units': mixed, 'missing': len(values) - len(observed),
               'missing_ratio': (len(values) - len(observed)) / len(values), 'invalid': len(invalid),
               'invalid_rows': [table['lineage'][i] for i in invalid], 'cardinality': len(set(observed)), 'outlier_rows': []}
        nums = [v for v, _ in numeric if v is not None] if role == 'numeric' else []
        if nums:
            q1, q3 = _quantile(nums, .25), _quantile(nums, .75); spread = q3 - q1
            outliers = [i for i, (v, _) in enumerate(numeric) if v is not None and len(nums) >= 4 and (v < q1 - 1.5 * spread or v > q3 + 1.5 * spread)]
            col.update(min=min(nums), max=max(nums), mean=statistics.mean(nums), outlier_rows=[table['lineage'][i] for i in outliers], outlier_method='Tukey 1.5 × IQR; значения сохраняются')
        if role == 'date':
            valid_dates = [d for d in dates if d]; ordered = sorted(set(valid_dates)); gaps = []
            for a, b in zip(ordered, ordered[1:]):
                if (b.year - a.year) * 12 + b.month - a.month > 1: gaps.append([a.isoformat(), b.isoformat()])
            deltas = [(b-a).total_seconds()/86400 for a,b in zip(ordered,ordered[1:])]
            col['time'] = {'ordered': valid_dates == sorted(valid_dates), 'duplicates': len(valid_dates)-len(set(valid_dates)),
                           'granularity': 'month' if deltas and all(27 <= d <= 32 for d in deltas) else 'day' if deltas and statistics.median(deltas) <= 1 else 'irregular',
                           'gaps': gaps, 'start': min(ordered).isoformat() if ordered else None, 'end': max(ordered).isoformat() if ordered else None}
        columns.append(col)
    warnings = []
    for col in columns:
        if col['mixed_units']: warnings.append(f'«{col["name"]}»: смешаны единицы {", ".join(col["units"])}; численные диаграммы отключены до разделения единиц.')
        if col['missing'] or col['invalid']: warnings.append(f'«{col["name"]}»: пропущено {col["missing"]}, не распознано {col["invalid"]}; пропуски не заменяются нулями.')
        if col['outlier_rows']: warnings.append(f'«{col["name"]}»: возможных выбросов {len(col["outlier_rows"])}; они сохранены.')
        if col.get('time', {}).get('duplicates'): warnings.append(f'«{col["name"]}»: повторяются даты; выберите явное агрегирование или таблицу.')
    hierarchies = []
    dims = [c for c in columns if c['type'] == 'category']
    for parent in dims:
        for child in dims:
            if parent == child or not 1 < parent['cardinality'] < child['cardinality']: continue
            pi, ci = table['columns'].index(parent['name']), table['columns'].index(child['name'])
            links = {}
            for row in table['rows']:
                if row[ci] and row[pi]: links.setdefault(row[ci], set()).add(row[pi])
            if links and all(len(v) == 1 for v in links.values()):
                hierarchies.append({'parent': parent['name'], 'child': child['name'], 'reason': 'Каждая дочерняя метка относится ровно к одной родительской в наблюдаемых строках.'})
    canonical = {'columns': table['columns'], 'rows': list(map(list, zip(*normalized)))}
    return {'id': table['id'], 'name': table['name'], 'row_count': len(table['rows']), 'column_count': len(columns), 'columns': columns,
            'dimensions': sum(c['type'] in {'category', 'date', 'identifier'} for c in columns), 'metrics': sum(c['type'] == 'numeric' for c in columns),
            'duplicate_rows': len(table['rows']) - len({tuple(r) for r in table['rows']}), 'hierarchies': hierarchies,
            'warnings': warnings, 'fingerprint': digest(canonical), 'limits': {'chart_points_per_slide': 120, 'reference_rows_per_slide': 12, 'reference_columns_per_slide': 6}}


def intent_kind(text):
    text = text.lower()
    for key, pattern in [('trend', r'тренд|рост|динамик|изменен|growth|trend|over time'), ('share', r'дол[яи]|состав|структур|share|composition'), ('distribution', r'распределен|distribution|histogram'), ('relationship', r'связ|зависим|correl|relationship'), ('reference', r'справоч|таблиц|reference|lookup'), ('comparison', r'сравн|регио|compare|comparison')]:
        if re.search(pattern, text): return key
    return 'overview'


def recommendations(profile, intent=''):
    cols = profile['columns']; metrics = [c for c in cols if c['type'] == 'numeric' and not c['mixed_units'] and c.get('min') is not None]
    dates = [c for c in cols if c['type'] == 'date']; dims = [c for c in cols if c['type'] in {'category','identifier','text'} and c['cardinality'] <= 40]
    kind = intent_kind(intent); choices = []
    def add(chart, reason, dimension=None, measures=None, aggregation='none', score=0, **extra):
        choices.append({'chart_type': chart, 'score': score, 'reason': reason, 'fields': [x for x in [dimension, *(measures or [])] if x],
                        'missing_policy': 'exclude', 'units': {m['name']:m['unit'] for m in metrics if m['name'] in (measures or [])},
                        'selection': {'table_id': profile['id'], 'chart_type': chart, 'dimension': dimension, 'measures': measures or [], 'aggregation': aggregation, 'intent': intent, **extra}})
    add('table', 'Исходные строки и все поля остаются доступны без потерь и не требуют предположений об агрегировании.', score=95 if kind == 'reference' else 30)
    if not metrics: return {'recommended': choices, 'available': choices, 'explanation': 'Не найдены измерения: идентификаторы и текст не суммируются. Проверьте роли столбцов или используйте таблицу.'}
    metric = metrics[0]; measure = metric['name']
    aggregate = 'sum' if metric['semantics'] == 'additive' else 'last' if metric['semantics'] == 'balance' else 'mean'
    kpi_reason = f'«{measure}»: ' + ('сумма по наблюдениям' if aggregate == 'sum' else 'последний снимок по дате' if aggregate == 'last' else 'явное среднее непустых наблюдений, без суммирования ставок')
    if aggregate != 'last' or dates:
        add('kpi', kpi_reason + '; период и правило расчёта будут указаны.', dates[0]['name'] if dates else None, [measure], aggregate, 55)
    if dates:
        d = dates[0]
        agg = aggregate if d['time']['duplicates'] else 'none'
        add('line', f'«{d["name"]}» — временная ось, «{measure}» — непрерывное измерение; даты сортируются, пропуски сохраняются.', d['name'], [measure], agg, 100 if kind == 'trend' else 78)
    if dims or dates:
        dim = dims[0] if dims else dates[0]
        is_unique = dim['cardinality'] == profile['row_count']
        agg = 'none' if is_unique else aggregate
        if agg != 'last' or dim['type'] == 'date':
            add('bar', f'Сравнение «{measure}» по «{dim["name"]}»; ' + ('одно наблюдение на метку.' if is_unique else f'явное агрегирование: {agg}.'), dim['name'], [measure], agg, 100 if kind == 'comparison' else 70)
        if dim['type'] != 'date' and 2 <= dim['cardinality'] <= 8 and metric['semantics'] == 'additive' and metric['min'] >= 0 and metric['max'] > 0:
            add('pie', f'{dim["cardinality"]} неотрицательных частей «{measure}», общая сумма образует проверяемый знаменатель.', dim['name'], [measure], 'sum', 100 if kind == 'share' else 60)
        comparable = [m for m in metrics if m['unit'] == metric['unit'] and m['semantics'] == metric['semantics']][:6]
        if len(comparable) >= 2 and dim['cardinality'] <= 40 and (is_unique or aggregate != 'last'):
            names = [c['name'] for c in comparable]
            add('grouped', f'{len(names)} сопоставимых рядов с общей единицей; сравнение внутри каждой категории.', dim['name'], names, agg, 85 if kind == 'comparison' else 65)
            if all(c['semantics'] == 'additive' and c['min'] >= 0 for c in comparable):
                add('stacked', 'Неотрицательные аддитивные ряды с общей единицей показывают сумму и вклад каждой серии.', dim['name'], names, 'sum', 88 if kind == 'share' else 62)
    add('histogram', f'Числовые интервалы «{measure}» и число наблюдений в каждом; исходные выбросы сохраняются.', measures=[measure], score=100 if kind == 'distribution' else 50)
    if len(metrics) >= 2:
        add('scatter', f'Парные наблюдения «{metrics[0]["name"]}» и «{metrics[1]["name"]}»; исключаются только неполные пары, связь не означает причину.', measures=[metrics[1]['name']], x_measure=metrics[0]['name'], score=100 if kind == 'relationship' else 52)
    choices.sort(key=lambda c: c['score'], reverse=True)
    expected = {'trend': 'line', 'share': 'pie', 'distribution': 'histogram', 'relationship': 'scatter', 'comparison': 'bar', 'reference': 'table'}.get(kind)
    explanation = '' if not expected or any(c['chart_type'] == expected for c in choices) else 'Для выбранной цели не хватает совместимых полей. Показаны безопасные альтернативы; проверьте роли, единицы и вопрос.'
    return {'recommended': choices[:3], 'available': choices, 'explanation': explanation}


def profile_dataset(dataset):
    profiles = [profile_table(t) for t in dataset['tables']]
    for p in profiles: p.update(recommendations(p, dataset.get('intent', '')))
    return {'id': dataset.get('id', ''), 'name': dataset['name'], 'format': dataset['format'], 'context': dataset['context'], 'intent': dataset['intent'],
            'source_fingerprint': dataset['source_fingerprint'], 'fingerprint': digest([p['fingerprint'] for p in profiles]),
            'tables': profiles, 'warnings': dataset['warnings'], 'engine_version': dataset['engine_version']}
