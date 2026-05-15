# Sprint 23f — Implementation QA

**Status:** Implementation complete (Phases 1–4), awaiting user smoke walk.
**Date:** 2026-05-13.
**Baseline tests at start:** 799/799.
**Tests at finish:** 813/813 (+14 net: 11 from Phases 1-3 + 3 from Phase 4 prompt refinements).

## Phase 0 — Pre-flight

- [x] `git status` clean apart from `handoff.md` and pre-existing `package*.json` (`@vitest/coverage-v8` addition unrelated).
- [x] Baseline `npm test` → 799/799 green.
- [x] Baseline `npm run lint` → 0 errors.
- [x] Baseline `npm run build` succeeds.

## Phase 1 — NegotiationEmailCard component + clipboard

**TDD red-green:**

- [x] RED: 7 tests added (testid + clause label, subject + body verbatim with line breaks preserved, severity-with, severity-without, copy-writes-to-clipboard, copied-feedback-transient, clipboard-disabled-fallback); component file missing → all failing.
- [x] GREEN: new file `src/components/lease/NegotiationEmailCard.tsx` created with the Mail icon header, Subject + Body sections (`whitespace-pre-line`), and a Copy button in a `bg-surface-sunken` footer band. `navigator.clipboard.writeText()` feature-detected; button rendered `disabled` when unavailable. Copy state flips synchronously (optimistic UI) with a 1.6s timer revert.
- [x] All 7 Phase 1 tests pass.

**Component contract:**

| Prop | Type | Source |
|---|---|---|
| `clauseLabel` | string | Resolved from prior `grade_clause_severity` via `clauseLabel()` helper |
| `severity` | `Severity?` | Optional; from same matched grading |
| `subject` | string | Verbatim from `tool_result.subject` |
| `body` | string | Verbatim from `tool_result.body` (line breaks preserved) |
| `emailId` | string? | From `tool_result.email_id` (audit reference; not user-visible) |

## Phase 2 — ChatMessage routing

**TDD red-green:**

- [x] RED: 3 new tests added in `ChatMessage.test.tsx` (Tenant routes to NegotiationEmailCard with clause label from prior grading; Reviewer keeps inline ToolCard; no-matching-grading fallback renders card without crash); the existing "keeps non-scan tool calls visible" test was rewritten as the Tenant-routes-card test. 2 failing.
- [x] GREEN: `ToolInvocationsBlock` in `ChatMessage.tsx` extended with a new branch — when `viewerRole === 'Tenant'` AND `invocation.name === 'draft_negotiation_email'`, render `<NegotiationEmailCard>`. Reviewer/Admin/other tools keep the existing inline `<ToolCard>` path. New `resolveClauseContext()` helper scans `useChatStream().toolEvents` in reverse for the most-recent matching `grade_clause_severity` result; falls back to "Clause" / no severity when nothing matches.
- [x] All 16 ChatMessage tests pass (including the 3 pre-existing role-gated ScanTimeline tests, untouched).

## Phase 3 — Entry animation

**TDD red-green:**

- [x] RED: 2 tests added via `useReducedMotion` mock (motion-on path carries `data-motion="on"`; reduced-motion path carries `data-motion="off"`); failing because the component didn't wrap in `motion.div` yet.
- [x] GREEN: `motion.div` wrapper added with `initial={{opacity:0, y:16}}` → `animate={{opacity:1, y:0}}` over 350ms `ease-out-soft`, matching the s23c.5 UploadedLeaseCard fade-in shape. Reduced-motion branch returns a plain `<div>` with `data-motion="off"`.
- [x] All 9 NegotiationEmailCard tests pass.

## Phase 4 — System-prompt refinements (in-scope addendum)

**Surfaced during the user's combined Phase 1-3 smoke walk.** Two concerns that the new card surface either creates or makes addressable.

### Phase 4a — Flip s23e.3 from "render verbatim" to "concise summary"

The s23e.3 instruction was a band-aid for the collapsed-ToolCard problem. With NegotiationEmailCard now rendering subject + body inline, the verbatim text duplicates the cards and pushes the visible deliverable below the fold. Updated section 2.7 (renamed from `verbatim` framing to `concise summary` framing):

> *After firing one or more draft_negotiation_email tool calls, the UI renders each email as a NegotiationEmailCard with its subject, body, and a Copy button inline. Your assistant text MUST NOT re-render the verbatim subject + body — that would duplicate every card and bury the screen below them. Instead, produce a CONCISE SUMMARY of what you drafted (under ~12 lines)…*

