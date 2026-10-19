# Implementation evidence — 19 October 2026

This log concerns target **A** only:
`C:/Users/GT/Desktop/HackMoscVKbro-updated-2026-10-18/HackMoscVKbro-main`.
Copies B and C remain separate reference material. No user database, secrets,
storage tree or previous build was copied into this implementation. The local
checkpoint is under
`C:/Users/GT/Documents/Codex/2026-09-16/deckly-implementation-2026-10-19/checkpoint`.

The current work takes requirements from the supplied comprehensive improvement
prompt, existing README, REQUIREMENTS, AI_OPERATIONS and VALIDATION documents,
and the authorized Stage 2 implementation. Historical documents are evidence of
intent and earlier runs, not proof of the current combined build. The original
complete Stage 1 Appendix 1 remains **unverified**; no extra scoring rule or model
size restriction has been inferred from it. The expert-feedback fragment asks
for useful meaning and supported conclusions, not a replacement visual identity.

## Baseline and distinct evidence categories

The root agent's actual isolated baseline during this implementation was
**311 passed, 2 failed, 4 skipped, 112.24 seconds**. This differs from the older
review's 314/2/1 count and must not be replaced by that historical number.
The failures were reproduced in cancellation's test stub (`design(*args)` did
not accept the production `resources=` keyword) and a preview fixture expecting
an unreferenced package image to become a slide cover. The fixes preserve the
cancellation assertions and reject arbitrary package media.

| Category | Verified evidence and practical consequence |
| --- | --- |
| Confirmed current defect | Workspace bootstrap committed templates only after health and favorites also succeeded; draft quote text could retain a saved source badge; ordinary save lacked an atomic expected-version guard. Source inspection in A, then targeted changes and checks. |
| Observed environment limitation | `pdftoppm` exists locally; neither `libreoffice`/`soffice` nor the standard Windows LibreOffice executable exists. Composite PPTX covers without a genuine embedded thumbnail cannot be claimed as faithfully rendered. |
| Missing requirement | A's baseline had no integrated Stage 2 ingestion, deterministic nine-chart analysis or style-source pipeline. These are implemented in A's architecture and require combined flow/export acceptance. |
| Reference-copy defect | Earlier-copy job/draft behavior and old review counts are not treated as current defects or current proof. No merge from B/C was performed. |
| Proposed enhancement | A reviewed AI proposal replaces implicit AI saving; brief context and numerical guards make requested edits easier to inspect. This is an enhancement alongside confirmed concurrency fixes. |

## Acceptance matrix

These entries distinguish executed browser/API/unit checks from unavailable live-provider, native Office and deployment checks. Numerical counts below are complete runs, never a sum of overlapping suites. Scope and baseline analysis were recorded before implementation; this matrix now records the combined acceptance observations.

