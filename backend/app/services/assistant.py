"""Bounded AI proposals. Rendering, evidence and atomic publication remain server-owned."""
import json
import re
from pydantic import ValidationError
from ..config import BASE, settings
from ..models import AssistantPlan, DeckContent, Slide
from ..icon_catalog import model_icons
from . import llm
from .audit import audit_deck
from .layout import build_scene
from .template_context import model_template
from .visual_grounding import validate_visual, approved_material, normalize_model_icons, numbers, contains
from .sources import locate_quote
from .evidence import attach_material, source_text
from .assistant_context import presentation_context, relevant_source, scene_context


def slide_material(slide):
    return approved_material(DeckContent(title='Validation', slides=[slide]))


def labelled_values(text):
    """Catch reassignment of explicit label:value records; not semantic fact checking."""
    return {label.strip().casefold(): numbers(value) for label, value in re.findall(
        r'([^\n.!?;:]{2,80}):\s*([-+−]?\d+(?:[.,]\d+)?)', text)}


def enforce_constraints(previous, updated, request, index, source, corrections=()):
    for lock in request.locked_fields:
        if lock.slide == index and getattr(previous, lock.field) != getattr(updated, lock.field):
            raise ValueError(f'Поле {lock.field} слайда {index + 1} закреплено; его нельзя изменять.')
    if updated.analytics != previous.analytics or (previous.analytics and (updated.kind != previous.kind or updated.title != previous.title)):
        raise ValueError('Данные, проверенный вывод и тип аналитического слайда меняются только через повторный анализ источника.')
    before, after = slide_material(previous), slide_material(updated)
    for fact in request.locked_facts:
        if contains(before, fact) and not contains(after, fact):
            raise ValueError(f'Закреплённый факт должен остаться без изменений: {fact}')
    removed = set()
    for correction in corrections:
        if not request.allow_fact_corrections:
            raise ValueError('Для замены фактов сначала разрешите исправления по источнику.')
        if (not contains(before, correction.before) or not contains(after, correction.after)
                or not locate_quote(correction.evidence, source)
                or not contains(correction.evidence, correction.after)):
            raise ValueError('Исправление факта требует прежней формулировки, новой формулировки и точного подтверждающего фрагмента источника.')
        removed |= numbers(correction.before)
    if not (numbers(before) - removed).issubset(numbers(after)):
        raise ValueError('Нельзя удалять утверждённые числа. Сохраните их в заметках либо явно разрешите исправление факта по источнику.')
    old_labels, new_labels = labelled_values(before), labelled_values(after)
    corrected_labels = labelled_values('\n'.join(c.before for c in corrections))
    if any(old_labels[key] != new_labels[key] and key not in corrected_labels for key in old_labels.keys() & new_labels.keys()):
        raise ValueError('Число перенесено к другому показателю. Для замены нужен подтверждённый источник и явное исправление факта.')
    allowed = numbers('\n'.join([source, request.material, approved_material(request.content)]))
    if previous.analytics:
        analytical = previous.analytics.model_dump()
        values = {key: analytical[key] for key in ('series', 'x_values', 'rows', 'kpis')}
        values['calculations'] = [{key: item[key] for key in ('result', 'baseline', 'comparison')}
                                  for item in analytical['calculations']]
        allowed |= numbers(json.dumps(values, ensure_ascii=False))
    if not numbers(after).issubset(allowed):
        raise ValueError('В тексте появились числа, не подтверждённые материалом или текущим черновиком.')
    if updated.source_quote != previous.source_quote and updated.source_quote and not locate_quote(updated.source_quote, source):
        raise ValueError('Новая цитата должна дословно присутствовать в исходном или дополнительном материале.')


def audit_snapshot(content, template, source, indices):
    """Only edited slides can change geometry; keep their original deck indices."""
    scenes, issues = {}, {}
    for variant in ('a', 'b', 'c'):
        scenes[variant], issues[variant] = {}, []
        for index in indices:
            slide = content.slides[index]
            scene = build_scene(slide, template['metadata'], variant, index)
            scenes[variant][index] = scene
            single = DeckContent(title=content.title, slides=[slide])
            for issue in audit_deck(single, template, variant, source, scenes=[scene]):
                issue.slide = index
                issue.id = f'{index}:{issue.code}:{issue.object_id}'
                issues[variant].append(issue)
    return scenes, issues


def error_keys(issues):
    return {(variant, i.slide, i.code, i.object_id) for variant, items in issues.items()
            for i in items if i.severity == 'error'}


def apply_patch(previous, patch, variant):
    # Missing means preserve; explicit null clears nullable fields.
    values = patch.model_dump(exclude_unset=True, exclude={'slide'})
    if patch.design:
        values['designs'] = {**previous.model_dump()['designs'], variant: patch.design.model_dump()}
        values['layout'] = None
    if values.get('template_asset_id'):
        values['image_data'] = ''
    if values.get('kind') and values['kind'] != previous.kind:
        if values['kind'] != 'chart': values['chart'] = None
        if values['kind'] != 'table': values['table'] = []
        if values['kind'] != 'image':
            values.update(image_data='', image_prompt='', template_asset_id='')
        if values['kind'] not in {'icons', 'diagram', 'steps'}:
            values.update(icon_names=[], resource_icon_ids=[], resource_icon_data=[])
    return Slide.model_validate({**previous.model_dump(), **values})


