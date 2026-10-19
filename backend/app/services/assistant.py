"""Bounded AI proposals. Rendering, evidence and atomic publication remain server-owned."""
import asyncio
import json
import re
from decimal import Decimal
from pydantic import ValidationError
from ..config import BASE, settings
from ..models import AssistantPlan, DeckContent, Slide, SlideDesign
from ..icon_catalog import model_icons
from . import llm
from .audit import audit_deck
from .layout import build_scene
from .template_context import model_template
from .visual_grounding import validate_visual, approved_material, normalize_model_icons, numbers, contains, numeric_series
from .sources import locate_quote, slide_binding
from .evidence import attach_material, source_text
from .assistant_context import presentation_context, relevant_source, scene_context
from .materials import compact_resource, image_data, icon_pack_data
from .canvas import explicit_layout
from .images import fill_missing_images


def slide_material(slide):
    return approved_material(DeckContent(title='Validation', slides=[slide]))


def instruction_supplies_evidence(candidate, request, source):
    """Formatting commands must not consume the bounded supplementary-source quota."""
    base = '\n\n'.join([source_text(source, request.content), request.material,
                          approved_material(request.content)])
    base_numbers = numbers(base) | {Decimal(str(value)) for series in numeric_series(base) for value in series['values']}
    if numbers(approved_material(candidate)) - base_numbers:
        return True
    prior_quotes = {slide.source_quote for slide in request.content.slides}
    for slide in candidate.slides:
        if slide.source_quote and slide.source_quote not in prior_quotes and not locate_quote(slide.source_quote, base):
            return True
        if slide.kind in {'chart', 'table'} and not any(
                old.kind == slide.kind and old.chart == slide.chart and old.table == slide.table
                for old in request.content.slides):
            try:
                validate_visual(slide, base)
            except ValueError:
                return True
    return False


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
    if request.preserve_facts and not (numbers(before) - removed).issubset(numbers(after)):
        raise ValueError('Нельзя удалять утверждённые числа. Сохраните их в заметках либо явно разрешите исправление факта по источнику.')
    old_labels, new_labels = labelled_values(before), labelled_values(after)
    corrected_labels = labelled_values('\n'.join(c.before for c in corrections))
    if request.preserve_facts and any(old_labels[key] != new_labels[key] and key not in corrected_labels for key in old_labels.keys() & new_labels.keys()):
        raise ValueError('Число перенесено к другому показателю. Для замены нужен подтверждённый источник и явное исправление факта.')
    allowed = numbers('\n'.join([source, request.material, approved_material(request.content)]))
    allowed |= {Decimal(str(value)) for series in numeric_series(source) for value in series['values']}
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
    bindings = {index: slide_binding(content.slides[index], source) if not content.slides[index].analytics
                else {'status': 'matched'} for index in indices}
    for variant in ('a', 'b', 'c'):
        scenes[variant], issues[variant] = {}, []
        for index in indices:
            slide = content.slides[index]
            scene = build_scene(slide, template['metadata'], variant, index)
            scenes[variant][index] = scene
            single = DeckContent(title=content.title, slides=[slide])
            for issue in audit_deck(single, template, variant, source, scenes=[scene], bindings=[bindings[index]]):
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
        base = previous.designs.get(variant) or previous.design or SlideDesign()
        design = {**base.model_dump(), **patch.design.model_dump(exclude_unset=True)}
        if 'objects' in patch.design.model_fields_set and patch.design.objects:
            design['objects'] = {**base.model_dump()['objects'], **{
                key: {**(base.objects[key].model_dump() if key in base.objects else {}),
                      **style.model_dump(exclude_unset=True)} for key, style in patch.design.objects.items()}}
        values['design'] = SlideDesign.model_validate(design).model_dump()
        values['designs'] = {**previous.model_dump()['designs'], variant: values['design']}
        values['layout'] = None
    elif 'design' in patch.model_fields_set:
        values['designs'] = {key: value for key, value in previous.model_dump()['designs'].items() if key != variant}
        values['layout'] = None
    if values.get('template_asset_id'):
        values['image_data'] = ''
    if 'image_prompt' in values and values['image_prompt'] != previous.image_prompt:
        values['image_data'] = ''
        values['template_asset_id'] = ''
        values['resource_id'] = ''
    if patch.elements is not None:
        old = {element.id: element for element in previous.elements}
        values['element_images'] = {element.id: previous.element_images[element.id] for element in patch.elements
            if element.id in previous.element_images and element.id in old
            and (element.template_asset_id, element.resource_id, element.image_prompt) ==
                (old[element.id].template_asset_id, old[element.id].resource_id, old[element.id].image_prompt)}
    # Asset bindings travel together; stale image data must not mask a new asset.
    if 'resource_id' in values and values['resource_id'] != previous.resource_id:
        values.update(resource_icon_ids=[], resource_icon_data=[], image_data='')
        if patch.resource_icon_ids is not None:
            values['resource_icon_ids'] = patch.resource_icon_ids
    if values.get('kind') and values['kind'] != previous.kind:
        if values['kind'] != 'chart': values['chart'] = None
        if values['kind'] != 'table': values['table'] = []
        if values['kind'] != 'image':
            values.update(image_data='', image_prompt='', template_asset_id='')
        if values['kind'] not in {'icons', 'diagram', 'steps'}:
            values.update(icon_names=[], resource_icon_ids=[], resource_icon_data=[])
        if values['kind'] not in {'image', 'icons', 'diagram', 'steps'}:
            values['resource_id'] = ''
    return Slide.model_validate({**previous.model_dump(), **values})


