# Sprint 45 — Chat reads stored findings instead of re-scanning

> Branch: `feature/s45-findings-reuse` (off `feature/fab-menu`, so it stays out of the open Sprint 43/44 PR).
> Methodology: spec → spec-QA → TDD red→green → gate sweep (lint/typecheck/test/build) → live verification.

## Goal
Stop the FAB chat from re-running the entire lease scan when the user asks a follow-up about findings
("explain the highest-severity finding", "rank the red flags", "draft an email about X"). The findings were
already computed by the auto-scan; the chat should **read** them, not recompute them.

## Why now — root cause (verified in code)
A follow-up that should read findings instead triggers a full `extract_clauses` + `grade_clause_severity` ×N
re-scan (a 48–56s round-trip per the live repro). Three compounding causes:

1. **The prompt told the model to scan every turn.** The active-lease awareness line
   (`src/lib/chat/system-prompt.ts`) *unconditionally* said the lease was "NOT YET graded … you still need to
   call extract_clauses … and grade_clause_severity once per clause" — even after a completed scan.
2. **The real gradings were trimmed from context.** History (incl. prior tool_results) is loaded
   (`src/app/api/chat/route.ts`) then trimmed to `MAX_CHARS=40_000` / `MAX_MESSAGES=60`
   (`src/lib/chat/context-window.ts`). A ~17-clause scan — each grading carrying severity + statute_citation +
   chunk_id + reasoning + recommended_action — overflows that, so the gradings drop out before the follow-up.
3. **No durable place to read findings.** `grade_clause_severity` persisted ONLY `severity` to `clauses`; the
   reasoning/citation lived only in the (trimmed) conversation history. Trimmed → nothing to reuse, no fetch
   path → re-scan.

## Target user
The NJ **tenant** mid-conversation in the FAB drawer. After the scan they ask plain-English questions about
their findings; today each question stalls ~50s on a redundant re-scan and re-churns the right pane. The fix
makes follow-ups instant and keeps the parser-first surface stable. Secondary: the **operator** (every
follow-up otherwise costs N extra model calls + corpus retrievals).

## Governing power-words (per `power-words.md` acceptance standard)
| Power word | Decision it governs | Verification |
|---|---|---|
| **Ilya Grigorik** (perf — "designed, not guessed") | Eliminate the 48–56s re-scan + redundant LLM/corpus calls by reading stored findings. | A finding follow-up makes ZERO `extract_clauses`/`grade_clause_severity` calls — one fast `get_lease_findings`. |
| **React Team / Dan Abramov** (state ownership) | Findings get ONE durable home (the `clauses` table), not ephemeral trimmed context. | `listGradings` returns the gradings regardless of context trimming OR which conversation ran the scan. |
| **Arnaud Lauret** (API design) | `get_lease_findings` is a clear, typed read contract whose description steers read-not-recompute. | Returns `{lease_id,total_clauses,graded_count,findings[]}`; registered + reachable per role. |
| **Kent C. Dodds** (test behavior) | Regression tests assert the no-re-scan behavior, not internals. | A graded clause re-grades without a second Anthropic call; `get_lease_findings` returns stored gradings with no model/corpus call. |
| **Charity Majors / Liz Fong-Jones** (observability) — *supporting* | Verify via Sprint 44 `tool_calls`/logs (read tool, no grader) rather than guessing. | Live: `tool_calls` shows `get_lease_findings`, no `grade_clause_severity`, on a finding turn. |
| **Guillermo Rauch / Vercel** (safe migration) — *supporting* | 5-column add is idempotent + race-tolerant via the existing `columnExists` pattern (SQLite has no `ADD COLUMN IF NOT EXISTS`). | `migrate.test.ts`: columns added to a pre-existing table; idempotent; fresh schema is a no-op. |

Avoided as decorative: Martin Fowler / Uncle Bob (the *how* of refactoring), Martin Kleppmann (data-systems
tradeoffs), Roy Fielding (REST — this is a read-only tool).

## Approach (durable findings store + cheap read tool)
1. **Schema** — `clauses` gains `statute_citation`, `chunk_id`, `reasoning`, `recommended_action`, `graded_at`
   (all nullable; `graded_at` is the "has been graded" sentinel).
2. **Migration** — idempotent, race-tolerant `ADD COLUMN` block (Sprint 44B pattern).
3. **Queries** — extend `ClauseRow`; add `StoredGrading` + `listGradings(db, leaseId, workspaceId)` (graded
   clauses only, ordered high-severity first; local severity rank — server must not import the client grading
   helper).
4. **Persist full grading** — `grade_clause_severity` widens its single `UPDATE` to write all five fields +
   `graded_at`, still AFTER validation (a rejected citation never poisons the row).
5. **New read tool** — `get_lease_findings` (no model/corpus calls) returns the stored findings; registered in
   `create-registry.ts`.
6. **System prompt** — awareness line branches on `graded_count` (graded → use `get_lease_findings`); reuse
   section + manifest point at the read tool. `graded_count` threaded through the chat route.
7. **Short-circuit** — `grade_clause_severity` returns the stored grading if already graded (no Anthropic);
   `force_regrade:true` recomputes for an explicit re-scan.

## Variance (allowed to change without re-QA)
The tool's exact response shape/field names, the read-tool description wording, the prompt phrasing, and the
severity-rank ordering details. Frozen: findings persist durably; the read tool does no model/corpus calls; a
rejected grading never sets `graded_at`.

## Invariants
- A failed/ungrounded grading leaves `graded_at` NULL (no poisoned findings).
- `get_lease_findings` is read-only (no Anthropic/corpus, no writes, no audit row).
- Migration idempotent + race-tolerant; additive (no new dependency).
- Ownership-scoped (a tenant can't read another tenant's lease findings).
- Explicit re-scan still works (`force_regrade`).

## Risks
- **MED — model still re-scans despite the prompt.** Mitigation: the short-circuit makes any stray re-grade a
  cheap DB read; `get_lease_findings` is registered + steered first.
- **LOW — migration race on parallel `next build` workers.** Mitigation: the swallow-"duplicate column name"
  try/catch (Sprint 44B).
- **LOW — stale findings if a lease is re-uploaded.** Out of scope: re-upload replaces the lease/clauses rows;
  `force_regrade` + the existing Replace flow cover deliberate re-scans.

## Definition of Done
TDD red→green per slice; lint + typecheck + full test + build green; the no-re-scan behavior covered by
behavioral tests; live verification (real model) that a finding follow-up calls `get_lease_findings` and not the
scan tools; QA note in `impl.md`.
