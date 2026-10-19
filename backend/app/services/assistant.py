"""AI edits the current draft; only validated patches are eligible for atomic save."""
from pydantic import ValidationError
import json
from ..config import BASE, settings
from ..models import AssistantPlan, DeckContent, Slide
from . import llm
from .audit import audit_deck
from .layout import build_scene
from .template_context import model_template
from ..icon_catalog import model_icons
from .visual_grounding import validate_visual, approved_material, normalize_model_icons, numbers, contains
from .sources import locate_quote


def slide_material(slide):
    return approved_material(DeckContent(title='Validation', slides=[slide]))


def enforce_constraints(previous, updated, request, index, source):
    """Deterministic protection complements, but does not replace, semantic review."""
    for lock in request.locked_fields:
        if lock.slide == index and getattr(previous, lock.field) != getattr(updated, lock.field):
            raise ValueError(f'Поле {lock.field} слайда {index + 1} закреплено; его нельзя изменять.')
    if updated.analytics != previous.analytics or (previous.analytics and updated.kind != previous.kind):
        raise ValueError('Данные и расчёты аналитического слайда меняются только через повторный анализ источника; сохрани их без изменений.')
    before, after = slide_material(previous), slide_material(updated)
    for fact in request.locked_facts:
        if contains(before, fact) and not contains(after, fact):
            raise ValueError(f'Закреплённый факт должен остаться без изменений: {fact}')
    if not numbers(before).issubset(numbers(after)):
        raise ValueError('Нельзя удалять или менять утверждённые числа; перенеси подробности в заметки.')
    allowed = numbers('\n'.join([source, request.material, approved_material(request.content)]))
    if previous.analytics:
        # Only computed/observed data, never IDs, hashes or arbitrary metadata.
        analytical = previous.analytics.model_dump()
        values = {key: analytical[key] for key in ('series', 'x_values', 'rows', 'kpis')}
        values['calculations'] = [{key: item[key] for key in ('result', 'baseline', 'comparison')}
                                  for item in analytical['calculations']]
        allowed |= numbers(json.dumps(values, ensure_ascii=False))
    if not numbers(after).issubset(allowed):
        raise ValueError('В тексте появились числа, не подтверждённые материалом или текущим черновиком.')
    if updated.source_quote != previous.source_quote and updated.source_quote and not locate_quote(updated.source_quote, source):
        raise ValueError('Новая цитата должна дословно присутствовать в исходном материале.')


