"""Deterministic analytical slides, with calculation records and row reconciliation."""
import math
import statistics
from collections import OrderedDict
from ..analytics_models import AnalysisSelection, AnalyticalVisual
from .analytics_ingest import AnalysisError, digest, MISSING
from .analytics_profile import date, number, fmt, profile_table


def _record(operation, fields, result, used, excluded=0, **kwargs):
    return {'id': digest([operation, fields, result, used, excluded, kwargs])[:16], 'operation': operation,
            'fields': fields, 'result': result, 'rows_used': used, 'rows_excluded': excluded, **kwargs}


def _agg(values, operation):
    good = [v for v in values if v is not None]
    if not good: return None
    if operation == 'sum': return math.fsum(good)
    if operation == 'mean': return statistics.mean(good)
    if operation == 'count': return float(len(good))
    if operation == 'last': return good[-1]
    if len(values) > 1: raise AnalysisError('Повторяются метки. Выберите явное агрегирование или таблицу; строки не были объединены автоматически.')
    return good[0]


def _validated(dataset, selection):
    selection = selection if isinstance(selection, AnalysisSelection) else AnalysisSelection.model_validate(selection)
    table = next((t for t in dataset['tables'] if t['id'] == selection.table_id), None)
    if table is None: raise AnalysisError('Таблица не найдена. Выберите лист снова.')
    profile = profile_table(table, selection.roles, selection.semantics)
    cols = {c['name']: c for c in profile['columns']}
    for name in [selection.dimension, selection.x_measure, *selection.measures]:
        if name is not None and name not in cols: raise AnalysisError(f'Столбец «{name}» не найден.')
    if selection.chart_type == 'table': return selection, table, profile, cols
    if not selection.measures: raise AnalysisError('Выберите числовое измерение.')
    for name in [*selection.measures, *([selection.x_measure] if selection.x_measure else [])]:
        col = cols[name]
        if col['type'] != 'numeric' or col['mixed_units'] or col.get('min') is None:
            raise AnalysisError(f'«{name}» не является измерением с общей единицей. Идентификаторы не суммируются; исправьте роль или разделите единицы.')
        if selection.aggregation == 'sum' and col['semantics'] != 'additive':
            raise AnalysisError(f'«{name}»: суммирование ставок, остатков и неизвестных величин отключено. Выберите среднее/снимок или подтвердите аддитивную семантику.')
    if selection.chart_type in {'pie', 'bar', 'line', 'grouped', 'stacked'} and not selection.dimension:
        raise AnalysisError('Выберите поле категорий или времени.')
    if selection.chart_type == 'line' and cols[selection.dimension]['type'] != 'date':
        raise AnalysisError('Линейный график требует временной оси. Для категорий выберите столбцы.')
    if selection.time_group != 'none' and (not selection.dimension or cols[selection.dimension]['type'] != 'date'):
        raise AnalysisError('Группировка времени требует распознанного столбца дат.')
    if selection.aggregation == 'last' and (not selection.dimension or cols[selection.dimension]['type'] != 'date'):
        raise AnalysisError('Последний снимок требует временной оси; произвольный порядок строк не означает последний период.')
    if selection.chart_type in {'grouped', 'stacked'}:
        if len(selection.measures) < 2 or len({cols[m]['unit'] for m in selection.measures}) != 1:
            raise AnalysisError('Нужны два или более ряда с общей единицей измерения.')
    elif len(selection.measures) != 1 and selection.chart_type != 'kpi':
        raise AnalysisError('Для этой диаграммы выберите одно измерение.')
    if selection.chart_type in {'pie', 'stacked'} and any(cols[m]['semantics'] != 'additive' or cols[m]['min'] < 0 for m in selection.measures):
        raise AnalysisError('Доли и накопление требуют неотрицательных аддитивных величин; ставки и балансы не складываются.')
    if selection.chart_type in {'pie', 'stacked'} and selection.aggregation not in {'none','sum'}:
        raise AnalysisError('Доли и накопление используют исходные значения или суммы. Средние, ставки и снимки не образуют общий итог.')
    if selection.chart_type == 'scatter' and (not selection.x_measure or selection.x_measure == selection.measures[0]):
        raise AnalysisError('Для рассеяния выберите два разных числовых измерения.')
    return selection, table, profile, cols


