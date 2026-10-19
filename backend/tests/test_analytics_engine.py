import io
import json
import zipfile
from copy import deepcopy
import pytest
from app.analytics_models import AnalysisSelection, AnalyticalVisual
from app.services.analytics_ingest import ingest, AnalysisError
from app.services.analytics_profile import profile_dataset
from app.services.analytics_plan import plan, validate_analytical_visual
from app.services import analytics_store as store


def dataset(text,name='data.csv',**kwargs):
    return ingest(text.encode('utf-8'),name,**kwargs)


def selection(chart='line',**kwargs):
    return AnalysisSelection(chart_type=chart,dimension='Дата',measures=['Revenue'],**kwargs)


def workbook(rows, extra_sheet=None):
    from xml.sax.saxutils import escape
    output=io.BytesIO()
    sheets=[rows]+([extra_sheet] if extra_sheet else [])
    with zipfile.ZipFile(output,'w') as z:
        z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="Sheet{i}" sheetId="{i}" r:id="rId{i}"/>' for i in range(1,len(sheets)+1))+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))+'</Relationships>')
        for si,grid in enumerate(sheets,1):
            z.writestr(f'xl/worksheets/sheet{si}.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(f'<row r="{ri}">'+''.join(f'<c r="{chr(65+ci)}{ri}" t="inlineStr"><is><t>{escape(str(cell))}</t></is></c>' for ci,cell in enumerate(row))+'</row>' for ri,row in enumerate(grid,1))+'</sheetData></worksheet>')
    return output.getvalue()


def test_equivalent_formats_produce_equivalent_profiles_choices_calculations():
    rows=[['Дата','Revenue'],['2025-01-01','100'],['2025-12-01','123']]
    examples=[dataset('Дата,Revenue\n2025-01-01,100\n2025-12-01,123'),dataset('Дата\tRevenue\n2025-01-01\t100\n2025-12-01\t123','data.tsv'),
              dataset(json.dumps([dict(zip(rows[0],r)) for r in rows[1:]]),'data.json'),dataset('| Дата | Revenue |\n|---|---|\n|2025-01-01|100|\n|2025-12-01|123|','data.md'),ingest(workbook(rows),'data.xlsx')]
    profiles=[profile_dataset(d)['tables'][0] for d in examples]
    assert len({p['fingerprint'] for p in profiles})==1
    assert all([c['chart_type'] for c in p['recommended']]==[c['chart_type'] for c in profiles[0]['recommended']] for p in profiles)
    plans=[plan(d,selection()) for d in examples]
    assert all(p['slides'][0]['analytics']['series'][0]['values']==[100,123] for p in plans)
    for p in plans:
        visual=p['slides'][0]['analytics']; calc=next(c for c in visual['calculations'] if c['operation']=='relative_change')
        assert calc['result']==23 and calc['baseline']==100 and calc['comparison']==123
        assert '23%' in visual['takeaway'] and '2025-01-01' in visual['takeaway'] and '2025-12-01' in visual['takeaway']


@pytest.mark.parametrize('first,last,operation,result',[(0,123,'absolute_change',123),(-100,-23,'absolute_change',77),(100,123,'relative_change',23)])
def test_growth_baseline_semantics(first,last,operation,result):
    visual=plan(dataset(f'Дата,Revenue\n2025-01-01,{first}\n2025-02-01,{last}'),selection())['slides'][0]['analytics']
    record=next(r for r in visual['calculations'] if r['operation']==operation)
    assert record['result']==result


def test_percentage_points_not_relative_growth():
    d=dataset('Дата;Conversion %\n01.01.2025;10%\n01.02.2025;12%')
    visual=plan(d,AnalysisSelection(chart_type='line',dimension='Дата',measures=['Conversion %']))['slides'][0]['analytics']
    assert visual['calculations'][0]['operation']=='percentage_points'
    assert visual['calculations'][0]['result']==2
    assert '+2 п. п.' in visual['takeaway']
    scaled=dataset('Дата;Revenue (млн ₽)\n2025-01-01;100\n2025-12-01;123')
    visual=plan(scaled,AnalysisSelection(chart_type='line',dimension='Дата',measures=['Revenue (млн ₽)']))['slides'][0]['analytics']
    assert visual['series'][0]['unit']=='млн ₽' and visual['series'][0]['values']==[100,123]


def test_ids_leading_zeros_balances_and_mixed_units():
    d=dataset('Дата;Product ID;Postal code;Balance;Revenue\n2025-01-01;12301;00123;100;100 USD\n2025-02-01;12302;00456;150;120 EUR\n2025-03-01;12303;00789;125;130 USD')
    cols={c['name']:c for c in profile_dataset(d)['tables'][0]['columns']}
    assert cols['Product ID']['type']=='identifier' and cols['Postal code']['type']=='identifier'
    assert d['tables'][0]['rows'][0][2]=='00123'
    assert cols['Balance']['semantics']=='balance' and cols['Revenue']['mixed_units']
    for name in ('Product ID','Balance','Revenue'):
        with pytest.raises(AnalysisError): plan(d,AnalysisSelection(chart_type='kpi',measures=[name],aggregation='sum'))
    visual=plan(d,AnalysisSelection(chart_type='kpi',dimension='Дата',measures=['Balance'],aggregation='last'))['slides'][0]['analytics']
    assert visual['kpis'][0]['value']==125
    assert visual['kpis'][0]['period']=='2025-03-01'


def test_unsorted_long_dates_duplicates_aggregation_and_missing():
    rows=['Дата,Revenue']+[f'{2022+i//12}-{i%12+1:02}-01,{100+i}' for i in reversed(range(48))]
    d=dataset('\n'.join(rows))
    visual=plan(d,selection(aggregation='sum',time_group='year'))['slides'][0]['analytics']
    assert visual['labels']==['2022','2023','2024','2025'] and len(visual['series'][0]['values'])==4
    assert sum(visual['series'][0]['values'])==sum(range(100,148))
    repeated=dataset('Дата,Revenue\n2025-01-01,100\n2025-01-01,23\n2025-02-01,\n2025-03-01,200')
    with pytest.raises(AnalysisError,match='Повторяются'): plan(repeated,selection())
    visual=plan(repeated,selection(aggregation='sum'))['slides'][0]['analytics']
    assert visual['series'][0]['values']==[123,None,200]


def test_all_nine_valid_visual_categories_and_reconciliation():
    d=dataset('Дата,Region,Revenue,Costs\n2025-01-01,North,100,20\n2025-02-01,South,123,30\n2025-03-01,West,77,10')
    configs=[AnalysisSelection(chart_type='table'),selection(),AnalysisSelection(chart_type='bar',dimension='Region',measures=['Revenue']),
             AnalysisSelection(chart_type='histogram',measures=['Revenue']),AnalysisSelection(chart_type='pie',dimension='Region',measures=['Revenue'],aggregation='sum'),
             AnalysisSelection(chart_type='scatter',x_measure='Costs',measures=['Revenue']),AnalysisSelection(chart_type='grouped',dimension='Region',measures=['Revenue','Costs']),
             AnalysisSelection(chart_type='stacked',dimension='Region',measures=['Revenue','Costs'],aggregation='sum'),AnalysisSelection(chart_type='kpi',measures=['Revenue'],aggregation='sum')]
    for c in configs:
        result=plan(d,c); v=result['slides'][0]['analytics']; AnalyticalVisual.model_validate(v)
        assert v['chart_type']==c.chart_type and not validate_analytical_visual(v)
    pie=plan(d,configs[4])['slides'][0]['analytics']
    assert next(c for c in pie['calculations'] if c['operation']=='sum')['result']==300
    assert next(c for c in pie['calculations'] if c['operation']=='share')['result']==41


def test_intent_changes_ranking_not_format_or_values_and_context_survives():
    raw='Explain regional growth, do not invent causes.\n\n| Дата | Region | Revenue |\n|---|---|---|\n|2025-01-01|North|100|\n|2025-02-01|South|123|'
    trend=dataset(raw,'report.md',intent='show growth')
    comparison=dataset(raw,'report.md',intent='compare regions')
    assert profile_dataset(trend)['tables'][0]['recommended'][0]['chart_type']=='line'
    assert profile_dataset(comparison)['tables'][0]['recommended'][0]['chart_type']=='bar'
    result=plan(trend,selection())
    assert 'do not invent causes' in result['slides'][0]['notes']
    assert result['slides'][0]['analytics']['metadata']['context'].startswith('Explain')


def test_1000_row_profile_precedes_limit_and_compact_choice_works():
    d=dataset('Product ID,Revenue\n'+'\n'.join(f'{10000+i},{i+1}' for i in range(1000)))
    p=profile_dataset(d)
    assert p['tables'][0]['row_count']==1000 and any(c['chart_type']=='kpi' for c in p['tables'][0]['available'])
    with pytest.raises(AnalysisError,match='84 слайдов'): plan(d,AnalysisSelection(chart_type='table'))
    compact=plan(d,AnalysisSelection(chart_type='kpi',measures=['Revenue'],aggregation='sum'))
    assert compact['slide_count']==1 and compact['slides'][0]['analytics']['kpis'][0]['value']==500500
    full=plan(d,AnalysisSelection(chart_type='table',max_slides=120))
    assert full['reconciliation']['reference_rows']==1000
    assert full['reconciliation']['reference_cells']==2000
    cells=[r for s in full['slides'] for r in s['analytics']['rows']]
    assert cells==d['tables'][0]['rows']


def test_tiny_histogram_outliers_complete_scatter_and_topn():
    d=dataset('Value\n0.0001\n0.0002\n0.0003\n0.0004\n0.0005\n0.001')
    visual=plan(d,AnalysisSelection(chart_type='histogram',measures=['Value']))['slides'][0]['analytics']
    assert len(set(visual['labels']))==len(visual['labels']) and not any(label=='0–0' for label in visual['labels'])
    assert sum(visual['series'][0]['values'])==6
    tight=plan(dataset('Value\n1.0000001\n1.0000002\n1.0000003\n1.0000004'),AnalysisSelection(chart_type='histogram',measures=['Value']))['slides'][0]['analytics']
    assert len(set(tight['labels']))==len(tight['labels'])
    assert all(float(label[1:-1].split(';')[0].replace(',','.')) < float(label[1:-1].split(';')[1].replace(',','.')) for label in tight['labels'])
    d=dataset('X,Y\n1,2\n2,4\n3,\n4,8')
    visual=plan(d,AnalysisSelection(chart_type='scatter',x_measure='X',measures=['Y']))['slides'][0]['analytics']
    assert visual['calculations'][0]['rows_used']==3 and visual['calculations'][0]['rows_excluded']==1
    assert visual['calculations'][0]['result']==1
    d=dataset('Region,Revenue\n'+'\n'.join(f'R{i},{i}' for i in range(1,21)))
    visual=plan(d,AnalysisSelection(chart_type='pie',dimension='Region',measures=['Revenue'],aggregation='sum',top_n=5))['slides'][0]['analytics']
    assert visual['labels'][-1]=='Прочие' and sum(visual['series'][0]['values'])==210
    assert len(visual['metadata']['other_categories'])==15
    with pytest.raises(AnalysisError,match='исходные значения или суммы'):
        plan(d,AnalysisSelection(chart_type='pie',dimension='Region',measures=['Revenue'],aggregation='mean'))


def test_locale_xlsx_sheets_formula_missing_and_unsafe_files():
    d=dataset('Регион;Revenue\nСевер;"1\u00a0234,50 ₽"\nЮг;-23,5 ₽')
    v=plan(d,AnalysisSelection(chart_type='bar',dimension='Регион',measures=['Revenue']))['slides'][0]['analytics']
    assert v['series'][0]['values']==[1234.5,-23.5] and v['series'][0]['unit']=='₽'
    raw=workbook([['Metric','Revenue'],['A','1']], [['Дата','Balance'],['2025-01-01','100']])
    assert len(ingest(raw,'file.xlsx')['tables'])==2
    with zipfile.ZipFile(io.BytesIO(raw)) as src:
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w') as dest:
            for item in src.infolist():
                content=src.read(item.filename)
                if item.filename=='xl/worksheets/sheet1.xml': content=content.replace(b'<c r="B2" t="inlineStr"><is><t>1</t></is></c>',b'<c r="B2"><f>1+1</f></c>')
                dest.writestr(item.filename,content)
    formula=ingest(out.getvalue(),'formula.xlsx')
    assert formula['tables'][0]['rows'][0][1]=='' and any('формула без' in w for w in formula['warnings'])
    with pytest.raises(AnalysisError): ingest(b'notzip','file.xlsx')
    with pytest.raises(AnalysisError): ingest(b'a,b\n1,2','file.xlsm')
    with pytest.raises(AnalysisError): dataset('[{"x":{"url":"https://example.org"}}]','file.json')


def test_changed_values_invalidate_verified_calculation():
    v=plan(dataset('Дата,Revenue\n2025-01-01,100\n2025-02-01,123'),selection())['slides'][0]['analytics']
    assert not validate_analytical_visual(v)
    v['series'][0]['values'][1]=124
    assert validate_analytical_visual(v)
    v['calculations'][-1]['result']=99
    assert len(validate_analytical_visual(v))==2


def test_xlsx_percentage_currency_and_zero_padded_identifier_match_csv():
    raw=workbook([['Product ID','Conversion','Revenue'],['123','0.1','100']])
    out=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as src,zipfile.ZipFile(out,'w') as dest:
        for info in src.infolist():
            content=src.read(info.filename)
            if info.filename=='xl/worksheets/sheet1.xml':
                content=content.replace(b'<c r="A2" t="inlineStr"><is><t>123</t></is></c>',b'<c r="A2" s="1"><v>123</v></c>')
                content=content.replace(b'<c r="B2" t="inlineStr"><is><t>0.1</t></is></c>',b'<c r="B2" s="2"><v>0.1</v></c>')
                content=content.replace(b'<c r="C2" t="inlineStr"><is><t>100</t></is></c>',b'<c r="C2" s="3"><v>100</v></c>')
            dest.writestr(info.filename,content)
        dest.writestr('xl/styles.xml','<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts><numFmt numFmtId="164" formatCode="00000"/><numFmt numFmtId="165" formatCode="$0.00"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="9"/><xf numFmtId="165"/></cellXfs></styleSheet>')
    excel=ingest(out.getvalue(),'formatted.xlsx')
    assert excel['tables'][0]['rows']==[['00123','10%','100 USD']]
    csv_data=dataset('Product ID,Conversion,Revenue\n00123,10%,100 USD')
    assert profile_dataset(excel)['fingerprint']==profile_dataset(csv_data)['fingerprint']


def test_owner_storage_and_full_source_survive_selection(tmp_path,monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings,'database',tmp_path/'analytics.sqlite')
    original='Region,Revenue\nNorth,100\nSouth,123'.encode()
    result=store.save('alice',ingest(original,'data.csv'),original)
    id=result['id']
    with pytest.raises(KeyError): store.get('bob',id)
    with pytest.raises(KeyError): store.original('bob',id)
    with pytest.raises(KeyError): store.select('bob',id,AnalysisSelection())
    with pytest.raises(KeyError): store.remove('bob',id)
    assert store.list_owned('bob')==[]
    store.select('alice',id,AnalysisSelection(chart_type='pie',dimension='Region',measures=['Revenue'],aggregation='sum'))
    assert store.generation_slides('alice',[id])['slide_count']==1
    assert store.original('alice',id)[1]==original
    assert store.get('alice',id)['selection']['chart_type']=='pie'
    slides=store.generation_slides('alice',[id])['slides']
    assert store.validate_requested_analytics('alice',slides)
    with pytest.raises(KeyError): store.validate_requested_analytics('bob',slides)
    edited=deepcopy(slides);edited[0]['analytics']['series'][0]['values'][0]=999
    with pytest.raises(AnalysisError,match='устарел'): store.validate_requested_analytics('alice',edited)
    edited=deepcopy(slides);edited[0]['title']='Unsupported 99% claim'
    with pytest.raises(AnalysisError,match='заголовок'): store.validate_requested_analytics('alice',edited)
    store.remove('alice',id)
    assert store.list_owned('alice')==[]


def test_parser_declared_bounds_unsafe_archives_and_entity_input():
    from app.services.analytics_ingest import MAX_BYTES,MAX_ROWS,MAX_COLUMNS,MAX_CELL
    with pytest.raises(AnalysisError,match='8 МБ'): ingest(b'x'*(MAX_BYTES+1),'large.csv')
    with pytest.raises(AnalysisError,match='столбцов'): dataset(','.join('C'+str(i) for i in range(MAX_COLUMNS+1))+'\n'+','.join('1' for _ in range(MAX_COLUMNS+1)))
    with pytest.raises(AnalysisError,match='символов'): dataset('Text\n'+'x'*(MAX_CELL+1))
    with pytest.raises(AnalysisError,match='строк'): dataset('Revenue\n'+'\n'.join('1' for _ in range(MAX_ROWS+1)))
    original=workbook([['Revenue'],['100']])
    for unsafe_name,content in [('../evil.xml',b'<x/>'),('xl/styles.xml',b'<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>')]:
        out=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(original)) as src,zipfile.ZipFile(out,'w') as dest:
            for info in src.infolist(): dest.writestr(info.filename,src.read(info.filename))
            dest.writestr(unsafe_name,content)
        with pytest.raises(AnalysisError): ingest(out.getvalue(),'unsafe.xlsx')
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('huge.xml',b'x'*(33*1024*1024))
    with pytest.raises(AnalysisError,match='после распаковки'): ingest(out.getvalue(),'expanded.xlsx')
