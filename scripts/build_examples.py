"""Воспроизводимый пример 3 шаблона × 3 композиции. Запуск из корня проекта."""
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from app.models import DeckContent,Slide,ChartData
from app.services.llm import DEMO
from app.services.templates import analyze_template
from app.services.export import export_pptx,export_pdf,export_html

out=ROOT/'examples';out.mkdir(exist_ok=True)
slides=[Slide(title=t,body=b,source_quote=b,kind='title' if i==0 else 'text') for i,(t,b) in enumerate(DEMO)]
slides[2]=Slide(title='Три исходных шаблона',body='Количество слайдов в предоставленных PPTX-файлах.',kind='chart',
    chart=ChartData(labels=['VK Tech','VK WorkSpace','VK Education'],values=[54,29,55],unit='слайдов'))
slides[4]=Slide(title='Одна история — три композиции',body='Содержание не переписывается при выборе оформления.',kind='table',
    table=[['Вариант','Композиция'],['А','Поля исходного шаблона'],['Б','Цветовой акцент'],['В','Увеличенные отступы']])
content=DeckContent(title='Deckly.Ai — демонстрация',slides=slides)
for tid in ['tech','workspace','education']:
    path=ROOT/'backend/data/templates'/f'{tid}.pptx'
    if not path.exists():raise SystemExit(f'Не установлен исходный шаблон: {path.name}')
    template={'path':str(path),'metadata':analyze_template(path)}
    for variant in ['a','b','c']:
        payload=export_pptx(content,template,variant)
        (out/f'Deckly-{tid}-{variant}.pptx').write_bytes(payload)
        print(f'{tid}-{variant}: {len(payload):,} bytes')
    if tid=='tech':
        (out/'Deckly-demo.pdf').write_bytes(export_pdf(content,template,'a'))
        (out/'Deckly-demo.html').write_bytes(export_html(content,template,'a'))
(out/'README.txt').write_text('Демонстрационные материалы о Deckly.Ai. Все 9 PPTX используют одно содержание. Данные диаграммы — число слайдов в трёх предоставленных шаблонах. Тексты примера написаны для демонстрации, не получены от LLM. Проверяйте графику мастеров в PowerPoint. PDF/HTML отображают схему размещения без графики мастеров.\n',encoding='utf-8')