| ID | Requirement and implementation | Current evidence / practical limit |
| --- | --- | --- |
| T01 | Existing non-analytical content, versions and exports retained; atomic version guards added. | Workflow/concurrency/history tests; actual checkpoint/current frontend opened the same ordinary three-slide fixture. No private historical user projects were mutated. |
| T02 | A/B/C creation, cancellation, deadline, retry and recovery use existing jobs. | Complete real demo; operation/deadline API tests; [polling recovery](../examples/outputs/acceptance/polling-recovery-report.json): 503, reload, 401, malformed 200, one generate, zero retry POSTs, one project. |
| T03 | Drafts scoped to owner/tab, durable recovery, explicit new work. | Runtime storage tests; [two actual accounts in one database/browser](../examples/outputs/acceptance/account-draft-review.json); editor/session and audit recovery browser checks. |
| T04 | Imported source blocks remain separate from authored text. | [Fault-browser report](../examples/outputs/evidence/reliability-asgi-browser-report.json): removed distinctive fact absent from real outline request; authored text retained. Packet atomicity tests cover rollback and deduplication. |
| T05 | Template, health and favorites bootstrap independently. | Injected null 503 / HTML 500 leave templates available; local retry restores optional sections. |
| T06 | Saved quote badges invalidated after draft changes; analytical evidence has its own presentation. | Actual quote edit/reload removes old green badge; source-context/reorder/delete API tests. |
| T07 | Structured and malformed errors handled; downloads validate type/signature. | Runtime API tests; HTML 200 never downloads as PPTX; 401 opens authentication and retains draft; real PPTX/PDF/HTML downloads inspected. |
| T08 | Seven synthetic datasets and manifests. | [Analytics examples](../examples/analytics/manifest.json): trend, categories, shares, distribution, 200 rows, missing values, embedded table. |
| T09 | Deterministic calculations, units, baseline and lineage. | Engine tests cover 100→123=23%, zero/negative base, percentage points, duplicate/unsorted dates, mixed units and reconciled totals; demo PDF reviewed. |
| T10 | CSV/TSV/XLSX/JSON/text normalization. | Cross-format tests include Excel percent/currency styles and identifiers with leading zeros; equivalent fixtures supplied. |
| T11 | Analytical meaning invariant under template/style changes. | Canonical payload and two-template tests; A/B/C content invariance and native output checks. |
| T12 | Objective-sensitive recommendations and visible rationale. | Trend/comparison engine checks; actual UI selection and canonical preview for all nine types. |
| T13 | Table, line, bar, histogram, pie, scatter, grouped, stacked, KPI. | Native chart/table/shape tests and [27 rendered A/B/C slides](../examples/brands/rendered/browser-review.json). Office visual acceptance remains unavailable. |
| T14 | Difficult data retains semantics. | Tests for missing pairs, identifiers, snapshot balances, 48-month dates, outliers and tiny histogram intervals; no fixture-specific rendering shortcuts. |
| T15 | Profile before plan limits; full reference access and paginated appendix. | Actual 1,000-row UI profile → explicit table plan → compact KPI; 200-row cell reconciliation tests; 30/120 plan limits and 200-slide deck limit visible. |
| T16 | Bounded local brand parsing and representative inputs. | PDF, tokens, Figma document JSON, logo/sample ZIP fixtures; malformed/archive/ownership/process-limit tests. Binary .fig and scanned PDF are explicitly unsupported. |
| T17 | Brand priority, explicit template override, font mapping, saved effective snapshot. | Brand API/preview/export tests; real upload→generate→export demo. Failed regeneration retry preserves snapshot after original project and brand removal. |
| T18 | Brief/context and supported narrative conclusions. | Narrative guards and deterministic takeaway tests; manual review of trend/category/share conclusions: correct observations, no invented causation. Live model quality untested because local configuration has no model key. |
| T19 | Current draft, pinned brief, scope, locks, reviewed apply/reject and stale rejection. | Proposal/owner/source/version/cancellation API tests; [browser proposal interaction](../examples/outputs/evidence/assistant-browser-results.json) uses explicitly mocked model/proposal responses; no claim of live-provider quality. |
| T20 | Audit actual expanded geometry and current revision. | Long labels/fonts/table/axis regressions; final 12-month line has separated endpoint labels; A/B/C example audit has zero errors. Actual demo retains only informational unresolved brand guidance. |
| T21 | Editable and inspected exports. | [Real downloaded artifacts](../examples/outputs/acceptance/export-review.json), all three PDF pages viewed, 27 HTML slides checked offline, native PPTX charts/workbooks reopened. PowerPoint repair-warning and Office raster checks not possible locally. |
| T22 | Faithful or explicitly unavailable template covers. | Renderer/embedded/single-image provenance and cache tests; arbitrary media rejected. Local renderer absent, UI communicates fallback instead of inventing a cover. |
| T23 | Ownership for projects/jobs/materials/analysis/brand/proposals and browser drafts. | Cross-owner API tests plus actual two-account same-browser draft test. No production storage used by QA. |
| T24 | Preserve identity, motion and native editing surfaces; measure rather than speculate. | [Performance/accessibility report](BROWSER_PERFORMANCE_ACCESSIBILITY.md): light/dark, 320/390/768/1440, reflow equivalent to 200%, keyboard, reduced motion, unavailable WebGL, cleanup, 20-slide fixture. Software-WebGL Home startup remains a measured limitation. |

## Focused runs in this implementation

All commands run from target A's `backend` with its `.venv/Scripts/python.exe`.
Fixtures redirect SQLite and storage to temporary directories. LLM answers are
controlled test doubles; external credentials are disabled by conftest.
Overlapping suites are not summed into an artificial total.

- `-m pytest tests/test_assistant.py tests/test_assistant_proposals.py tests/test_project_concurrency.py tests/test_ai_operations.py -q` → 44 passed, 32.39 s (before the subsequent two lifecycle/analytics checks).
- `-m pytest tests/test_assistant_proposals.py tests/test_project_concurrency.py -q` → 22 passed, 17.39 s (includes expiry scrubbing and owner deletion).
- `-m pytest tests/test_hardening.py tests/test_workflow.py tests/test_experience.py -q` → 40 passed, 1 skipped, 40.42 s.
- `-m pytest tests/test_template_preview.py tests/test_http_assets.py tests/test_catalog_loading.py tests/test_assistant.py tests/test_ai_operations.py -q` → 58 passed, 30.49 s.
- `-m pytest tests/test_narrative.py tests/test_iconamoon.py tests/test_visual_generation.py tests/test_assistant.py tests/test_assistant_proposals.py -q` → 81 passed, 27.70 s (latest narrative guards and ordinary-edit no-op behavior included).
- `-m pytest tests/test_material_packet_atomicity.py -q` → 4 passed, 3.58 s. Verifies source ID/text receipts, all-or-nothing parsing, storage failure rollback preserving pre-existing deduplicated resources, and account ownership.
- `-m pytest tests/test_live_generation.py tests/test_narrative.py -q` → 10 passed, 2.32 s. Corrects an over-strict numeric guard for the navigation-only title `Slide 0` while retaining the unsupported fact/quote checks.

