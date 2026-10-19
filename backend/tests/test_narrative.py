"""Evidence guards and request context are tested separately from live prose quality."""
import asyncio
from copy import deepcopy
import pytest
from app.config import settings
from app.models import DeckContent, OutlineRequest, Slide
from app.services import llm
from app.services.narrative import brief_from_request, validate_narrative_slide


def test_brief_preserves_explicit_question_decision_and_unknowns():
    request=OutlineRequest(template_id='tech',prompt='Ключевой вопрос: Что изменилось?\nРешение: Продолжить пилот\nПериод: Май\nОграничения: Не менять числа',audience='Руководство',purpose='initiative')
    brief=brief_from_request(request)
    assert brief['key_question']=='Что изменилось?' and brief['suggested_question']==''
    assert brief['intended_decision']=='Продолжить пилот' and brief['period']=='Май'
    assert brief['constraints']=='Не менять числа' and not brief['missing_information']
    unknown=brief_from_request(request.model_copy(update={'prompt':'Динамика выручки'}))
    assert unknown['intended_decision']==unknown['period']==unknown['key_question']==''
    assert len(unknown['missing_information'])==3 and unknown['suggested_question']
    assert unknown['evidence_policy']['causes']=='unknown unless evidenced'


@pytest.mark.parametrize('field',['title','body','bullets','notes'])
def test_unsupported_numeric_claims_rejected_in_all_narrative_fields(field):
    slide=Slide(title='Изменение',body='В апреле: 100. В мае: 123.')
    setattr(slide,field,['Рост 23%'] if field=='bullets' else 'Рост 23%')
    with pytest.raises(ValueError,match='числа'):
        validate_narrative_slide(slide,'В апреле: 100. В мае: 123.')


def test_literal_quotes_and_known_values_preserved_but_not_semantically_certified():
    source='В апреле: 100. В мае: 123. Причина изменения не исследовалась.'
    slide=Slide(title='Значение выросло',body='В мае: 123.',notes='Причина изменения неизвестна.',source_quote='В мае: 123.')
    validate_narrative_slide(slide,source)
    slide.source_quote='Рост вызван рекламой.'
    with pytest.raises(ValueError,match='source_quote'): validate_narrative_slide(slide,source)
    validate_narrative_slide(Slide(title='Шаг 2 — собрать причины',body='Уточнить причины изменения.'),source)


def test_outline_passes_brief_and_retries_unsupported_numbers(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='Ключевой вопрос: Как изменилось значение?\nВ апреле: 100. В мае: 123.',audience='Руководство')
    content=DeckContent(title='Сравнение',slides=[
        Slide(title='Изменение показателя',kind='title',body='В апреле: 100. В мае: 123.'),
        Slide(title='Май выше апреля',body='В мае: 123.',source_quote='В мае: 123.'),
        Slide(title='Уточнить причины',body='Причина изменения не указана.',notes='Нужно уточнить ожидаемое решение.')])
    calls=[]
    async def respond(system,payload,template):
        calls.append(deepcopy(payload))
        assert payload['narrative_brief']['key_question']=='Как изменилось значение?'
        assert payload['narrative_brief']['audience']=='Руководство'
        assert 'причина графика неизвестна' in system
        result=content.model_dump()
        if len(calls)==1: result['slides'][1]['body']='Рост на 23%'
        return result
    monkeypatch.setattr(llm,'complete_with_template',respond)
    result=asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    assert len(calls)==2 and '23' in calls[1]['format_correction']
    assert result.slides[1].body=='В мае: 123.' and result.audience=='Руководство'
