"""AI edits the current draft; only validated patches are eligible for atomic save."""
from pydantic import ValidationError
from ..config import BASE, settings
from ..models import AssistantPlan, DeckContent, Slide
from . import llm
from .audit import audit_deck
from .layout import build_scene
from .template_context import model_template


async def edit_presentation(request, template, source):
    current = request.content.model_copy(deep=True)
    allowed = list(range(len(current.slides))) if request.slide is None else [request.slide]
    if any(i >= len(current.slides) for i in allowed):
        raise ValueError('Такого слайда нет в презентации.')
    asset_ids = {a['id'] for a in template['metadata'].get('assets', [])}
    system = (BASE / 'prompts/assistant.txt').read_text('utf-8')
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
                   'audit_issues':[i.model_dump() for i in issues if i.slide in allowed][:100],
                   'geometry':boxes,'schema':AssistantPlan.model_json_schema(),
                   'pass':iteration + 1}
        for attempt in range(2):
            try:
                raw = await llm.complete_with_template(system, payload, template)
                plan = AssistantPlan.model_validate(raw)
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
                    if updated.kind in {'diagram','icons'} and len(updated.bullets)>6:
                        raise ValueError('В схеме или пиктограммах может быть максимум 6 элементов.')
                    candidate.slides[patch.slide] = updated
                break
            except (ValidationError, ValueError, llm.LLMFormatError) as exc:
                if attempt:
                    raise llm.LLMError('AI вернул некорректные правки. Ваш текст сохранён без изменений.') from exc
                payload['format_correction'] = str(exc)[:1200]
        for issue in audit_deck(candidate, template, request.variant, source):
            if issue.slide in allowed and issue.fixable:
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
