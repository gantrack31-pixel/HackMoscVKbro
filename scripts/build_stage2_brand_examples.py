"""Regenerate synthetic style inputs and all-nine-type adapter examples locally.

Run from the repository with backend/.venv/Scripts/python.exe on Windows.
No database, secrets, source templates, or external service is modified.
"""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
import csv
from hashlib import sha256
from io import BytesIO
import json
from statistics import correlation
from zipfile import ZipFile,ZIP_DEFLATED
from PIL import Image,ImageDraw,ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from app.models import Slide,DeckContent
from app.services.export import export_pptx,export_pdf,export_html
from app.services.brand_parser import parse_brand
from app.services.brand_style import resolve_brand
from app.services.analytics_plan import visual_fingerprint
from app.services.audit import audit_deck

OUT=ROOT/'examples'/'brands'
OUT.mkdir(parents=True,exist_ok=True)
FONT=ROOT/'backend'/'app'/'services'/'Manrope-Regular.ttf'
TOKENS={'name':'North — синтетический пример','colors':{'accent':'#006AD8','background':'#FFFFFF','text':'#142A45'},
        'typography':{'heading':'Manrope','body':'Manrope','heading_pt':34,'body_pt':18},
        'spacing':{'slide_margin':64,'grid_gap':24,'logo_clear_space':16},
        'chart':{'series_palette':['#006AD8','#09876D','#7C58AD'],'grid':'major'},
        'logo':{'placement':'bottom-right','clear_space':16,'max_width':100,'max_height':24},
        'rules':['В примерах используются только синтетические данные.','Не менять исходные цвета и пропорции логотипа.']}
(OUT/'north-tokens.json').write_text(json.dumps(TOKENS,ensure_ascii=False,indent=2),encoding='utf-8')
FIGMA={'name':'Synthetic Figma style example','document':{'type':'DOCUMENT','children':[{'type':'CANVAS','name':'Styles','children':[
    {'type':'FRAME','name':'Primary','fills':[{'type':'SOLID','color':{'r':0,'g':106/255,'b':216/255}}]},
    {'type':'FRAME','name':'Background','fills':[{'type':'SOLID','color':{'r':1,'g':1,'b':1}}]},
    {'type':'TEXT','name':'Heading','style':{'fontFamily':'Manrope','fontSize':34}},
    {'type':'TEXT','name':'Body','style':{'fontFamily':'Manrope','fontSize':18}}]}]}}
(OUT/'figma-document.json').write_text(json.dumps(FIGMA,indent=2),encoding='utf-8')
logo=Image.new('RGBA',(420,100),(0,0,0,0));draw=ImageDraw.Draw(logo)
draw.text((5,2),'NORTH',font=ImageFont.truetype(str(FONT),74),fill=(20,42,69,255))
logo.save(OUT/'north-logo.png')
pdfmetrics.registerFont(TTFont('BrandExample',str(FONT)))
guide=canvas.Canvas(str(OUT/'north-guide.pdf'),pagesize=(595,842));guide.setTitle('North: синтетический брендбук')
guide.setFont('BrandExample',26);guide.drawString(48,770,'North — пример брендбука')
guide.setFont('BrandExample',14)
for i,text in enumerate(['Primary: #006AD8','Background: #FFFFFF','Text: #142A45','Heading font: Manrope','Body font: Manrope','Slide margin: 64',
                         'Логотип: нижний правый угол, исходные пропорции.','Это искусственный учебный пример, не реальный брендбук.']):
    guide.drawString(48,714-i*35,text)
guide.save()
BASE={'id':'example','name':'Synthetic example','metadata':{'ratio':16/9,'font':'Manrope','accent':'#006AD8','background':'#FFFFFF','colors':{'dk1':'#142A45','lt1':'#FFFFFF','accent1':'#006AD8'},'layouts':[]}}
sample=DeckContent(title='Синтетический образец',slides=[Slide(title='Одна мысль — один слайд',body='Образец содержит редактируемый текст. Цвета и шрифты читаются из темы; это учебный файл.')])
(OUT/'sample-slide.pptx').write_bytes(export_pptx(sample,BASE,'a'))
with ZipFile(OUT/'north-brand-package.zip','w',ZIP_DEFLATED) as z:
    for name in ('north-tokens.json','north-guide.pdf','north-logo.png','sample-slide.pptx'):
        z.write(OUT/name,name)
    z.writestr('rules.txt','Synthetic example. JSON tokens have final precedence. Logo is not recolored.')

months=['Январь','Февраль','Март','Апрель'];revenue=[120,138,150,168]
examples=[]
def add(kind,title,**data):
    value={'chart_type':kind,'source':'Синтетический набор North, 2026','question':title,'takeaway':title,
           'why':'Представление выбрано по структуре и смыслу данного синтетического набора.',**data}
    encoded=json.dumps(value,ensure_ascii=False,sort_keys=True).encode()
    value['dataset_fingerprint']=sha256(encoded).hexdigest();value['source_fingerprint']=value['dataset_fingerprint']
    slide=Slide(title=title,kind='analysis',analytics=value)
    slide.analytics.metadata['verified_visual_fingerprint']=visual_fingerprint(slide.analytics.model_dump())
    examples.append(slide)