def validate_selection(dataset, selection):
    return _validated(dataset, selection)[0]


def plan(dataset, selection):
    selection, table, profile, cols = _validated(dataset, selection)
    index = {name:i for i,name in enumerate(table['columns'])}
    selection_fp = digest(selection.model_dump())
    base = {'chart_type': selection.chart_type, 'question': selection.intent or dataset.get('intent', ''),
            'source': dataset['name'] if dataset['name']==table['name'] else f'{dataset["name"]} · {table["name"]}', 'dataset_id': dataset.get('id', ''),
            'source_fingerprint': dataset['source_fingerprint'], 'dataset_fingerprint': profile['fingerprint'],
            'selection_fingerprint': selection_fp, 'warnings': [*dataset.get('warnings', []), *profile['warnings']],
            'metadata': {'engine_version': dataset['engine_version'], 'table_id': table['id'], 'input_rows': len(table['rows']),
                         'selection': selection.model_dump(), 'missing_policy': 'exclude; never replace with zero', 'context': dataset.get('context', '')[:1200],
                         'context_length':len(dataset.get('context','')), 'context_fingerprint':digest(dataset.get('context',''))}}
    visuals = []
    def append(**visual):
        item = {**base, **visual, 'metadata': {**base['metadata'], **visual.get('metadata', {})}}
        checked=AnalyticalVisual.model_validate(item).model_dump()
        checked['metadata']['verified_visual_fingerprint']=visual_fingerprint(checked)
        visuals.append(checked)

    def reference():
        # Horizontal and vertical paging keep every cell, including >6 column sources.
        for col_start in range(0, len(table['columns']), 6):
            columns = table['columns'][col_start:col_start + 6]
            for row_start in range(0, len(table['rows']), selection.rows_per_slide):
                rows = table['rows'][row_start:row_start + selection.rows_per_slide]
                start, end = row_start + 1, row_start + len(rows)
                append(chart_type='table', columns=columns, rows=[r[col_start:col_start + 6] for r in rows],
                       takeaway=f'Исходные данные: строки {start}–{end} из {len(table["rows"])}',
                       why='Справочная таблица сохраняет исходные значения, пропуски и порядок. Все страницы вместе содержат все ячейки.',
                       metadata={'reference': True, 'row_start': start, 'row_end': end, 'column_start': col_start + 1,
                                 'column_end': col_start + len(columns), 'row_lineage': table['lineage'][row_start:row_start + len(rows)]})

    if selection.chart_type == 'table':
        reference()
    elif selection.chart_type == 'histogram':
        name = selection.measures[0]; nums = [(number(r[index[name]])[0], table['lineage'][i]) for i,r in enumerate(table['rows'])]
        nums = [(v, row) for v,row in nums if v is not None]
        if not nums: raise AnalysisError('Для распределения нужны числа.')
        low, high = min(v for v,_ in nums), max(v for v,_ in nums)
        bins = min(20, max(1, math.ceil(math.log2(len(nums)) + 1))) if low != high else 1
        width = (high - low) / bins if bins > 1 else 0
        boundaries = [low + width*i for i in range(bins)] + [high]
        counts, lineage = [0]*bins, [[] for _ in range(bins)]
        for value,row in nums:
            slot = min(bins - 1, int((value - low)/width)) if width else 0
            counts[slot] += 1; lineage[slot].append(row)
        # Precision follows interval width, not magnitude: 1.0000001..1.0000002
        # must not collapse into repeated 1..1 labels either.
        precision=min(15,max(0,math.ceil(-math.log10(width))+2)) if width else 6
        boundary_labels=[f'{value:.{precision}f}'.rstrip('0').rstrip('.').replace('.',',') if precision else str(round(value)) for value in boundaries]
        boundary_labels=[label or '0' for label in boundary_labels]
        if len(set(boundary_labels))<len(set(boundaries)):
            boundary_labels=[format(value,'.17g').replace('.',',') for value in boundaries]
        labels = [f'[{boundary_labels[i]}; {boundary_labels[i+1]}{"]" if i == bins-1 else ")"}' for i in range(bins)]
        top = max(range(bins), key=lambda i: counts[i])
        append(labels=labels, series=[{'name':'Число наблюдений', 'values':counts, 'unit':'шт'}], x_label=f'{name} ({cols[name]["unit"]})' if cols[name]['unit'] else name,
               y_label='Число наблюдений', takeaway=f'{counts[top]} из {len(nums)} наблюдений — в интервале {labels[top]}',
               why=f'Числовое распределение: {bins} равных интервалов по правилу Стерджеса с пределом 20. Последний интервал включает правую границу.',
               calculations=[_record('count', [name], len(nums), len(nums), len(table['rows'])-len(nums), description='Сумма частот равна числу непустых числовых наблюдений.')],
               metadata={'bin_boundaries': boundaries, 'bin_policy':'Sturges, max20; equal-width; final boundary inclusive', 'row_lineage':lineage, 'reconciled_count':sum(counts)})
    elif selection.chart_type == 'scatter':
        xname, yname = selection.x_measure, selection.measures[0]
        pairs = [(number(r[index[xname]])[0],number(r[index[yname]])[0],table['lineage'][i]) for i,r in enumerate(table['rows'])]
        good = [(x,y,row) for x,y,row in pairs if x is not None and y is not None]
        if len(good)<2: raise AnalysisError('Для рассеяния нужны минимум две полные пары чисел.')
        xs, ys = [p[0] for p in good], [p[1] for p in good]
        correlation = statistics.correlation(xs,ys) if len(set(xs))>1 and len(set(ys))>1 else None
        takeaway = f'Связь «{xname}» и «{yname}»: r = {fmt(correlation)}' if correlation is not None else 'Постоянное значение: корреляция не определена'
        record = _record('pearson_correlation',[xname,yname],correlation,len(good),len(pairs)-len(good),description='Корреляция Пирсона по полным парам; не является доказательством причинности.')
        for start in range(0,len(good),120):
            page = good[start:start+120]
            append(labels=[str(row) for _,_,row in page], x_values=[x for x,_,_ in page], series=[{'name':yname,'values':[y for _,y,_ in page],'unit':cols[yname]['unit']}],
                   x_label=xname + (f' ({cols[xname]["unit"]})' if cols[xname]['unit'] else ''), y_label=yname + (f' ({cols[yname]["unit"]})' if cols[yname]['unit'] else ''),
                   takeaway=takeaway, why=f'{len(good)} полных пар; исключено {len(pairs)-len(good)} неполных. Связь не означает причинность.', calculations=[record],
                   metadata={'row_lineage':[row for _,_,row in page],'page_start':start+1,'page_end':start+len(page),'complete_pairs':len(good)})
    elif selection.chart_type == 'kpi':
        if selection.aggregation == 'none': raise AnalysisError('Выберите явный способ расчёта KPI: сумма, среднее, число или последний снимок.')
        ordered = list(enumerate(table['rows']))
        if selection.dimension and cols[selection.dimension]['type']=='date':
            ordered = [(i,r) for i,r in ordered if date(r[index[selection.dimension]])]
            ordered.sort(key=lambda ir: date(ir[1][index[selection.dimension]]))
        kpis, records = [], []
        for name in selection.measures:
            entries = [(i,number(r[index[name]])[0]) for i,r in ordered]
            good = [(i,v) for i,v in entries if v is not None]
            if not good: raise AnalysisError(f'Для «{name}» не осталось наблюдений с корректной датой и значением.')
            value = _agg([v for _,v in good],selection.aggregation)
            if selection.aggregation == 'last':
                last_date = date(table['rows'][good[-1][0]][index[selection.dimension]])
                if sum(date(table['rows'][i][index[selection.dimension]])==last_date for i,_ in good)>1:
                    raise AnalysisError('На последнюю дату приходится несколько остатков. Уточните снимок или группировку; произвольная строка не выбрана.')
            period = f'{table["rows"][ordered[0][0]][index[selection.dimension]]} — {table["rows"][ordered[-1][0]][index[selection.dimension]]}' if selection.dimension and ordered else 'Все наблюдения'
            if selection.aggregation=='last': period=table['rows'][good[-1][0]][index[selection.dimension]]
            unit = 'шт' if selection.aggregation=='count' else cols[name]['unit']
            kpis.append({'label':name,'value':value,'display':fmt(value),'unit':unit,'aggregation':selection.aggregation,'period':period})
            records.append(_record(selection.aggregation,[name],value,len(good),len(table['rows'])-len(good),unit=unit,description=f'Период: {period}; правило: {selection.aggregation}.'))
        labels = {'sum':'Сумма','mean':'Среднее','last':'Последний снимок','count':'Число наблюдений'}
        append(kpis=kpis, takeaway=f'{labels[selection.aggregation]}: {kpis[0]["label"]} — {kpis[0]["display"]} {kpis[0]["unit"]}'.strip(), why=f'Явное правило: {labels[selection.aggregation]}. Период, пропуски и единицы указаны для каждого показателя.', calculations=records,
               metadata={'row_lineage':[table['lineage'][i] for i,_ in ordered]})
    else:
        dim = selection.dimension; dim_col = cols[dim]; rows = list(enumerate(table['rows'])); omitted = []
        grouped = OrderedDict()
        if dim_col['type']=='date':
            good = [(i,r,date(r[index[dim]])) for i,r in rows if date(r[index[dim]])]
            omitted = [table['lineage'][i] for i,r in rows if not date(r[index[dim]])]
            good.sort(key=lambda ir:ir[2])
            ordered = [(i,r,d.strftime('%Y') if selection.time_group=='year' else d.strftime('%Y-%m') if selection.time_group=='month' else d.isoformat().replace('T00:00:00','')) for i,r,d in good]
        else:
            ordered = [(i,r,r[index[dim]]) for i,r in rows if r[index[dim]].lower() not in MISSING]
            omitted = [table['lineage'][i] for i,r in rows if r[index[dim]].lower() in MISSING]
        for i,row,key in ordered:
            grouped.setdefault(key,[]).append((i,row))
        if not grouped: raise AnalysisError('Нет наблюдений с непустой выбранной осью.')
        if selection.aggregation=='last':
            for entries in grouped.values():
                observed_dates=[date(row[index[dim]]) for _,row in entries]
                if len(observed_dates)!=len(set(observed_dates)):
                    raise AnalysisError('На одну дату приходится несколько снимков. Уточните данные; произвольный остаток не выбран.')
        labels=list(grouped); series=[]; lineage=[[table['lineage'][i] for i,_ in entries] for entries in grouped.values()]
        for name in selection.measures:
            series.append({'name':name,'unit':'шт' if selection.aggregation=='count' else cols[name]['unit'],
                           'values':[_agg([number(row[index[name]])[0] for _,row in entries],selection.aggregation) for entries in grouped.values()]})
        if selection.chart_type=='pie' and (any(v is None for v in series[0]['values']) or math.fsum(series[0]['values'])<=0):
            raise AnalysisError('Для долей нужны известные неотрицательные значения и положительный знаменатель.')
        top_metadata={}
        if selection.top_n and len(labels)>selection.top_n:
            if selection.chart_type=='line' or any(cols[m]['semantics']!='additive' for m in selection.measures) or selection.aggregation not in {'sum','none'}:
                raise AnalysisError('Top N/Прочие применяется только к аддитивным суммам категорий. Для времени или ставок используйте страницы.')
            ranking=sorted(range(len(labels)),key=lambda i:sum(s['values'][i] or 0 for s in series),reverse=True)
            keep, rest=ranking[:selection.top_n], ranking[selection.top_n:]
            top_metadata={'top_n':selection.top_n,'other_categories':[labels[i] for i in rest], 'original_category_count':len(labels)}
            labels=[labels[i] for i in keep]+['Прочие']
            lineage=[lineage[i] for i in keep]+[[r for i in rest for r in lineage[i]]]
            series=[{**s,'values':[s['values'][i] for i in keep]+[math.fsum(s['values'][i] for i in rest if s['values'][i] is not None)]} for s in series]
        if selection.chart_type=='pie' and len(labels)>8:
            raise AnalysisError('Для круговой диаграммы максимум 8 частей. Выберите Top N ≤ 7 с «Прочими», столбцы или таблицу.')
        calculations=[]; first=series[0]; valid=[(i,v) for i,v in enumerate(first['values']) if v is not None]; name=first['name']
        if not valid: raise AnalysisError('В выбранной группе нет числовых наблюдений.')
        used=sum(number(r[index[name]])[0] is not None for _,r,_ in ordered)
        total = math.fsum(v for _,v in valid) if cols[name]['semantics']=='additive' and selection.aggregation in {'none','sum'} else None
        if total is not None:
            calculations.append(_record('sum',[name],total,used,len(table['rows'])-used,unit=first['unit'],description='Итог по показанным категориям; Top N + Прочие сохраняют сумму.'))
        takeaway = f'«{name}»: {len(labels)} категорий, {used} наблюдений'
        if selection.chart_type=='line' and len(valid)>=2:
            bi,bv=valid[0]; ei,ev=valid[-1]; change=ev-bv
            if cols[name]['semantics']=='rate' and first['unit']=='%':
                takeaway=f'{name}: {fmt(bv)}% → {fmt(ev)}%; изменение {"+" if change>=0 else ""}{fmt(change)} п. п.'
                calculations.append(_record('percentage_points',[name],change,used,len(table['rows'])-used,unit='п. п.',baseline=bv,comparison=ev,description=f'{labels[bi]} → {labels[ei]}'))
            elif bv>0:
                pct=change/bv*100; takeaway=f'{name}: {"рост" if pct>=0 else "снижение"} на {fmt(abs(pct))}% за {labels[bi]} — {labels[ei]}'
                calculations.append(_record('relative_change',[name],pct,used,len(table['rows'])-used,unit='%',baseline=bv,comparison=ev,description=f'({fmt(ev)} − {fmt(bv)}) / {fmt(bv)} × 100; {labels[bi]} → {labels[ei]}'))
            else:
                takeaway=f'{name}: {fmt(bv)} → {fmt(ev)} {first["unit"]}; изменение {"+" if change>=0 else ""}{fmt(change)}'
                calculations.append(_record('absolute_change',[name],change,used,len(table['rows'])-used,unit=first['unit'],baseline=bv,comparison=ev,description='Нулевая или отрицательная база: относительный рост не вычисляется.'))
        elif selection.chart_type=='pie':
            top=max(valid,key=lambda iv:iv[1]); share=top[1]/total*100
            takeaway=f'{labels[top[0]]}: {fmt(share)}% от {fmt(total)} {first["unit"]}'.strip()
            calculations.append(_record('share',[name],share,used,len(table['rows'])-used,unit='%',baseline=total,comparison=top[1],description=f'Доля «{labels[top[0]]}»: значение / сумма всех частей × 100.'))
        elif selection.chart_type=='bar':
            top=max(valid,key=lambda iv:iv[1]); takeaway=f'{labels[top[0]]}: наибольшее значение «{name}» — {fmt(top[1])} {first["unit"]}'.strip()
            calculations.append(_record('max',[name],top[1],used,len(table['rows'])-used,unit=first['unit'],description=f'Максимум среди {len(valid)} непустых категорий.'))
        elif selection.chart_type=='grouped':
            top=max(valid,key=lambda iv:iv[1]); comparable=series[1]['values'][top[0]]
            takeaway=f'{labels[top[0]]}: {name} — {fmt(top[1])}'
            if comparable is not None: takeaway+=f', {series[1]["name"]} — {fmt(comparable)}'
            takeaway+=f' {first["unit"]}'
            calculations.append(_record('max',[name],top[1],used,len(table['rows'])-used,unit=first['unit'],description=f'Сравнение рядов в категории с максимумом «{name}»: {labels[top[0]]}.'))
            if comparable is not None:
                calculations.append(_record('absolute_change',[name,series[1]['name']],top[1]-comparable,used,len(table['rows'])-used,unit=first['unit'],baseline=comparable,comparison=top[1],description=f'Разница двух рядов в категории «{labels[top[0]]}»; причина различий не установлена.'))
        elif selection.chart_type=='stacked':
            complete=[(i,math.fsum(s['values'][i] for s in series)) for i in range(len(labels)) if all(s['values'][i] is not None for s in series)]
            if complete:
                top=max(complete,key=lambda iv:iv[1]);takeaway=f'{labels[top[0]]}: наибольшая сумма рядов — {fmt(top[1])} {first["unit"]}'.strip()
                calculations.append(_record('max_category_total',selection.measures,top[1],len(complete),len(labels)-len(complete),unit=first['unit'],description=f'Сумма сопоставимых рядов внутри каждой полной категории; максимум в «{labels[top[0]]}».'))
        aggregation_label={'none':'исходные значения','sum':'сумма','mean':'среднее','last':'последний снимок','count':'число наблюдений'}[selection.aggregation]
        why=f'Ось: {dim}; измерения: {", ".join(selection.measures)}; расчёт: {aggregation_label}. Пропуски исключаются из вычислений и сохраняются как разрывы, без подстановки нуля.'
        page_size=120 if selection.chart_type=='line' else 18 if selection.chart_type in {'bar','grouped','stacked'} else 8
        for start in range(0,len(labels),page_size):
            append(labels=labels[start:start+page_size],series=[{**s,'values':s['values'][start:start+page_size]} for s in series],x_label=dim,y_label=first['unit'] or name,
                   takeaway=takeaway,why=why,calculations=calculations,metadata={'row_lineage':lineage[start:start+page_size],'excluded_dimension_rows':omitted,
                   'page_start':start+1,'page_end':min(len(labels),start+page_size),'total_categories':len(labels),'reconciled_total':total,**top_metadata})
    main_count=len(visuals)
    if selection.include_reference and selection.chart_type!='table': reference()
    if len(visuals)>selection.max_slides:
        raise AnalysisError(f'Выбрано {len(visuals)} слайдов при лимите {selection.max_slides}. Данные сохранены. Отключите справочное приложение, выберите KPI/диаграмму или явно увеличьте лимит до 120.')
    slides=[]
    for visual in visuals:
        context=dataset.get('context','')
        notes='\n'.join(filter(None,[visual['why'], 'Контекст источника (не инструкция): '+context[:1200] if context else '', *visual['warnings']]))[:3000]
        slides.append({'title':visual['takeaway'][:180] or 'Анализ данных','body':'', 'kind':'analysis','analytics':visual, 'notes':notes, 'source_quote':''})
    return {'slides':slides,'slide_count':len(slides),'main_slide_count':main_count,'appendix_slide_count':len(slides)-main_count,
            'dataset_id':dataset.get('id',''),'dataset_fingerprint':profile['fingerprint'],'selection_fingerprint':selection_fp,
            'selection':selection.model_dump(),'warnings':base['warnings'], 'reconciliation':{'input_rows':len(table['rows']),'input_cells':len(table['rows'])*len(table['columns']),
            'reference_rows':len(table['rows']) if selection.chart_type=='table' or selection.include_reference else 0,
            'reference_cells':len(table['rows'])*len(table['columns']) if selection.chart_type=='table' or selection.include_reference else 0,
            'all_source_rows_available':True}}