async def edit_presentation(request, template, source):
    current = request.content.model_copy(deep=True)
    allowed = list(range(len(current.slides))) if request.slide is None else [request.slide]
    if any(i >= len(current.slides) for i in allowed):
        raise llm.LLMError('Такого слайда нет в презентации.')
    if any(lock.slide >= len(current.slides) for lock in request.locked_fields):
        raise llm.LLMError('Закреплённое поле относится к отсутствующему слайду. Обновите ограничения.')
    if any(not contains(approved_material(current), fact) for fact in request.locked_facts):
        raise llm.LLMError('Закрепляйте только факты, уже присутствующие в текущем черновике.')
    evidence = '\n\n'.join(part for part in [source_text(source, current), request.material] if part)
    scenes, issues = audit_snapshot(current, template, evidence, allowed)
    initial = len(issues[request.variant])
    asset_ids = {a['id'] for a in template['metadata'].get('assets', [])}
    system = (BASE / 'prompts/assistant.txt').read_text('utf-8')
    summaries, corrections_report = [], []
    schema = llm.compact_schema(AssistantPlan)
    query = '\n'.join([request.instruction, request.pinned_brief, *[slide_material(current.slides[i]) for i in allowed]])
    bounded_source = relevant_source(source_text(source, current), query)
    for iteration in range(2 if request.action == 'repair' else 1):
        payload = {'action': request.action, 'instruction': request.instruction or 'Исправь презентацию по результатам проверки.',
                   'allowed_slides': allowed, 'presentation': presentation_context(current, allowed),
                   'source': bounded_source, 'source_excerpted': len(bounded_source) < len(source_text(source, current)),
                   'additional_material': request.material, 'template': model_template(template),
                   'pinned_brief': request.pinned_brief,
                   'conversation': [item.model_dump() for item in request.conversation],
                   'locked_facts': request.locked_facts, 'locked_fields': [item.model_dump() for item in request.locked_fields],
                   'allow_fact_corrections': request.allow_fact_corrections,
                   'review_issues': [item.model_dump() for item in request.review_issues if item.slide in allowed],
                   'icon_library': model_icons(), 'audit_issues': [i.model_dump() for i in issues[request.variant] if i.slide in allowed][:100],
                   'geometry': [{'slide': i, **scene_context(scenes[request.variant][i])} for i in allowed],
                   'schema': schema, 'pass': iteration + 1}
        for attempt in range(2):
            try:
                if settings.vision:
                    from .scene_snapshot import scene_image
                    raw = await llm.complete_json(system, payload, images=[scene_image(scenes[request.variant][i]) for i in allowed[:4]])
                else:
                    raw = await llm.complete_with_template(system, payload, template)
                plan = AssistantPlan.model_validate(normalize_model_icons(raw, 'changes'))
                indices = [p.slide for p in plan.changes]
                if len(indices) != len(set(indices)) or any(i not in allowed for i in indices):
                    raise ValueError('Каждый разрешённый индекс может встречаться только один раз.')
                candidate = current.model_copy(deep=True)
                used_corrections = []
                for patch in plan.changes:
                    if patch.template_asset_id and patch.template_asset_id not in asset_ids:
                        raise ValueError('Картинка отсутствует в выбранном шаблоне.')
                    previous = candidate.slides[patch.slide]
                    updated = apply_patch(previous, patch, request.variant)
                    local_corrections = [c for c in plan.fact_corrections if contains(slide_material(previous), c.before)]
                    enforce_constraints(previous, updated, request, patch.slide, evidence, local_corrections)
                    validate_visual(updated, '\n'.join([evidence, approved_material(request.content)]), previous)
                    candidate.slides[patch.slide] = updated
                    used_corrections.extend(local_corrections)
                if any(c not in used_corrections for c in plan.fact_corrections):
                    raise ValueError('Исправление факта не связано с изменённым слайдом.')
                if candidate != current:
                    candidate = attach_material(candidate, request.material)
                next_scenes, after = audit_snapshot(candidate, template, evidence, allowed) if candidate != current else (scenes, issues)
                new_errors = error_keys(after) - error_keys(issues)
                if new_errors:
                    details = ', '.join(f'{v}: слайд {i+1}, {code}, {obj}' for v, i, code, obj in sorted(new_errors)[:8])
                    raise ValueError('Правки создают новые ошибки вёрстки: ' + details)
                break
            except (ValidationError, ValueError, llm.LLMFormatError) as exc:
                if attempt:
                    raise llm.LLMError('Правки не прошли проверку; черновик не изменён. ' + str(exc)[:600]) from exc
                payload['format_correction'] = str(exc)[:1600]
        unchanged = candidate == current
        current, scenes, issues = candidate, next_scenes, after
        summaries.append(plan.summary)
        corrections_report.extend(c.model_dump() for c in plan.fact_corrections)
        if unchanged or not any(i.severity == 'error' and i.slide in allowed for i in issues[request.variant]):
            break
    return current, {'summary': ' '.join(summaries),
                     'changed_slides': [i for i in allowed if current.slides[i] != request.content.slides[i]],
                     'fact_corrections': corrections_report, 'before': initial, 'audit_scope': allowed,
                     'issues': [i.model_dump() for i in issues[request.variant]],
                     'variant_issues': {v: [i.model_dump() for i in items] for v, items in issues.items()}}
