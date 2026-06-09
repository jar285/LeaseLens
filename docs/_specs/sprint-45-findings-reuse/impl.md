# Sprint 45 — implementation QA notes

## Findings-reuse (2026-06-09)

**What changed (13 files)**
- [src/lib/db/schema.ts](../../../src/lib/db/schema.ts) — `clauses` gains 5 nullable grading columns.
- [src/lib/db/migrate.ts](../../../src/lib/db/migrate.ts) — idempotent, race-tolerant `ADD COLUMN` block.
- [src/lib/lease/queries.ts](../../../src/lib/lease/queries.ts) — `ClauseRow` extended; `StoredGrading` +
  `listGradings` added (graded clauses only, high-severity first; local severity rank).
- [src/lib/tools/lease-tools.ts](../../../src/lib/tools/lease-tools.ts) — `grade_clause_severity` persists the
  FULL grading + `graded_at` (after validation); new `createGetLeaseFindingsTool` (read-only, no model/corpus);
  already-graded short-circuit with `force_regrade` opt-out.
- [src/lib/tools/create-registry.ts](../../../src/lib/tools/create-registry.ts) — registers `get_lease_findings`.
- [src/lib/chat/system-prompt.ts](../../../src/lib/chat/system-prompt.ts) — `graded_count` on
  `ActiveLeaseSummary`; graded-aware awareness branch; reuse section + manifest point at `get_lease_findings`.
- [src/app/api/chat/route.ts](../../../src/app/api/chat/route.ts) — threads `graded_count` into the prompt.

**Tests added (+15, TDD red→green)**
- `migrate.test.ts` ×3 (adds columns to a pre-S45 table / idempotent / fresh schema no-op).
- `lease-tools.test.ts` — persistence ×2 (full grading persisted; rejected grading leaves `graded_at` NULL),
  `get_lease_findings` ×3 (no model/corpus call; high-severity-first + ungraded omitted; ownership), short-circuit
  ×1 (no 2nd Anthropic call; `force_regrade` recomputes).
- `system-prompt.test.ts` ×4 (graded → use `get_lease_findings`; ungraded keeps "scan it"; manifest; reuse).
- `create-registry.test.ts` ×2 (registry exposes `get_lease_findings` to every role).
- Updated the 7→8 tool-surface assertions in `registry.test.ts` + `mcp/leaselens-server.test.ts`.

**Gate results**
- `npm run lint` clean (337 files); `npm run typecheck` clean; `npm test` — **1275 passed, 146 files** (+15);
  `npm run build` green.

**Verification — Playwright + real-model**
- **Playwright e2e: 30/30 green** (regression). The schema/tool/prompt/route changes break no existing flow —
  incl. T1 (upload→scan tool flow), T11 (seeded gradings render), T15 (clear-chat preserves findings), T18
  (reduced-motion). e2e runs against the mock, so it confirms *no regression* but not real-model tool choice.
- **Real-model behavioral checks** (clean in-memory DB, real Anthropic, single calls — no agentic loop):
  - **A — graded lease + "explain the highest-severity finding"** → model calls **`get_lease_findings`**
    (`stop_reason: tool_use`). The fix: it reads stored findings, no re-scan.
  - **B — ungraded lease, mid-scan (extract_clauses result in history)** → model calls
    **`grade_clause_severity` ×6** (one per clause). Proves the prompt changes did NOT regress the scan's
    extract→grade progression (it grades, it does not re-extract).
- **Live full-scan note (not this change):** a live real-model auto-scan stalled — 7 `extract_clauses` then a
  hung `messages.create` (~6 min, no completion) — on a heavily-polluted dev DB (4965 accrued clauses) + the
  real API. Attributed to the **unbounded Anthropic call with no timeout** (a known deferred Nygard item), not
  this fix: the agentic loop + Anthropic call are untouched, and check B confirms the tool-choice progression is
  correct. Recommend a clean-DB scan re-test + the deferred timeout/retry work.
- **Screenshot** (`s45-01-landing.png`, local artifact, not committed): the app boots with the new schema and
  renders Mode B (parser workspace, 15-clause list, scan lifecycle) cleanly — the migration applies on boot.

**Decisive instrument:** the `tool_calls` table (Sprint 44) recorded the tool sequence end-to-end; combined
with the controlled A/B real-model calls, it confirms graded → `get_lease_findings`, ungraded → grade.

---

## Post-review fix — backfill graded_at (2026-06-09)

**Bug found in live use (user report).** Clicking a quick action ("Explain highest-risk issue") still showed a
full re-scan. Diagnosis (real model + the actual dev DB): the model correctly *also* calls `get_lease_findings`,
but it ran the whole scan first because the turn hit the **ungraded** prompt branch (`graded_count = 0`).
Root cause: I keyed "is this lease graded?" off the NEW `graded_at` column — but **450 clauses in the dev DB
were graded by pre-Sprint-45 code** (`severity` set, `graded_at` NULL), so they read as *ungraded*. A real
gap in the fix. (Reproduced the inverse cleanly: with a genuinely-graded lease + the full scan history in
context, the model calls only `get_lease_findings` — so the prompt is right; the signal was wrong.)

**Fix:** `migrate.ts` now **backfills `graded_at = created_at` for every clause with `severity IS NOT NULL AND
graded_at IS NULL`** — `severity` is the long-standing graded sentinel (Sprint 24.1) set by both old and new
grades. Idempotent (matches 0 rows once backfilled; a plain `UPDATE`, race-safe). Regression test in
`migrate.test.ts`: a severity-set/`graded_at`-NULL clause is backfilled; a never-graded clause stays NULL;
re-running leaves the value unchanged.

**Re-verified:** `npm test` — **1276 passed**; lint + typecheck clean. Applied `migrate` to the real dev DB:
severity-set-but-`graded_at`-NULL went **450 → 0**, all **480** graded clauses now carry `graded_at`,
idempotent on re-run. So an already-graded lease (old or new grades) now hits the graded branch → no spurious
re-scan.

**Separate follow-up (NOT this fix):** the user's transcripts also show the scan frequently **stopping after
extract** ("Extracted. Let me know which ones to grade.") and a full-scan **hang** I hit live. When the scan
never grades, the lease is genuinely ungraded and the next finding-question does the first grade (looks like a
re-scan). This is a pre-existing real-model **scan-reliability** problem (the agentic loop / scan prompt / the
unbounded `messages.create` with no timeout — the deferred Nygard item), independent of findings-reuse. Worth
its own sprint.
