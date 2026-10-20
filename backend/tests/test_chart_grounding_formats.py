"""Charts from common table layouts are confirmed by the material; invented ones still are not."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import ChartData, DeckContent, OutlineRequest, Slide
from app.services import llm
from app.services.visual_grounding import validate_visual

GROUNDED = {
    'long csv, comma inside heading': ('Год,Выручка, млн руб.\n2023,120\n2024,150\n2025,180',
                                       ['2023', '2024', '2025'], [120, 150, 180], 'млн руб.'),
    'wide csv, years as headings': ('Показатель,2023,2024,2025\nВыручка,120,150,180',
                                    ['2023', '2024', '2025'], [120, 150, 180], ''),
    'wide csv with unit in row label': ('Показатель,2023,2024,2025\nВыручка (млн руб.),120,150,180',
                                        ['2023', '2024', '2025'], [120, 150, 180], 'млн руб.'),
    'year suffix on chart label': ('2023: 120 млн руб.\n2024: 150 млн руб.', ['2023 г.', '2024 г.'], [120, 150], 'млн руб.'),
    'thousands and a plain noun': ('Москва: 1 200 клиентов\nКазань: 800 клиентов', ['Москва', 'Казань'], [1200, 800], ''),
    'unit in snake_case heading': ('Регион;Выручка_млн_руб\nМосква;40\nКазань;25', ['Москва', 'Казань'], [40, 25], 'млн руб.'),
    'prose': ('В 2023 году выручка составила 120 млн руб., в 2024 — 150 млн руб.', ['2023', '2024'], [120, 150], 'млн руб.'),
    'markdown table': ('| Регион | Продажи, шт. |\n|---|---|\n| Москва | 40 |\n| Казань | 25 |',
                       ['Москва', 'Казань'], [40, 25], 'шт.'),
}

INVENTED = {
    'wrong value': ('Год,Выручка, млн руб.\n2023,120\n2024,150', ['2023', '2024'], [120, 151], 'млн руб.'),
    'wrong unit': ('Показатель,2023,2024\nВыручка (млн руб.),120,150', ['2023', '2024'], [120, 150], '%'),
    'dropped unit': ('Москва: 40 млн руб.\nКазань: 25 млн руб.', ['Москва', 'Казань'], [40, 25], ''),
    'invented category': ('Москва: 40 шт.\nКазань: 25 шт.', ['Москва', 'Сочи'], [40, 25], 'шт.'),
    'value of another column': ('Регион,Продажи шт.,Доля %\nМосква,40,12\nКазань,25,8', ['Москва', 'Казань'], [12, 8], 'шт.'),
    'values of swapped years': ('Показатель,2023,2024\nВыручка (млн руб.),120,150', ['2023', '2024'], [150, 120], 'млн руб.'),
}


def chart(labels, values, unit):
    return Slide(title='Выручка', kind='chart', chart=ChartData(labels=labels, values=values, unit=unit))


@pytest.mark.parametrize('source,labels,values,unit', GROUNDED.values(), ids=GROUNDED)
def test_chart_from_material_is_confirmed(source, labels, values, unit):
    validate_visual(chart(labels, values, unit), source)


@pytest.mark.parametrize('source,labels,values,unit', INVENTED.values(), ids=INVENTED)
def test_invented_chart_is_still_rejected(source, labels, values, unit):
    with pytest.raises(ValueError, match='не подтверждены'):
        validate_visual(chart(labels, values, unit), source)


MATERIAL = 'Продажи по регионам.\nМосква: 40 шт.\nКазань: 25 шт.'


@pytest.fixture
def template(tmp_path, monkeypatch):
    from app import database as db
    monkeypatch.setattr(settings, 'database', tmp_path / 'charts.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'live')
    with TestClient(app):
        yield db.template_get('tech')


def test_outline_survives_a_chart_the_model_keeps_inventing(template, monkeypatch):
    calls = []
    async def respond(system, payload, **kwargs):
        calls.append(payload)
        return DeckContent(title='Продажи', slides=[
            Slide(title='Продажи по регионам', kind='title', body='Итоги по городам.'),
            Slide(title='Регионы', kind='chart', body='Москва впереди, Казань растёт.',
                  chart=ChartData(labels=['Москва', 'Сочи'], values=[40, 90], unit='шт.')),
            Slide(title='Итог', kind='text', body='Москва остаётся главным рынком.'),
        ]).model_dump()
    monkeypatch.setattr(llm, 'complete_json', respond)
    result = asyncio.run(llm.make_outline(OutlineRequest(template_id='tech', count=3, prompt=MATERIAL), template))
    # The model had its own correction first; then only the unconfirmed chart is removed, not the deck.
    assert len(calls) == 2 and 'repair' in calls[-1]
    slide = result.slides[1]
    assert slide.kind == 'text' and slide.chart is None
    assert slide.title == 'Регионы' and slide.body == 'Москва впереди, Казань растёт.'
