# AI operations

Full generation and regeneration have a 300-second business deadline, including
the generation-slot wait. Outline, assistant (including slide/style edits), image
and contextual audit requests have no business deadline. HTTP connect/pool
timeouts are 15 seconds; read/write inactivity limits remain LLM_TIMEOUT_SECONDS
(default 180s) and 100s for images. These are not total-operation deadlines.

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
injected test clients are neither replaced nor closed by the caller.

Task token budgets: LLM_OUTLINE_MAX_TOKENS=12000, LLM_DESIGN_MAX_TOKENS=16000,
LLM_ASSISTANT_MAX_TOKENS=8000, LLM_AUDIT_MAX_TOKENS=4000. LLM_MAX_TOKENS remains
the fallback. These limits control output size, not time.

Project provenance includes monotonic timings for template, design, images,
layout, audit, persist and total; duration_seconds remains compatible. Persistence
timing excludes the final metadata write/commit tail. No private materials are
added to timings. IconaMoon selection is AI-only, server-validated, rendered as
individual icons, and preserves the bundled asset attribution.
