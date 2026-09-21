"""Единственное место общения с моделью. Совместимо с /v1/chat/completions."""
import asyncio
import json
import re
from urllib.parse import urlparse
import httpx
from pydantic import ValidationError
from ..config import settings, BASE
from ..models import DeckContent, Slide, OutlineRequest

class LLMError(RuntimeError): pass

def configured() -> bool:
    host=urlparse(settings.base_url).hostname
    return bool(settings.base_url and settings.model and (settings.api_key or host in {'localhost','127.0.0.1','::1'}))

async def complete_json(system: str, payload: dict, client: httpx.AsyncClient | None = None) -> dict:
    if not configured(): raise LLMError('Заполните LLM_BASE_URL, LLM_MODEL и LLM_API_KEY в backend/.env.')
    parsed=urlparse(settings.base_url)
    if parsed.scheme not in {'http','https'} or parsed.username or parsed.query:
        raise LLMError('LLM_BASE_URL должен быть HTTP(S)-адресом API без ключей в URL.')
    headers={'Content-Type':'application/json'}
    if settings.api_key: headers['Authorization']='Bearer '+settings.api_key
    body={**settings.extra_body,'model':settings.model,'temperature':settings.temperature,'max_tokens':settings.max_tokens,
          'messages':[{'role':'system','content':system},{'role':'user','content':json.dumps(payload,ensure_ascii=False)}]}
    if settings.json_mode: body['response_format']={'type':'json_object'}
    owned=client is None
    client=client or httpx.AsyncClient(timeout=httpx.Timeout(settings.timeout,connect=15),follow_redirects=False)
    try:
        response=await client.post(settings.base_url+'/chat/completions',headers=headers,json=body)
        if response.status_code in {401,403}: raise LLMError('Провайдер отклонил ключ или доступ к модели. Проверьте .env.')
        if response.status_code==429: raise LLMError('Провайдер ограничил запросы. Повторите позже.')
        if response.status_code>=400: raise LLMError(f'Провайдер вернул HTTP {response.status_code}. Проверьте модель, URL и LLM_JSON_MODE.')
        data=response.json()
        text=data['choices'][0]['message']['content']
        if not isinstance(text,str): raise ValueError('Нет текстового ответа')
        text=re.sub(r'^\s*<think>.*?</think>\s*','',text,flags=re.S)
        text=re.sub(r'^\s*```(?:json)?\s*|\s*```\s*$','',text)
        result=json.loads(text)
        if not isinstance(result,dict): raise ValueError('JSON должен быть объектом')
        return result
    except httpx.TimeoutException as exc: raise LLMError('Модель не ответила за отведённое время. Уменьшите материал или повторите запрос.') from exc
    except httpx.HTTPError as exc: raise LLMError('Не удалось подключиться к LLM. Проверьте адрес сервера модели.') from exc
    except (ValueError,KeyError,IndexError,TypeError) as exc: raise LLMError('Ответ модели не соответствует формату JSON. Проверьте поддержку JSON у провайдера.') from exc
    finally:
        if owned: await client.aclose()

DEMO=[
    ('Deckly.Ai','Цифровой дизайнер презентаций'),
    ('От идеи до слайдов — без рутины','Материалы уже есть. Время уходит на структуру, оформление и проверку.'),
    ('Фирменный шаблон становится основой','Из PPTX извлекаются палитра, шрифты, размеры и поля макетов.'),
    ('Сначала структура, затем оформление','Заголовки и тезисы можно изменить до создания презентации.'),
    ('Одна история — три композиции','Варианты используют одинаковое содержание и один выбранный шаблон.'),
    ('Каждый тезис связан с источником','Цитата помогает найти основание утверждения. Совпадение текста не заменяет смысловую проверку.'),
    ('Проверка показывает, что улучшить','Геометрия и плотность проверяются правилами. Смысл проверяет модель, когда она подключена.'),
    ('Вы выбираете исправления','Изменения применяются к выбранным замечаниям. Предыдущую версию можно восстановить.'),
    ('Результат можно редактировать','PPTX содержит текстовые блоки, таблицы и диаграммы. Также доступны PDF и HTML.'),
    ('Следующий шаг — проверить на своих данных','Загрузите незнакомый шаблон, добавьте материал и оцените результат.')]

def demo_outline(request: OutlineRequest) -> DeckContent:
    if request.mode=='text':
        blocks=[b.strip() for b in re.split(r'\n\s*\n',request.prompt) if b.strip()]
        slides=[]
        for block in blocks[:request.count]:
            lines=block.splitlines();title=lines[0][:180]
            slides.append(Slide(title=title,body='\n'.join(lines[1:])[:2400] or title,source_quote=block[:1500]))
    elif 'deckly' in request.prompt.lower():
        slides=[Slide(title=t,body=b,kind='title' if i==0 else 'text') for i,(t,b) in enumerate(DEMO[:request.count])]
    else:
        topic=request.prompt.split('\n')[0][:160]
        slides=[Slide(title=topic,body='Черновик структуры. Подключите LLM для содержания по вашей теме.',kind='title'),
                *[Slide(title=t,body='Добавьте подтверждённые тезисы из исходных материалов.') for t in ['Контекст','Главная задача','Подход','План действий','Следующий шаг']]]
    slides=slides[:request.count]
    while len(slides)<request.count: slides.append(Slide(title=f'Раздел {len(slides)+1}',body='Добавьте материал для этого раздела.'))
    slides[0].kind='title'
    return DeckContent(title=slides[0].title,slides=slides)

async def make_outline(request: OutlineRequest, template: dict) -> DeckContent:
    if settings.mode=='demo': return demo_outline(request)
    if settings.mode!='live': raise LLMError('LLM_MODE должен быть demo или live.')
    system=(BASE/'prompts/outline.txt').read_text('utf-8')
    metadata=template['metadata']
    payload={'task':request.model_dump(),'template':{'name':template['name'],'fonts':metadata.get('fonts',[]),
              'palette':metadata.get('colors',{}),'ratio':metadata['ratio']},'schema':DeckContent.model_json_schema()}
    # Одна попытка + одно исправление формата. Общий лимит ограничен отдельно.
    async with asyncio.timeout(240):
        for attempt in range(2):
            raw=await complete_json(system,payload)
            try:
                result=DeckContent.model_validate(raw)
                if len(result.slides)!=request.count: raise ValueError(f'Нужно ровно {request.count} слайдов')
                return result
            except (ValidationError,ValueError) as exc:
                if attempt: raise LLMError('Модель дважды вернула некорректную структуру. Повторите с более коротким материалом.') from exc
                payload['format_correction']=str(exc)[:1600]
        raise LLMError('Не удалось создать структуру.')

async def review_content(content: dict, source: str) -> list[dict]:
    if settings.mode!='live' or not settings.context_audit: return []
    system=(BASE/'prompts/audit.txt').read_text('utf-8')
    raw=await complete_json(system,{'source':source,'presentation':content})
    issues=raw.get('issues',[])
    if not isinstance(issues,list): raise LLMError('Некорректный ответ смысловой проверки.')
    return [item for item in issues[:12] if isinstance(item,dict) and isinstance(item.get('slide'),int)
            and 0<=item['slide']<len(content['slides']) and isinstance(item.get('title'),str)
            and isinstance(item.get('detail'),str)]
