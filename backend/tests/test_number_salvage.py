"""BUG-05: unsourced counts left after the model's own correction no longer fail the whole outline."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models import DeckContent, OutlineRequest, Slide
from app.services import llm
from app.services.narrative import strip_unsupported_numbers, validate_narrative_slide

MATERIAL = ('Экология города: переработка отходов, чистый воздух и зелёные зоны. '
            'Жители сортируют мусор, город высаживает деревья и развивает общественный транспорт.')


@pytest.fixture
def template(tmp_path, monkeypatch):
    from app import database as db
    monkeypatch.setattr(settings, 'database', tmp_path / 'salvage.sqlite3')
    monkeypatch.setattr(settings, 'storage', tmp_path / 'data')
    monkeypatch.setattr(settings, 'mode', 'live')
    with TestClient(app):
        yield db.template_get('tech')


def test_strip_drops_only_sentences_and_bullets_with_unsourced_numbers():
    slide = Slide(title='Зелёные зоны', kind='icons',
                  body='Город высаживает деревья. Через 2 недели появятся 3 новых сквера.',
                  bullets=['Сортировка мусора', '2–3 новых парка', 'Общественный транспорт'],
                  icon_names=['check', 'growth', 'delivery'])
    assert strip_unsupported_numbers(slide, MATERIAL) == 2
    assert slide.body == 'Город высаживает деревья.'
    assert slide.bullets == ['Сортировка мусора', 'Общественный транспорт']
    assert slide.icon_names == ['check', 'delivery']  # icons stay paired with their bullets
    validate_narrative_slide(slide, MATERIAL)


def test_sourced_numbers_and_navigation_numbers_are_kept():
    slide = Slide(title='План', body='Шаг 1: собрать данные. Переработка растёт.', bullets=['Этап 2 — запуск'])
    assert strip_unsupported_numbers(slide, MATERIAL) == 0
    assert slide.bullets == ['Этап 2 — запуск']


def deck(numbers_in_title=False):
    return DeckContent(title='Экология', slides=[
        Slide(title='Экология города', kind='title', body='Переработка, воздух и зелёные зоны.'),
        Slide(title='Что делает город' + (' за 2 года' if numbers_in_title else ''), kind='text',
              body='Город высаживает деревья. За 2 недели высадят 300 деревьев.',
              bullets=['Сортировка мусора', '2–3 новых парка']),
        Slide(title='Итог', kind='text', body='Жители и город вместе улучшают экологию.'),
    ]).model_dump()


def run(template, monkeypatch, numbers_in_title=False):
    calls = []
    async def respond(system, payload, **kwargs):
        calls.append(payload)
        return deck(numbers_in_title)  # the model repeats the same unsourced numbers every time
    monkeypatch.setattr(llm, 'complete_json', respond)
    request = OutlineRequest(template_id='tech', count=3, prompt=MATERIAL)
    return calls, asyncio.run(llm.make_outline(request, template))


def test_outline_succeeds_after_model_keeps_unsourced_numbers(template, monkeypatch):
    calls, result = run(template, monkeypatch)
    # The model still got its own chance: first answer plus one partial repair.
    assert len(calls) == 2 and 'repair' in calls[-1]
    slide = result.slides[1]
    assert slide.body == 'Город высаживает деревья.'
    assert slide.bullets == ['Сортировка мусора']
    assert result.slides[0].title == 'Экология города' and result.slides[2].title == 'Итог'


def test_number_in_title_still_rejects(template, monkeypatch):
    with pytest.raises(llm.LLMError, match='числа'):
        run(template, monkeypatch, numbers_in_title=True)
