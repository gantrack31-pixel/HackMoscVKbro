# AI operations

Full generation and regeneration have a 300-second business deadline, including
the generation-slot wait. Outline, assistant (including slide/style edits), image
and contextual audit requests have a shared wall-clock deadline, including queue
time: AI_OPERATION_TIMEOUT_SECONDS (default 240s). Expiry returns HTTP 504 with
AI_TIMEOUT, fails the operation and preserves the draft. HTTP connect/pool
timeouts are 15 seconds; LLM_TIMEOUT_SECONDS (default 180s) also bounds the total
duration of each inference request, including responses that trickle bytes.
Each image request has a 100s absolute limit.

LLM_REASONING_ENABLED=false is the default. OpenRouter requests disable hidden
reasoning; local Qwen3-compatible backends receive enable_thinking=false in
chat_template_kwargs. Other remote backends retain their provider defaults.
Explicit reasoning/thinking options in LLM_EXTRA_BODY take precedence. Set
LLM_REASONING_ENABLED=true to retain backend defaults without adding these options.
See [OpenRouter reasoning documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/best-practices/reasoning-tokens.mdx)
and [vLLM reasoning documentation](https://docs.vllm.ai/en/latest/features/reasoning_outputs/).

Direct requests reserve an owner-scoped ID with POST /api/ai/operations and send
X-AI-Operation-ID. Existing direct clients remain compatible but need this header
to expose Stop before the response. All operations use POST /api/jobs/{id}/cancel.
Queued/running operations become cancelled, not failed. A cross-worker DB watcher
cancels the executing coroutine and its child image tasks within one poll (100ms
under normal load). Publication and cancellation are serialized by transactions.
If publication won the race, cancel returns complete and the UI retains the result.
Cancelling regeneration never changes the original presentation.

Cancellation closes the local inference request. A remote provider may continue
computing/billing if it has no cancellation API. Already-running CPU threads cannot
be forcibly stopped; their outputs cannot publish after cancellation.

Generation builds layout once, audits A/B/C independently in worker threads, and
exports PPTX only on download. IMAGE_CONCURRENCY (default 2, bounded 1–8) limits
image requests per operation. The lifespan-owned HTTP client reuses connections;
injected test clients are neither replaced nor closed by the caller. Source
bindings are calculated once per slide and shared by A/B/C audits. Fuzzy source
comparisons cache repeated word pairs only during a call, retaining no private
source globally. Assistant audits and scene screenshots run in worker threads.
The cancellation watcher reads SQLite off the event loop.

Task token budgets: LLM_OUTLINE_MAX_TOKENS=12000, LLM_DESIGN_MAX_TOKENS=16000,
LLM_ASSISTANT_MAX_TOKENS=8000, LLM_AUDIT_MAX_TOKENS=4000. LLM_MAX_TOKENS remains
the fallback. These limits control output size, not time.

Outline creation makes at most two requests. A format/validation correction
retains its token budget; truncation can increase it once, to twice the configured
budget capped at 24000 (an explicitly larger initial budget is not reduced).
Assistant edit and repair make one proposal pass and at most one validation
correction. Remaining pre-existing issues are reported without silently starting
another editing pass. Model-facing schemas omit binary assets and analytical
evidence, prune unreachable definitions, and presentation context omits defaults.

For the whole-deck assistant scope, allow_structure=true permits added_slides and
slide_order. References are original indices; new slides have consecutive indices
starting at the original slide count. Missing references delete slides; duplicates,
empty decks and more than 200 final slides are rejected. Title/audience changes
are whole-deck only. Locked fields/facts and verified analytical slides remain
protected. The UI exposes a structure toggle, previews additions/deletions and
clamps the active slide after application. Changes require acceptance and support
undo. Translation and user-supplied new figures/text are supported; literal user
instructions supplying new figures, quotes or structured data travel with the
draft as evidence sources; ordinary formatting commands do not consume that
quota. Slide field locks follow the original slides after reordering.

The assistant UI now sends preserve_facts=false by default: explicitly replacing
content can remove old, unlocked figures. A separate checkbox preserves all old
numbers. API clients retain the conservative preserve_facts=true default. Locked
facts/fields, ownership and analytical evidence are always enforced.

Free composition uses Slide.elements (up to 60 objects) and design.objects keyed
by scene object IDs. Coordinates are scene pixels. Text, rectangles, ellipses,
lines, icons, uploaded/template/generated images, charts and tables share the
browser/PDF/HTML/PPTX rendering path. Whole blocks and individual chart/table
marks can be moved, resized, recolored, hidden or reordered; edited marks export
as individual native shapes when a native chart cannot express the change.
Colors accept validated #RRGGBB values outside the template palette. Font scales
range from 0.5 to 2; explicit text sizes range from 8 to 160 scene pixels.
Explicit color choices are preserved, with contrast findings shown for review.
Intentional overlap/density findings in free compositions do not reject the
proposal; off-slide geometry, unknown object IDs and missing image data do.

Charts can use literal ordered numeric series without fabricated units or metric
labels: 1, 2, 3, 4, 5 becomes a column chart with positional labels and unit="".
Repeated, negative and decimal values are supported. Provided units are retained;
invented values, factual category labels and units remain rejected. Qualitative
tables can be authored in free mode without literal-copy-only text constraints.

Project provenance includes monotonic timings for template, design, images,
layout, audit, persist and total; duration_seconds remains compatible. Persistence
timing excludes the final metadata write/commit tail. No private materials are
added to timings. IconaMoon selection is AI-only, server-validated, rendered as
individual icons, and preserves the bundled asset attribution.

Unit tests and the Playwright backend disable python-dotenv before app imports.
Do not run live latency measurements without separate authorized provider
configuration; offline benchmarks measure local work and request size only.
