"""Evidence-first outline context and deterministic claim guards, not fact-checking."""
import re
from .sources import locate_quote
from .visual_grounding import numbers


QUESTIONS = {
    'project': 'Какой результат проекта подтверждён и какой следующий шаг обоснован?',
    'product': 'Какую задачу решает продукт и чем подтверждена его польза?',
    'feature': 'Как меняется сценарий пользователя и чем подтверждено улучшение?',
    'initiative': 'Какое предложение следует рассмотреть и достаточно ли оснований для решения?',
}


def brief_from_request(request):
    def labelled(names):
        pattern=r'^\s*(?:'+names+r')\s*:\s*(.+)$'
        found=re.search(pattern, request.prompt, re.I | re.M)
        return found.group(1).strip()[:1000] if found else ''
    question=labelled('ключевой вопрос|главный вопрос|вопрос|key question|question')
    decision=labelled('ожидаемое решение|решение|цель решения|intended decision|decision')
    period=labelled('период|период анализа|period')
    constraints=labelled('ограничения|важно сохранить|constraints')
    missing=[]
    if not question: missing.append('Какой главный вопрос должна закрыть презентация?')
    if not decision: missing.append('Какое решение или действие ожидается от аудитории?')
    if not period and re.search(r'динамик|выручк|продаж|trend|revenue|growth',request.prompt,re.I):
        missing.append('За какой период и с какой базой сравниваются данные?')
    return {'purpose':request.purpose, 'audience':request.audience,
            'key_question':question, 'suggested_question':QUESTIONS[request.purpose] if not question else '',
            'intended_decision':decision, 'period':period, 'constraints':constraints,
            'missing_information':missing[:3],
            'evidence_policy':{'facts':'explicit source only', 'calculations':'deterministic analytics only',
                               'interpretation':'label uncertainty', 'causes':'unknown unless evidenced',
                               'recommendations':'proportionate to evidence'}}


NAVIGATION_NUMBERS=re.compile(
    r'\b(?:шаг|этап|фаз|раздел|слайд|част|step|phase|stage|section|slide|part)\w*\s+\d{1,2}\b'
    r'|^\s*\d{1,2}[.)]\s+', re.I | re.M)


def validate_narrative_slide(slide, source):
    if slide.analytics is not None:
        raise ValueError('Аналитические расчёты создаёт модуль анализа данных; модель не может создавать их самостоятельно.')
    if slide.source_quote and not locate_quote(slide.source_quote,source):
        raise ValueError('source_quote должна дословно присутствовать в исходном материале или быть пустой.')
    # Slide/step numbers and list markers are navigation, not quantitative claims.
    texts=[slide.title,slide.body,*slide.bullets,slide.notes]
    clean=[NAVIGATION_NUMBERS.sub('',text) for text in texts]
    unsupported=numbers('\n'.join(clean))-numbers(source)
    if unsupported:
        raise ValueError('В тексте есть числа, которых нет в источнике: '+', '.join(str(v) for v in sorted(unsupported))+
                         '. Не выдумывай показатели, цели, сроки или проценты; неизвестное обозначь словами.')