growth={'id':'revenue_growth','operation':'relative_change','fields':['Выручка'],'baseline':120,'comparison':168,'result':40,'unit':'%','rows_used':4,'description':'(168 − 120) / 120 × 100'}
add('table','Выручка выросла со 120 до 168 млн руб.',columns=['Месяц','Выручка, млн руб.'],rows=[[m,str(v)] for m,v in zip(months,revenue)],calculations=[growth])
add('line','Выручка выросла на 40% с января по апрель',labels=months,series=[{'name':'Выручка','values':revenue,'unit':'млн руб.'}],x_label='Месяц',y_label='Выручка',calculations=[growth])
add('bar','Продукт A: 120 продаж — больше других категорий',labels=['Продукт A','Продукт B','Продукт C'],series=[{'name':'Продажи','values':[120,90,60],'unit':'шт.'}],x_label='Продукт',y_label='Продажи')
add('histogram','Чаще всего встречаются значения от 10 до 20',labels=['[0; 10)','[10; 20)','[20; 30)','[30; 40]'],series=[{'name':'Частота','values':[6,14,9,3],'unit':'наблюдений'}],x_label='Интервал значения',y_label='Частота',metadata={'bin_boundaries':[0,10,20,30,40]})
add('pie','Прямые продажи дают половину объёма',labels=['Прямые','Партнёры','Маркетплейсы'],series=[{'name':'Доля','values':[50,30,20],'unit':'продаж'}],calculations=[{'id':'direct_share','operation':'share','baseline':100,'comparison':50,'result':50,'unit':'%','rows_used':3}])
xs=[1,2,3,4,5];ys=[3,3,5,6,8]
add('scatter','Больше вложений связано с большим числом заявок',labels=[str(i+1) for i in range(5)],x_values=xs,series=[{'name':'Заявки','values':ys,'unit':'тыс.'}],x_label='Вложения, млн руб.',y_label='Заявки',warnings=['Связь не доказывает причинность; наблюдений только пять.'],calculations=[{'id':'correlation','operation':'pearson_correlation','result':correlation(xs,ys),'rows_used':5,'description':'Корреляция полных пар X и Y'}])
add('grouped','В III квартале факт выше плана на 10 млн руб.',labels=['I квартал','II квартал','III квартал'],series=[{'name':'Факт','values':[90,110,130],'unit':'млн руб.'},{'name':'План','values':[100,100,120],'unit':'млн руб.'}],x_label='Квартал',y_label='Выручка',calculations=[{'id':'gap','operation':'absolute_change','baseline':120,'comparison':130,'result':10,'unit':'млн руб.','rows_used':2}])
add('stacked','Повторные заказы: 50 из 80 в марте',labels=months[:3],series=[{'name':'Новые','values':[20,25,30],'unit':'шт.'},{'name':'Повторные','values':[30,35,50],'unit':'шт.'}],x_label='Месяц',y_label='Заказы')
add('kpi','За четыре месяца получено 576 млн руб. выручки',kpis=[{'label':'Выручка','value':sum(revenue),'unit':'млн руб.','aggregation':'Сумма','period':'Январь–апрель 2026'},
    {'label':'Среднее за месяц','value':sum(revenue)/len(revenue),'unit':'млн руб.','aggregation':'Среднее','period':'Январь–апрель 2026'},
    {'label':'Изменение','value':40,'unit':'%','aggregation':'Относительное изменение','period':'Апрель к январю 2026'}],calculations=[growth])
content=DeckContent(title='North — девять видов аналитики',slides=examples)
brand=parse_brand((OUT/'north-brand-package.zip').read_bytes(),'north-brand-package.zip');brand['id']='example-brand'
effective=resolve_brand(BASE,brand)
outputs=OUT/'rendered';outputs.mkdir(exist_ok=True)
reports={}
for variant in 'abc':
    for extension,export in [('pptx',export_pptx),('pdf',export_pdf),('html',export_html)]:
        (outputs/f'analytics-{variant}.{extension}').write_bytes(export(content,effective,variant))
    reports[variant]=[i.model_dump() for i in audit_deck(content,effective,variant,'')]
(outputs/'content.json').write_text(content.model_dump_json(indent=2),encoding='utf-8')
(outputs/'audit.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps({'synthetic':True,'parser':'brand-1','inputs':['north-tokens.json','north-guide.pdf','figma-document.json','north-brand-package.zip'],
    'expected':{'accent':'#006AD8','font':'Manrope','margin':64,'logo_aspect':4.2,'types':[s.analytics.chart_type for s in examples]},
    'validation':'Adapter fixtures; not evidence of a real model call or native PowerPoint visual rendering.',
    'audit_errors':{v:sum(i['severity']=='error' for i in rows) for v,rows in reports.items()}},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'errors':{v:sum(i['severity']=='error' for i in rows) for v,rows in reports.items()}},ensure_ascii=False))
