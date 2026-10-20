import pytest

from app.models import OutlineRequest, Slide
from app.services.llm import validate_outline_slide
from app.services.narrative import validate_narrative_slide

MATERIAL = 'Резервное копирование выполняется ежедневно. Все данные шифруются при передаче и хранении.'


def request():
    return OutlineRequest(template_id='tech', count=3, prompt=MATERIAL)


def test_paraphrased_quote_is_dropped_instead_of_rejecting_slide():
    slide = Slide(title='Безопасность', body='Данные защищены.', source_quote='Данные всегда шифруются')
    validate_outline_slide(slide, request(), [])
    assert slide.source_quote == ''


def test_verbatim_quote_is_kept():
    slide = Slide(title='Безопасность', body='Данные защищены.', source_quote='Все данные шифруются при передаче и хранении.')
    validate_outline_slide(slide, request(), [])
    assert slide.source_quote == 'Все данные шифруются при передаче и хранении.'


def test_unsupported_numbers_are_still_rejected():
    slide = Slide(title='Безопасность', body='Шифруется 95% данных.', source_quote='Данные всегда шифруются')
    with pytest.raises(ValueError, match='числа'):
        validate_outline_slide(slide, request(), [])


def test_narrative_validator_itself_stays_strict():
    slide = Slide(title='Безопасность', body='Данные защищены.', source_quote='Данные всегда шифруются')
    with pytest.raises(ValueError, match='source_quote'):
        validate_narrative_slide(slide, MATERIAL)


def test_rejection_reason_names_the_failing_field():
    from pydantic import ValidationError
    from app.models import DeckContent
    from app.services.llm import rejection_reason
    with pytest.raises(ValidationError) as exc:
        DeckContent.model_validate({'title': 'T', 'slides': [{'title': 'A', 'kind': 'nonsense'}]})
    reason = rejection_reason(exc.value)
    assert reason.startswith('slides.0.kind')
    assert 'validation error for' not in reason


def test_rejection_reason_keeps_plain_errors():
    from app.services.llm import rejection_reason
    assert rejection_reason(ValueError('Слайд 3: проблема\nподробности')) == 'Слайд 3: проблема'
