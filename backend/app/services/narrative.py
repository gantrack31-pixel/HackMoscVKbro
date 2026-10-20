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


def unsupported_numbers(text, source):
    return numbers(NAVIGATION_NUMBERS.sub('',text))-numbers(source)


def strip_unsupported_numbers(slide, source) -> int:
    """Last resort after the model failed to fix them: drop sentences and bullets with unsourced numbers.

    Removing a claim never invents one. The title is left alone, so a number there
    still rejects the slide. Returns how many sentences and bullets were removed.
    """
    removed=0
    def sentences(text):
        nonlocal removed
        parts=re.split(r'(?<=[.!?…])\s+',text)
        kept=[part for part in parts if not unsupported_numbers(part,source)]
        removed+=len(parts)-len(kept)
        return ' '.join(kept)
    slide.body=sentences(slide.body) if slide.body else slide.body
    slide.notes=sentences(slide.notes) if slide.notes else slide.notes
    keep=[i for i,bullet in enumerate(slide.bullets) if not unsupported_numbers(bullet,source)]
    if len(keep)<len(slide.bullets):
        # Icons are paired with bullets by position; drop the pair together.
        for field in ('icon_names','resource_icon_ids'):
            values=getattr(slide,field)
            if values and len(values)==len(slide.bullets): setattr(slide,field,[values[i] for i in keep])
        removed+=len(slide.bullets)-len(keep)
        slide.bullets=[slide.bullets[i] for i in keep]
    return removed


# Words that only say "make a presentation"; they carry no topic. Short exact forms
# avoid swallowing real topics ("температура", "любовь", "проектирование").
GENERIC_STEMS=('презентац','слайд','сдела','созда','подготов','presentation','slide')
GENERIC_WORDS={'тема','тему','темы','теме','нужна','нужно','нужен','нужны','мне','пожалуйста','какую','нибудь',
               'любую','любой','любая','просто','простую','простая','хорошую','хорошая','красивую','красивая',
               'проект','проекта','проекту','проектом','проекте','тест','тестовая','тестовую','для','про',
               'deck','make','create','about','please','test','project','something','any','the',
               # Two-letter function words; two-letter abbreviations (ИИ, AI, HR) still count as a topic.
               'на','за','от','до','об','во','из','ко','со','не','мы','вы','ты','он','an','of','on','to','in','my','me','is','it','at','by','or'}
VAGUE_PROMPT=('Уточните тему: о чём презентация, для кого она и что должна решить аудитория. '
              'Например: «Переход отдела продаж на CRM: сроки, затраты и риски — для руководства». '
              'Можно также приложить материал.')


def is_vague_prompt(prompt: str) -> bool:
    """True when the request names no topic at all, e.g. «Презентация» or «сделай слайды»."""
    words=re.findall(r'[^\W\d_]{2,}',prompt.casefold().replace('ё','е'))
    return not any(word not in GENERIC_WORDS and not word.startswith(GENERIC_STEMS) for word in words)
