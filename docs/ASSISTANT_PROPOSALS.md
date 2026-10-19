# Reviewed edits and concurrent writes

The public save (`PUT /api/projects/{id}`), selected fixes (`POST .../fix`),
undo and redo routes require `base_updated_at`, taken from the displayed saved
project. Undo/redo accept `{ "base_updated_at": "..." }`. Preview remains
read-only and does not require a version. Missing versions return HTTP 409 with
`detail.code=VERSION_REQUIRED`; stale versions return `VERSION_CONFLICT`.
Ownership is checked before exposing revision conflicts. Comparison and writing
are serialized by the same SQLite `BEGIN IMMEDIATE` transaction. Internal writes
used to initialize a new project retain their existing interface.

`POST /api/projects/{id}/assistant` prepares a proposal without saving changes.
It retains the existing AI operation reservation, Stop and provider timeout
contracts. The body includes the latest draft, variant, saved revision, requested
slide index (or null for all slides), instruction and optional material. Optional
`pinned_brief` (4,000 characters), `conversation` (10 role/content turns),
`locked_facts` (30 strings, 500 characters each) and `locked_fields` (60
slide/field pairs) provide bounded correction context. Source material is not an
instruction channel. Locked fields and exact locked facts, existing numeric
values, slide scope, source quotes and structured-data grounding are validated.
Analytical data and computations cannot be replaced through a model patch.
These guards do not prove the truth of every freely worded interpretation.

The response retains summary, changed_slides, before and issues. `project` is
null; `proposal` is null for a no-op, otherwise it contains:

- id, project_id, state (`pending`), content and field-level changes;
- base_updated_at, draft_fingerprint, source_fingerprint;
- slide, variant and expires_at (30 minutes after creation).

The field-level changes contain slide, field, before and after. Render these as
plain text or structured UI; image data should be summarized rather than printed.
The client keeps its current draft while showing this review.

Apply with `POST /api/projects/{id}/assistant/proposals/{proposal_id}/apply`,
sending the *current* local `content`, `variant` and `base_updated_at`. The server
compares the canonical draft fingerprint, saved version, source fingerprint,
owner and expiry before writing. The response includes the saved project and the
original report. Undo first restores the draft that was submitted to AI, including
its unsaved manual changes. Apply is single-use. Reject with `POST .../reject`;
no body is needed and neither the saved project nor client draft changes.

Conflicts use HTTP 409 with `DRAFT_CHANGED`, `SOURCE_CHANGED`,
`VERSION_CONFLICT`, `PROPOSAL_CLOSED` or `PROPOSAL_EXPIRED`. Keep the current draft
and request a fresh proposal. Never automatically retry an apply with changed
content. A new request may include earlier discussion and the latest draft.

Proposal publication and cancellation share an atomic operation-state check.
If cancellation wins, no proposal is stored. If publication wins, the operation
is complete and the proposal is available for explicit review. Applying or
rejecting scrubs the stored private payload; expiry is scrubbed on access and
expired records are deleted on startup or a new proposal. At most 20 records per
owner/project are retained. Project deletion and account deletion also remove
proposals (the latter is a database trigger; no new account-deletion UI is added).

Tests: test_project_concurrency.py runs simultaneous tab saves and checks stale
save/fix/undo/redo. test_assistant_proposals.py covers review/reject, draft/source/
variant/version/expiry conflicts, owner checks, one-time apply, context, locked
facts, numeric/source constraints, immutable analytics, and late cancellation.
test_assistant.py verifies undo restores an unsaved draft. All use temporary DBs;
no live model or user project is modified.
