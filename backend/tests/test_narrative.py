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
    async def respond(system,payload,template,**kwargs):
        calls.append(deepcopy(payload))
        assert payload['narrative_brief']['key_question']=='Как изменилось значение?'
        assert payload['narrative_brief']['audience']=='Руководство'
        assert 'причина графика неизвестна' in system
        result=content.model_dump()
        if len(calls)==1: result['slides'][1]['body']='Рост на 23%'
        return result
    monkeypatch.setattr(llm,'complete_with_template',respond)
    result=asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    assert len(calls)==2 and '23' in calls[1]['repair']['problems']
    assert result.slides[1].body=='В мае: 123.' and result.audience=='Руководство'


def test_step_numbers_and_list_markers_are_navigation_anywhere_in_text():
    source='Запуск продукта в несколько этапов.'
    validate_narrative_slide(Slide(title='План запуска',body='Сначала идёт этап 1, затем фаза 2.',
                                   bullets=['1. Подготовка','2) Пилот','Переход к шагу 3 после проверки']),source)
    with pytest.raises(ValueError,match='числа'):
        validate_narrative_slide(Slide(title='План запуска',body='Этап 1 даст рост на 15%.'),source)


def test_outline_retry_reports_every_rejected_slide_and_final_error_names_the_reason(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='В апреле: 100. В мае: 123.')
    content=DeckContent(title='Сравнение',slides=[
        Slide(title='Изменение',kind='title',body='Рост на 23%'),
        Slide(title='Май',body='В мае: 123.'),
        Slide(title='Итог',body='Прибыль 40 млн')]).model_dump()
    calls=[]
    async def respond(system,payload,template,**kwargs):
        calls.append(deepcopy(payload)); return content
    monkeypatch.setattr(llm,'complete_with_template',respond)
    with pytest.raises(llm.LLMError,match='Причина: Слайд 1:') as error:
        asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    repair=calls[1]['repair']
    assert 'Слайд 1:' in repair['problems'] and '23' in repair['problems'] and 'Слайд 3:' in repair['problems'] and '40' in repair['problems']
    assert 'Слайд 2:' not in repair['problems'] and [item['slide'] for item in repair['rejected']]==[1,3]
    assert '50 000 символов' in str(error.value)


def test_outline_retry_states_the_slide_count_delta(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='Обзор запуска.')
    slides=[Slide(title='Обзор',kind='title'),Slide(title='Контекст'),Slide(title='Действия')]
    calls=[]
    async def respond(system,payload,template,**kwargs):
        calls.append(deepcopy(payload))
        return DeckContent(title='Обзор',slides=slides[:2] if len(calls)==1 else slides).model_dump()
    monkeypatch.setattr(llm,'complete_with_template',respond)
    result=asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    assert len(result.slides)==3
    assert 'получено 2' in calls[1]['format_correction'] and 'Добавь 1' in calls[1]['format_correction']


def test_outline_retry_rewrites_only_rejected_slides_and_keeps_the_rest(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='В мае: 123.')
    first=DeckContent(title='Обзор',slides=[Slide(title='Обзор',kind='title',notes='Исходная заметка'),
                                            Slide(title='Май',body='Рост на 23%'),Slide(title='Итог')]).model_dump()
    calls=[]
    async def respond(system,payload,template,**kwargs):
        calls.append(deepcopy(payload))
        return first if len(calls)==1 else {'slides':[Slide(title='Май',body='В мае: 123.').model_dump()]}
    monkeypatch.setattr(llm,'complete_with_template',respond)
    result=asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    assert [s.body for s in result.slides]==['','В мае: 123.',''] and result.slides[0].notes=='Исходная заметка'
    assert calls[1]['schema']['title']=='SlideRepair' and 'format_correction' not in calls[1]
    assert [item['slide'] for item in calls[1]['repair']['rejected']]==[2]
    assert [item['title'] for item in calls[1]['repair']['outline']]==['Обзор','Май','Итог']


def test_outline_repair_with_wrong_slide_count_fails_with_reason(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='В мае: 123.')
    first=DeckContent(title='Обзор',slides=[Slide(title='Обзор',kind='title'),Slide(title='Май',body='Рост на 23%'),Slide(title='Итог')]).model_dump()
    calls=[]
    async def respond(system,payload,template,**kwargs):
        calls.append(payload)
        return first if len(calls)==1 else {'slides':[Slide(title='А').model_dump(),Slide(title='Б').model_dump()]}
    monkeypatch.setattr(llm,'complete_with_template',respond)
    with pytest.raises(llm.LLMError,match='Причина: Нужно ровно 1 исправленных слайдов, получено 2'):
        asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))


def test_outline_wrong_slide_count_regenerates_the_whole_deck(monkeypatch):
    monkeypatch.setattr(settings,'mode','live')
    request=OutlineRequest(template_id='tech',count=3,prompt='Обзор.')
    slides=[Slide(title='Обзор',kind='title'),Slide(title='Контекст'),Slide(title='Действия')]
    calls=[]
    async def respond(system,payload,template,**kwargs):
        calls.append(deepcopy(payload))
        return DeckContent(title='Обзор',slides=slides[:2] if len(calls)==1 else slides).model_dump()
    monkeypatch.setattr(llm,'complete_with_template',respond)
    asyncio.run(llm.make_outline(request,{'id':'tech','name':'Test','metadata':{'ratio':16/9}}))
    assert 'repair' not in calls[1] and calls[1]['schema']['title']=='DeckContent'


@pytest.mark.parametrize('mode,accepted',[('description',True),('text',False)])
def test_outline_textual_table_cells_are_new_prose_only_in_description_mode(mode,accepted):
    request=OutlineRequest(template_id='tech',count=3,mode=mode,prompt='Запуск продукта.')
    table=Slide(title='Роли',kind='table',table=[['Функция','Задачи'],['Маркетинг','Продвижение']])
    if accepted: llm.validate_outline_slide(table,request,[])
    else:
        with pytest.raises(ValueError,match='ячейки'): llm.validate_outline_slide(table,request,[])
    numeric=Slide(title='Сроки',kind='table',table=[['Функция','Срок'],['Маркетинг','Неделя 2']])
    with pytest.raises(ValueError): llm.validate_outline_slide(numeric,request,[])