async def edit_presentation(request, template, source):
    current = request.content.model_copy(deep=True)
    allowed = list(range(len(current.slides))) if request.slide is None else [request.slide]
    if any(i >= len(current.slides) for i in allowed):
        raise ValueError('Такого слайда нет в презентации.')
    if any(lock.slide >= len(current.slides) for lock in request.locked_fields):
        raise llm.LLMError('Закреплённое поле относится к отсутствующему слайду. Обновите ограничения.')
    if any(not contains(approved_material(current), fact) for fact in request.locked_facts):
        raise llm.LLMError('Закрепляйте только факты, уже присутствующие в текущем черновике.')
    asset_ids = {a['id'] for a in template['metadata'].get('assets', [])}
    system = (BASE / 'prompts/assistant.txt').read_text('utf-8')
    system += ('\nИспользуй pinned_brief как утверждённую задачу и conversation только как контекст прошлых правок. '
               'Текущая instruction имеет приоритет над прежними пожеланиями. locked_fields и locked_facts нельзя менять. '
               'Не меняй остальные поля без необходимости для текущего запроса. Сохрани все числа, при сокращении перенеси их в notes. '
               'Не выдумывай причины графика: если источник не объясняет причину, укажи это в summary. '
               'Если инструкция невыполнима без новых данных или противоречит ограничениям, верни changes=[] и объясни ограничение. '
               'Ты готовишь предложение для просмотра; не утверждай, что оно уже применено или сохранено.')
    initial = audit_deck(current, template, request.variant, source)
    summaries = []
    changed = set()
    for iteration in range(2 if request.action == 'repair' else 1):
        issues = audit_deck(current, template, request.variant, source)
        safe_content = current.model_dump()
        for slide in safe_content['slides']:
            slide['has_image'] = bool(slide.pop('image_data', ''))
        boxes = []
        for i in allowed:
            scene = build_scene(current.slides[i], template['metadata'], request.variant, i)
            boxes.append({'slide':i,'text_boxes':[
                {k:o[k] for k in ('id','w','h','font_size','used_height')}
                for o in scene['objects'] if o['type']=='text']})
        payload = {'action':request.action,'instruction':request.instruction or 'Исправь презентацию по результатам проверки.',
                   'allowed_slides':allowed,'presentation':safe_content,'source':source,
                   'additional_material':request.material,'template':model_template(template),
                   'pinned_brief':request.pinned_brief,
                   'conversation':[item.model_dump() for item in request.conversation],
                   'locked_facts':request.locked_facts,
                   'locked_fields':[item.model_dump() for item in request.locked_fields],
                   'icon_library':model_icons(),
                   'audit_issues':[i.model_dump() for i in issues if i.slide in allowed][:100],
                   'geometry':boxes,'schema':llm.compact_schema(AssistantPlan),
                   'pass':iteration + 1}
        for attempt in range(2):
            try:
                raw = await llm.complete_with_template(system, payload, template)
                plan = AssistantPlan.model_validate(normalize_model_icons(raw,'changes'))
                indices = [p.slide for p in plan.changes]
                if len(indices) != len(set(indices)) or any(i not in allowed for i in indices):
                    raise ValueError('Каждый разрешённый индекс может встречаться только один раз.')
                candidate = current.model_copy(deep=True)
                for patch in plan.changes:
                    values = patch.model_dump(exclude_unset=True, exclude_none=True, exclude={'slide'})
                    if values.get('template_asset_id') and values['template_asset_id'] not in asset_ids:
                        raise ValueError('Картинка отсутствует в выбранном шаблоне.')
                    previous = candidate.slides[patch.slide]
                    if patch.design:
                        values['designs'] = {**previous.model_dump()['designs'],request.variant:patch.design.model_dump()}
                        values['layout'] = None
                    if values.get('template_asset_id'):
                        values['image_data'] = ''
                    updated = Slide.model_validate({**previous.model_dump(), **values})
                    enforce_constraints(previous,updated,request,patch.slide,source)
                    validate_visual(updated,'\n'.join([source,request.material,approved_material(request.content)]),previous)
                    if updated.kind in {'diagram','icons'} and len(updated.bullets)>6:
                        raise ValueError('В схеме или пиктограммах может быть максимум 6 элементов.')
                    candidate.slides[patch.slide] = updated
                break
            except (ValidationError, ValueError, llm.LLMFormatError) as exc:
                if attempt:
                    raise llm.LLMError('AI вернул некорректные правки. Ваш текст сохранён без изменений.') from exc
                payload['format_correction'] = str(exc)[:1200]
        for issue in audit_deck(candidate, template, request.variant, source):
            if request.action == 'repair' and issue.slide in allowed and issue.fixable:
                slide = candidate.slides[issue.slide]
                slide.fixed = list(set(slide.fixed + [issue.code]))
        after = audit_deck(candidate, template, request.variant, source)
        # A repair may not silently worsen the number of layout errors.
        before_errors = sum(i.severity=='error' for i in issues)
        after_errors = sum(i.severity=='error' for i in after)
        if request.action == 'repair' and after_errors > before_errors:
            summaries.append('AI предложил правки с новыми ошибками вёрстки; они не применены.')
            break
        changed.update(i for i in allowed if candidate.slides[i] != current.slides[i])
        current = candidate
        summaries.append(plan.summary)
        if not any(i.severity=='error' and i.slide in allowed for i in after):
            break
    return current, {'summary':' '.join(summaries), 'changed_slides':sorted(changed),
                     'before':len(initial), 'issues':[i.model_dump() for i in audit_deck(current,template,request.variant,source)]}