def apply_structure(candidate, plan, request, evidence, template):
    """Resolve original slide references once, after all content patches."""
    structural = bool(plan.added_slides) or plan.slide_order is not None
    if request.slide is not None and (structural or plan.title is not None or plan.audience is not None):
        raise ValueError('Изменение структуры, названия и аудитории доступно для всей презентации.')
    if structural and not request.allow_structure:
        raise ValueError('Изменение структуры отключено пользователем.')
    original_count = len(candidate.slides)
    for offset, patch in enumerate(plan.added_slides):
        if patch.slide != original_count + offset or not patch.title:
            raise ValueError('Новые слайды должны иметь заголовок и последовательные индексы после исходных.')
        if patch.analytics is not None or patch.kind == 'analysis':
            raise ValueError('Новые аналитические слайды создаются через анализ данных.')
        slide = apply_patch(Slide(title=patch.title), patch, request.variant)
        if slide.template_asset_id and slide.template_asset_id not in {a['id'] for a in template['metadata'].get('assets', [])}:
            raise ValueError('Картинка отсутствует в выбранном шаблоне.')
        enforce_constraints(Slide(title=patch.title), slide, request, patch.slide, evidence)
        validate_visual(slide, '\n'.join([evidence, approved_material(request.content)]), allow_new_text=not request.preserve_facts)
        candidate.slides.append(slide)
    order = plan.slide_order if plan.slide_order is not None else list(range(len(candidate.slides)))
    if (len(set(order)) != len(order) or any(i < 0 or i >= len(candidate.slides) for i in order)):
        raise ValueError('Порядок слайдов должен содержать уникальные существующие индексы.')
    removed = set(range(original_count)) - set(order)
    if any(lock.slide in removed for lock in request.locked_fields):
        raise ValueError('Нельзя удалить слайд с закреплённым полем.')
    if any(candidate.slides[i].analytics for i in removed):
        raise ValueError('Проверенные аналитические слайды нельзя удалять через помощника.')
    candidate.slides = [candidate.slides[i] for i in order]
    if any(not contains(approved_material(candidate), fact) for fact in request.locked_facts):
        raise ValueError('Закреплённый факт должен остаться в презентации.')
    if plan.title is not None:
        candidate.title = plan.title
    if plan.audience is not None:
        candidate.audience = plan.audience
    return DeckContent.model_validate(candidate.model_dump()), order