From target A's `frontend`:

- `node --test tests/recovery-runtime.test.mjs tests/api-runtime.test.mjs` → 15 passed, 0 failed, 0 skipped (latest 0.53 s). Executes the actual TypeScript modules after transpilation. Covers duplicate tabs, per-account isolation, failed archive preservation, repeated-refresh deduplication, recovery limits, removed source contributions, malformed cached state, structured error bodies, authentication events, cancellation, invalid success JSON and incorrect download formats.
- `node node_modules/typescript/bin/tsc --noEmit` → passed after these storage/client changes.

Draft working state is session-scoped, with immutable per-document durable
recovery snapshots. At most eight distinct snapshots per account/draft name are
retained in ordinary sequential writes; unchanged refreshes deduplicate rather
than consuming this bound. Another tab's distinct unsaved contents are never
pruned to free space. If the recovery bound or storage quota is reached, the
current working session remains available and the UI reports that durable
saving failed. Shared identical snapshots may remain after one tab saves or
clears: this preserves the other duplicate tab's recovery. The literal session
`null` prevents the cleared tab from automatically restoring an older snapshot.
Runtime checks do not replace the root's two-account browser acceptance.

The first preview refinement run caught a one-pixel rounding loss for an almost
exact 16:9 OOXML size; bounds now use rounded pixels without enlargement and the
follow-up suite passed. The known Starlette/httpx deprecation warning remains.
The final combined changes require the final run record below; no unfinished
check is represented as passing.

## Final combined evidence

- Final backend: **475 passed, 1 skipped, 1 warning, 167.56 s**. Full output: `examples/outputs/evidence/pytest-delivery.log`. The skipped PostgreSQL integration requires a separate `TEST_CLOUD_DATABASE_URL`; no user database was substituted. The warning is the existing Starlette/httpx deprecation.
- Frontend: `pnpm --dir frontend test` → **66 passed, 0 failed**, 0.80 s; `pnpm --dir frontend build` (TypeScript + Vite + precompression) → passed. Final application bundle: `index-DeQiujtN.js`.
- Actual source/state/fault/analytics browser reports are in `examples/outputs/evidence`. All report zero uncaught page errors. Explicit injected faults and the separately mocked assistant proposal scenario are labelled in their reports.
- New current implementation recording: `examples/outputs/acceptance/Deckly-local-demo.webm`, about 65 seconds. Template, brand and three datasets go through actual ASGI handlers, temporary SQLite/storage, real jobs and exporters. No generated API successes are mocked.
- Standalone HTML/PDF A/B/C examples: 27 slides, zero measured clipping and zero audit errors. Native PPTX contents/workbooks checked. Root additionally viewed the actual demonstration PDF's first/middle/last pages.
- The final review found and fixed lost branding on regeneration retry, dropped pending jobs on transient polling errors, inaccessible restored audit drafts, and missing conflict recovery. Relevant new tests and browser scenarios are included; these defects were not hidden behind a successful build.
- An additional deadline test stub accepted `*args` but omitted the production `resources=` keyword. Its timing previously masked the TypeError. The signature now matches the contract; assertions still require timeout failure, retry availability and no partial project.
- Live-provider quality is **not assessed**: the actual local configuration reports demo mode with no configured model key. Controlled provider responses are used in backend contract tests.
- PowerPoint/LibreOffice executables and Docker are unavailable here; no native Office visual or built-container run is claimed. PostgreSQL integration was skipped as explained above.
- Current 8003 process activation is separate from code/build acceptance. Restart requires the pending user decision after automatic approval review blocked an additional test-server launch. No bypass or silent process replacement was used.

Commands were run from target A with `PYTHONPATH=backend`, a temporary `DATABASE_PATH` and `STORAGE_PATH`, and the bundled backend venv. Core final command: `backend/.venv/Scripts/python.exe -m pytest backend/tests -q --disable-warnings --tb=short`. Fixtures disable external provider credentials. The ordinary browser harness is `scripts/qa/record-demo.mjs`; it uses the already running local static site and a separate real ASGI worker without a network listener.

User-facing walkthrough and limitations: [IMPLEMENTATION_REVIEW_RU.md](IMPLEMENTATION_REVIEW_RU.md). Protocol details: [ASSISTANT_PROPOSALS.md](ASSISTANT_PROPOSALS.md).