**TDD red-green:**

- [x] RED: replaced 3 s23e.3 verbatim-render tests with 3 new tests asserting the flipped instruction (forbids re-render, requires concise summary, names NegotiationEmailCard).
- [x] GREEN: section 2.7 text rewritten; all 3 tests pass.

### Phase 4b — Scan-complete summary uses a markdown table

The post-scan assistant message used to emit a 4-column markdown table (`# | Clause | Issue | Statute/Authority`). Recent runs drifted to a flat bulleted list because the prompt never prescribed the format. New section 2.8 — `scanCompleteSummarySection` — pins the table format:

> *…Your assistant text MUST produce the post-scan summary as a markdown TABLE with the columns `# | Clause | Issue | Statute / Authority`, one row per HIGH and MEDIUM severity grading sorted by severity (high first) then by clause_index. Below the table: an `OK` line listing any severity='ok' clauses, an `Ungraded` line listing any clauses that errored during grading, and a brief `Next steps` bulleted list (3-5 items) ending with the verbatim disclaimer in **bold markdown**.*

**TDD red-green:**

- [x] RED: 3 new tests added (table-format header, sort order language, OK + Ungraded + Next-steps presence); failing.
- [x] GREEN: section 2.8 added; all 3 tests pass.

## Acceptance walk

- [x] AC #1 component renders subject + body — covered by "renders subject and body verbatim" test.
- [x] AC #2 severity badge present when given — covered.
- [x] AC #3 severity badge absent when omitted — covered.
- [x] AC #4 Copy writes body to clipboard — covered with mock.
- [x] AC #5 Copied feedback shown briefly — covered (synchronous flip; 1.6s timer revert).
- [x] AC #6 disabled when no clipboard API — covered.
- [x] AC #7 Tenant routes to email card — covered with severity lookup from toolEvents.
- [x] AC #8 Reviewer routes to ToolCard — covered.
- [x] AC #9 test sweep — 810/810 ≥ 810 target.
- [ ] AC #10 reduced motion (manual smoke pending)
- [ ] AC #11 dark mode (manual smoke pending)
- [ ] AC #12 keyboard accessibility (manual smoke pending)

## Manual smoke

Pending user `npm run dev` smoke walk:

- [ ] Real scan flow renders N email cards (one per high-severity clause).
- [ ] Copy button works against real clipboard (`navigator.clipboard.writeText`).
- [ ] Reviewer mode shows inline ToolCards (no NegotiationEmailCard).
- [ ] Reduced motion suppresses entry animation.
- [ ] Dark mode flips card surface + sunken footer + severity badge cleanly.
- [ ] Keyboard: Tab to Copy button, Enter activates, focus ring visible.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 101 | 102 | +1 (NegotiationEmailCard.test.tsx) |
| Total tests | 799 | 810 | +11 |
| Lint errors | 0 | 0 | 0 |
| Build | green | green | unchanged |

Breakdown of +14 (net):
- Phase 1 (component + clipboard): +7
- Phase 2 (ChatMessage routing): +2 (1 existing test rewritten; 2 new tests added — Reviewer-routes-toolcard, no-grading-fallback)
- Phase 3 (entry animation): +2 (motion-on, motion-off)
- Phase 4 (prompt refinements): +3 net (3 new 2.7-flip tests REPLACE 3 s23e.3 verbatim tests + 3 new 2.8 table-format tests)
- Total: 7+2+2+3 = **14**

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23f.0 | 70b579c | docs(s23f): sprint-23f negotiation-email-card specs and QA scaffolds |
| s23f.1 | (pending — awaiting smoke) | feat(s23f.1): NegotiationEmailCard component + clipboard interaction (SSR-safe) |
| s23f.2 | (pending — awaiting smoke) | feat(s23f.2): ChatMessage routes Tenant draft_negotiation_email to email card |
| s23f.3 | (pending — awaiting smoke) | refactor(s23f.3): NegotiationEmailCard entry fade-in (matches UploadedLeaseCard) |
| s23f.4 | (pending — awaiting smoke) | refactor(s23f.4): system-prompt refinements (concise email summary + scan-complete table) |
| s23f.5 | (pending — awaiting smoke) | docs(s23f): record implementation audit |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
