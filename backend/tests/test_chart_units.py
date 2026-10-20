from types import SimpleNamespace as NS

import pytest

from app.services.visual_grounding import validate_visual

SOURCE = ('Компания «Облако-Про» переходит с локальных серверов на облачное хранение данных.\n'
          'Затраты на серверы, млн руб. в год:\n'
          'Год;Затраты, млн руб\n'
          'Сейчас (локальные серверы);4,2\n'
          'После переноса (облако);2,9\n'
          'Файлы доступны сотрудникам из любой точки.')
LABELS = ['Сейчас (локальные серверы)', 'После переноса (облако)']


def check(values, unit, labels=LABELS):
    slide = NS(kind='chart', chart=NS(labels=labels, values=values, unit=unit), designs={}, design=None,
               diagram_type=None, diagram_style=None, bullets=[], icon_names=None, table=[], elements=[])
    validate_visual(slide, SOURCE)


@pytest.mark.parametrize('unit', ['млн руб', 'млн руб.', 'млн ₽'])
def test_unit_spelling_variants_of_the_same_source_unit_are_accepted(unit):
    check([4.2, 2.9], unit)


def test_wrong_value_is_still_rejected_even_with_matching_unit():
    with pytest.raises(ValueError, match='не подтверждены'):
        check([4.5, 2.9], 'млн руб')


def test_fabricated_unit_is_still_rejected():
    with pytest.raises(ValueError, match='не подтверждены'):
        check([4.2, 2.9], 'тыс. руб')


def test_dropping_a_sourced_unit_is_still_rejected():
    with pytest.raises(ValueError, match='не подтверждены'):
        check([4.2, 2.9], '')