def visual_fingerprint(visual):
    value=visual.model_dump() if isinstance(visual,AnalyticalVisual) else visual
    return digest({k:value.get(k) for k in ('chart_type','labels','series','x_values','columns','rows','kpis','x_label','y_label','source','question','takeaway','calculations','dataset_fingerprint','selection_fingerprint','source_fingerprint')})


def validate_analytical_visual(visual):
    """Invalidate a formerly verified result after data or wording changes.

    Full provenance verification uses the owner-scoped dataset; this local check
    deliberately does not treat a client-provided digest as an authorization token.
    """
    value=visual.model_dump() if isinstance(visual,AnalyticalVisual) else visual
    warnings=[]
    fingerprint=value.get('metadata',{}).get('verified_visual_fingerprint')
    if fingerprint and fingerprint!=visual_fingerprint(value):
        warnings.append('Данные или вывод изменены после расчёта. Повторите аналитическую проверку по исходному набору.')
    for record in value.get('calculations',[]):
        operation=record.get('operation'); result=record.get('result'); baseline=record.get('baseline'); comparison=record.get('comparison')
        expected=None
        if operation=='relative_change' and baseline is not None and comparison is not None:
            if baseline<=0: warnings.append('Относительный рост нельзя вычислять от нулевой или отрицательной базы.')
            else: expected=(comparison-baseline)/baseline*100
        elif operation in {'absolute_change','percentage_points'} and baseline is not None and comparison is not None:
            expected=comparison-baseline
        elif operation=='share' and baseline is not None and comparison is not None:
            if baseline<=0: warnings.append('Знаменатель доли должен быть положительным.')
            else: expected=comparison/baseline*100
        if expected is not None and (result is None or not math.isclose(expected,result,rel_tol=1e-9,abs_tol=1e-12)):
            warnings.append('Численный вывод не совпадает с записанными исходными значениями и правилом расчёта.')
    return list(dict.fromkeys(warnings))
