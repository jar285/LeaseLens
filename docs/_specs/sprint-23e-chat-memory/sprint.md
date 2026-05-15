# Sprint 23e — Chat Memory — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 2. Both fixes are small and additive; TDD-driven.

---

## Phase 0 — Pre-flight

1. `git status` shows working tree clean apart from `handoff.md` (untracked) and pre-existing `package.json` / `package-lock.json` modifications (unrelated `@vitest/coverage-v8` addition).
2. Baseline: `npm test` (expect 790/790), `npm run lint` (0 errors), `npm run build` (green).
3. Re-read [`src/lib/chat/context-window.ts`](../../../src/lib/chat/context-window.ts), [`src/lib/chat/context-window.test.ts`](../../../src/lib/chat/context-window.test.ts), [`src/lib/chat/system-prompt.ts`](../../../src/lib/chat/system-prompt.ts), [`src/lib/chat/system-prompt.test.ts`](../../../src/lib/chat/system-prompt.test.ts) end-to-end.

## Phase 1 — Raise `MAX_MESSAGES` to 60

**Files touched:** [`src/lib/chat/context-window.ts`](../../../src/lib/chat/context-window.ts), [`src/lib/chat/context-window.test.ts`](../../../src/lib/chat/context-window.test.ts).

**TDD red-green:**

1. RED — add a new `describe('Sprint 23e — full-scan survival', …)` block to `context-window.test.ts`:
   - Construct a 34-message scan transcript: 1 user message + 1 assistant tool_use (extract_clauses) + 1 user tool_result (clause list of 15 clauses) + 15 × {assistant tool_use grade_clause_severity, user tool_result} + 1 assistant text summary.
   - Append a 35th user message ("Draft negotiation emails for the high-severity clauses").
   - Call `buildContextWindow(transcript)`.
   - Assert: the returned `contextMessages` contains **at least 15** `tool_result` blocks (count by inspecting each user-message's content array for blocks of `type === 'tool_result'`).
   - Assert: the returned `contextMessages` contains **at least 15** `tool_use` blocks of `name === 'grade_clause_severity'`.
   - Assert: `trimmed === false` (window is large enough to fit the whole scan).
2. RED — run; expect a failure because the current `MAX_MESSAGES = 20` strips most of the scan.
3. GREEN — change `MAX_MESSAGES` constant in `context-window.ts` from `20` to `60`. Update the surrounding code comment to note the new size and the rationale (one full scan + 3-4 follow-up turns).
4. REFACTOR — run the full `context-window.test.ts` suite; the new survival test passes and existing alternation + trim tests still pass.

**Verification:** `npm test src/lib/chat/context-window.test.ts` green.

## Phase 2 — Add "prefer prior tool results" paragraph to system prompt

**Files touched:** [`src/lib/chat/system-prompt.ts`](../../../src/lib/chat/system-prompt.ts), [`src/lib/chat/system-prompt.test.ts`](../../../src/lib/chat/system-prompt.test.ts).

**TDD red-green:**

1. RED — add a new test case to `system-prompt.test.ts`:
   - Call `buildSystemPrompt({ role: 'Tenant', activeLease: { id: 'l1', filename: 'x.pdf', page_count: 2, clause_count: 15 } })`.
   - Assert the returned string contains a phrase matching `/reuse.*prior.*tool_result|reuse.*prior.*results/i`.
   - Assert it contains a re-scan carve-out matching `/(re-scan|scan again|lease changed|user (?:asks|explicitly))/i`.
2. RED — run; expect failure (the paragraph doesn't exist yet).
3. GREEN — insert a new entry in the `sections` array in `system-prompt.ts`, immediately AFTER `leaseAwarenessSection` (section 2.5), with content:

   > *When the conversation history already contains `grade_clause_severity` or `extract_clauses` tool_result blocks from earlier turns, REUSE those results to answer follow-up questions (ranking, summarising, drafting emails for specific clauses). Do NOT re-run the scan tools on follow-up turns unless the user explicitly asks for a re-scan, the lease changed, or a needed clause is missing from the prior results. When drafting emails or ranking by severity, cite the prior grading's `reasoning` and `statute_citation` directly.*

4. REFACTOR — run the full `system-prompt.test.ts` suite; the new test passes and existing tests (role, workspace, date, RAG block) still pass.

**Verification:** `npm test src/lib/chat/system-prompt.test.ts` green.

## Phase 3 — Full-suite + lint + build sweep

1. `npm test && npm run typecheck && npm run lint && npm run build` — all green.
2. Total tests: 790 + 2 new = ≥ 792.
3. **HALT for user smoke walk via `npm run dev`** before any implementation commit. Run the 4-turn scenario per spec §4 manual acceptance.

## Phase 4 — Commit sequence

After user approval, commit in granular order (NOT pushed):

```txt
docs(s23e): sprint-23e chat-memory specs and QA scaffolds
refactor(s23e.1): raise MAX_MESSAGES from 20 to 60 in context window
refactor(s23e.2): system prompt prefers prior tool results on follow-ups
test(s23e.3): pin tool-history survival across a full-scan turn
docs(s23e): record implementation audit in impl-qa.md
```

Note: the survival test is bundled with the `refactor(s23e.1)` commit as the TDD red-green pair — `test(s23e.3)` is reserved if a *separate* survival assertion needs to ship independently (e.g., an integration test). If the Phase 1 unit test is sufficient, fold s23e.3 into s23e.1 and the commit count drops to 4.

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/lib/chat/context-window.ts` | One-line constant + comment |
| 1 | `src/lib/chat/context-window.test.ts` | New "full-scan survival" test |
| 2 | `src/lib/chat/system-prompt.ts` | New section in `sections` array |
| 2 | `src/lib/chat/system-prompt.test.ts` | New assertion |
| Final | `docs/_specs/sprint-23e-chat-memory/impl-qa.md` | Implementation audit |

## Test impact

- Expected to grow: +1 context-window survival test, +1 system-prompt paragraph assertion. Net +2 tests.
- No deletions.
- After sprint-23e: expected total ≥ 792.