async def edit_presentation(request, template, source, resources=None):
    current = request.content.model_copy(deep=True)
    allowed = list(range(len(current.slides))) if request.slide is None else [request.slide]
    if any(i >= len(current.slides) for i in allowed):
        raise llm.LLMError('Такого слайда нет в презентации.')
    if any(lock.slide >= len(current.slides) for lock in request.locked_fields):
        raise llm.LLMError('Закреплённое поле относится к отсутствующему слайду. Обновите ограничения.')
    if any(not contains(approved_material(current), fact) for fact in request.locked_facts):
        raise llm.LLMError('Закрепляйте только факты, уже присутствующие в текущем черновике.')
    # Explicit user instructions can supply new figures/text as source material.
    instruction_material = request.instruction.strip()
    extra_material = '\n\n'.join(part for part in [request.material, instruction_material] if part)
    evidence = '\n\n'.join(part for part in [source_text(source, current), extra_material] if part)
    scenes, issues = await asyncio.to_thread(audit_snapshot, current, template, evidence, allowed)
    initial = len(issues[request.variant])
    asset_ids = {a['id'] for a in template['metadata'].get('assets', [])}
    system = (BASE / 'prompts/assistant.txt').read_text('utf-8')
    schema = llm.compact_schema(AssistantPlan)
    query = '\n'.join([request.instruction, request.pinned_brief, *[slide_material(current.slides[i]) for i in allowed]])
    bounded_source = relevant_source(source_text(source, current), query)
    # One proposal pass, plus one validation correction. Do not silently re-edit
    # valid proposals for unrelated remaining errors (formerly up to four calls).
    payload = {'action': request.action, 'instruction': request.instruction or 'Исправь презентацию по результатам проверки.',
               'allowed_slides': allowed, 'presentation': presentation_context(current, allowed),
               'allow_structure': request.slide is None and request.allow_structure,
               'preserve_facts': request.preserve_facts,
               'provided_numeric_series': numeric_series(request.instruction+'\n'+request.material),
               'image_generation_available': bool(settings.image_base_url),
               'next_slide_index': len(current.slides),
               'source': bounded_source, 'source_excerpted': len(bounded_source) < len(source_text(source, current)),
               'additional_material': request.material, 'template': model_template(template),
               'resource_catalog': [compact_resource(item) for item in (resources or [])][:80],
               'pinned_brief': request.pinned_brief,
               'conversation': [item.model_dump() for item in request.conversation],
               'locked_facts': request.locked_facts, 'locked_fields': [item.model_dump() for item in request.locked_fields],
               'allow_fact_corrections': request.allow_fact_corrections,
               'review_issues': [item.model_dump() for item in request.review_issues if item.slide in allowed],
               'icon_library': model_icons(), 'audit_issues': [i.model_dump() for i in issues[request.variant] if i.slide in allowed][:100],
               'geometry': [{'slide': i, **scene_context(scenes[request.variant][i])} for i in allowed],
               'schema': schema, 'pass': 1}
    for attempt in range(2):
        try:
            if settings.vision:
                from .scene_snapshot import scene_image
                images = await asyncio.to_thread(lambda: [scene_image(scenes[request.variant][i]) for i in allowed[:4]])
                raw = await llm.complete_json(system, payload, images=images)
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
                validate_visual(updated, '\n'.join([evidence, approved_material(request.content)]), previous,
                                allow_new_text=not request.preserve_facts)
                candidate.slides[patch.slide] = updated
                used_corrections.extend(local_corrections)
            if any(c not in used_corrections for c in plan.fact_corrections):
                raise ValueError('Исправление факта не связано с изменённым слайдом.')
            candidate, order = apply_structure(candidate, plan, request, evidence, template)
            for position, slide in enumerate(candidate.slides):
                ref = order[position]
                if ref < len(current.slides) and slide == current.slides[ref]:
                    continue
                for element in slide.elements:
                    if element.template_asset_id and element.template_asset_id not in asset_ids:
                        raise ValueError('Изображение объекта отсутствует в выбранном шаблоне.')
                    if element.resource_id:
                        resource = next((item for item in (resources or []) if item['id'] == element.resource_id), None)
                        if element.resource_id not in request.content.resource_ids or not resource or resource['kind'] != 'image':
                            raise ValueError('Для объекта выберите изображение из доступных материалов.')
                        slide.element_images[element.id] = await asyncio.to_thread(image_data, resource['path'])
                        if not slide.element_images[element.id]:
                            raise ValueError('Не удалось прочитать изображение объекта.')
                if slide.resource_id and slide.resource_id not in request.content.resource_ids:
                    raise ValueError('Используйте только материалы текущей презентации.')
                if slide.resource_id:
                    resource = next((item for item in (resources or []) if item['id'] == slide.resource_id), None)
                    if not resource:
                        raise ValueError('Материал больше недоступен. Обновите список материалов.')
                    if resource['kind'] == 'image':
                        slide.image_data = await asyncio.to_thread(image_data, resource['path'])
                        if not slide.image_data:
                            raise ValueError('Не удалось прочитать изображение материала.')
                    if resource['kind'] == 'icon_pack':
                        icons = {item['id'] for item in resource.get('metadata', {}).get('icons', [])}
                        if any(name not in icons for name in slide.resource_icon_ids):
                            raise ValueError('Иконка отсутствует в выбранном наборе.')
                        slide.resource_icon_data = await asyncio.to_thread(
                            lambda: [icon_pack_data(resource['path'], name) for name in slide.resource_icon_ids])
            candidate = DeckContent.model_validate(candidate.model_dump())
            audit_scope = list(range(len(candidate.slides))) if request.slide is None else allowed
            changed = [i for i in audit_scope if order[i] >= len(current.slides) or candidate.slides[i] != current.slides[order[i]]]
            if any((candidate.slides[i].kind == 'image' and candidate.slides[i].image_prompt
                    and not candidate.slides[i].image_data and not candidate.slides[i].template_asset_id)
                   or any(element.type == 'image' and element.image_prompt and not element.resource_id
                          and not element.template_asset_id and not candidate.slides[i].element_images.get(element.id)
                          for element in candidate.slides[i].elements) for i in changed):
                if not settings.image_base_url:
                    raise ValueError('Генератор изображений не подключён; используйте загруженное изображение или фигуры.')
                await fill_missing_images(candidate, slide_indices=changed)
                candidate = DeckContent.model_validate(candidate.model_dump())
            if candidate != current:
                # Persist the literal user input so new quotes stay verifiable.
                candidate = attach_material(candidate, request.material)
                if instruction_supplies_evidence(candidate, request, source):
                    candidate = attach_material(candidate, instruction_material)
            next_scenes, after = await asyncio.to_thread(audit_snapshot, candidate, template, evidence, audit_scope) if candidate != current else (scenes, issues)
            # Compare against the same original slide even after reorder/delete.
            mapped_before = {(v, new, code, obj) for v, old, code, obj in error_keys(issues)
                             for new, ref in enumerate(order) if old == ref}
            new_errors = error_keys(after) - mapped_before
            for i in changed:
                design = candidate.slides[i].designs.get(request.variant) or candidate.slides[i].design
                if design:
                    known = set(next_scenes[request.variant][i].get('editable_object_ids', []))
                    submitted = next((patch for patch in [*plan.changes, *plan.added_slides] if patch.slide == order[i]), None)
                    unknown = set(submitted.design.objects if submitted and submitted.design else {}) - known
                    if unknown:
                        raise ValueError('Неизвестные ID объектов: '+', '.join(sorted(unknown)[:5]))
                    locked = {lock.field for lock in request.locked_fields if lock.slide == order[i]}
                    targets = {'title': 'title', 'body': 'body', 'bullets': 'body', 'chart': 'chart', 'table': 'table'}
                    if any(field in locked and design.objects.get(target) and design.objects[target].hidden
                           for field, target in targets.items()):
                        raise ValueError('Нельзя скрыть объект с закреплённым полем.')
                if explicit_layout(candidate.slides[i]):
                    # Free composition may intentionally layer objects. Report visual
                    # warnings in the proposal; still reject bounds and missing data.
                    new_errors = {item for item in new_errors if item[1] != i or item[2] not in
                                  {'overlap', 'overflow', 'table_density', 'chart_density'}}
            if new_errors:
                details = ', '.join(f'{v}: слайд {i+1}, {code}, {obj}' for v, i, code, obj in sorted(new_errors)[:8])
                raise ValueError('Правки создают новые ошибки вёрстки: ' + details)
            break
        except (ValidationError, ValueError, llm.LLMFormatError) as exc:
            if attempt:
                raise llm.LLMError('Правки не прошли проверку; черновик не изменён. ' + str(exc)[:600]) from exc
            payload['format_correction'] = str(exc)[:1600]
    current, issues = candidate, after
    return current, {'summary': plan.summary,
                     'slide_order': order,
                     'changed_slides': [i for i in range(max(len(current.slides), len(request.content.slides)))
                                        if i >= len(current.slides) or i >= len(request.content.slides)
                                        or current.slides[i] != request.content.slides[i]],
                     'fact_corrections': [c.model_dump() for c in plan.fact_corrections], 'before': initial, 'audit_scope': audit_scope,
                     'issues': [i.model_dump() for i in issues[request.variant]],
                     'variant_issues': {v: [i.model_dump() for i in items] for v, items in issues.items()}}
