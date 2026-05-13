# Sprint 23e — Chat Memory: Preserve Tool History on Follow-Up Turns

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Predecessors:** [sprint-23a](../sprint-23a-ui-foundation/spec.md), [sprint-23b](../sprint-23b-document-dock/spec.md), [sprint-23c](../sprint-23c-conversation-workspace/spec.md), [sprint-23d](../sprint-23d-risk-radar/spec.md) (all committed).
**Origin:** Bug surfaced during the user's sprint-23d smoke walk. See the [hotfix plan](/Users/franklind.rosarioabreu/.claude/plans/please-review-the-codebase-cosmic-crown.md) for the original investigation.

---

## 1. Problem

In the user's `npm run dev` smoke walk after sprint-23d, the model lost its memory of a completed scan across follow-up turns in the same conversation:

1. Standard scan runs. 15 clauses graded. Right pane shows the red flags.
2. User asks *"Rank the red flags by which one I should push back on first."* The Editorial Assistant **re-runs the entire scan** (ScanTimeline reappears) before answering, then produces a correct top-3 ranking. Wasteful but functional.
3. User asks *"Draft polished negotiation emails for each high-severity clause you just graded."* The model replies: **"I don't have a record of clause gradings from this conversation yet. To draft negotiation emails grounded in specific concerns, I need to: Extract the clauses from your lease first…"**

The model has genuinely lost the structured tool history.

### Root cause (verified by code trace, not speculation)

**Issue 1 (primary) — `MAX_MESSAGES = 20` is too small for tool-heavy turns.** A single standard scan produces ~34 DB-message rows (1 user + 1 extract_clauses tool_use + 1 tool_result + 30 grade_clause_severity tool_use/tool_result blocks + 1 final summary). [`src/lib/chat/context-window.ts:16`](../../../src/lib/chat/context-window.ts#L16) caps history at 20 messages. When the user sends turn-2, `trimToLimits` ([:101-140](../../../src/lib/chat/context-window.ts#L101-L140)) slices off the first 15 messages, then the orphan-drop loop ([:130-137](../../../src/lib/chat/context-window.ts#L130-L137)) keeps trimming until the first message is a clean user start. In practice this strips most of the original scan's tool_result blocks. By turn-3, almost no scan history remains.

**Issue 2 (secondary) — system prompt pushes "CALL the tools" without "REUSE the prior results."** [`src/lib/chat/system-prompt.ts:108`](../../../src/lib/chat/system-prompt.ts#L108) instructs *"When the user asks about 'this lease' …, CALL extract_clauses or grade_clause_severity directly."* There is no instruction telling the model to prefer prior tool results when they're present in history. Even when Issue 1 is fixed and the results are in context, the prompt's framing still nudges the model toward re-invocation.

Both issues need addressing. Fixing only the context window leaves the model still re-running tools wastefully on turn-2 (the data is there, but the prompt doesn't tell it to use the data). Fixing only the prompt is useless when the data has been physically trimmed out of context.

This sprint is NOT a visual change and does NOT touch any sprint-23a/b/c/d surface. It targets the chat pipeline's memory layer.

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen.
2. No new runtime dependencies.
3. `useReducedMotion()` gate is non-negotiable.
4. Severity is communicated by text + icon/shape + layout, never by color alone.
5. Disclaimer renders bold at the end of grading messages.
6. Synthetic scan-summary suppression preserved.
7. PDF focus dialog sizing preserved.
8. Verbatim citation validation in `grade_clause_severity` not weakened.
9. Role-gated progressive disclosure preserved.
10. Test count never decreases.
11. No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.
12. WCAG AA contrast in both color schemes; visible focus states; 44×44 touch targets; respect `prefers-reduced-motion`.

Sprint-23e-specific invariants:

13. **No API-shape change.** [`src/app/api/chat/route.ts`](../../../src/app/api/chat/route.ts) is not modified. The route already threads tool blocks correctly; the fix lives in the libraries the route calls.
14. **No DB schema change.** The `messages` table already stores tool_use + tool_result blocks as JSON. No migration needed.
15. **No tool contract change.** `extract_clauses`, `grade_clause_severity`, `search_corpus`, `draft_negotiation_email` all keep their current signatures and validators.
16. **`MAX_CHARS = 40_000` stays.** The real safety net for runaway memory is unchanged; only `MAX_MESSAGES` shifts. A token-budget overrun would still trigger char-based trimming first in pathological cases.
17. **`isOrphanLeadingToolResult` orphan-drop logic preserved.** Anthropic's "tool_result must follow tool_use" requirement remains protected.
18. **Re-scan on explicit user request still works.** If the user says "re-scan the lease" or "scan again" or "extract clauses again", the model should re-run the tools. The new prompt instruction carves out this exception.

---

## 3. Design system

### 3a. Token consumers

None. Sprint-23e doesn't touch the visual layer.

### 3b. Component refactor scope

Two source files, two test files. No component changes.

| File | Path | Phase | What changes |
|---|---|---|---|
| `context-window.ts` | [src/lib/chat/context-window.ts](../../../src/lib/chat/context-window.ts) | 1 | `MAX_MESSAGES: 20 → 60`. Single constant change. Comment update explaining why. |
| `context-window.test.ts` | [src/lib/chat/context-window.test.ts](../../../src/lib/chat/context-window.test.ts) | 1 | New test case: construct a 34-message scan transcript + 35th user turn; assert all 15 `grade_clause_severity` tool_result blocks survive the trim. |
| `system-prompt.ts` | [src/lib/chat/system-prompt.ts](../../../src/lib/chat/system-prompt.ts) | 2 | Insert a new "prefer prior tool results" paragraph as section 2.6 in the `sections` array, immediately after the existing lease-awareness section (2.5). |
| `system-prompt.test.ts` | [src/lib/chat/system-prompt.test.ts](../../../src/lib/chat/system-prompt.test.ts) | 2 | New assertion: the new paragraph appears in the rendered prompt. |

### 3c. State coverage matrix (chat pipeline behavior)

| State | Trigger | Expected behavior |
|---|---|---|
| First turn (no prior scan) | User says "run the scan" or "review my lease" | Model calls `extract_clauses` then `grade_clause_severity` ×N (existing behavior, unchanged) |
| Follow-up turn after scan completed | User asks "rank these red flags", "draft emails for the high-severity ones", "what's the most concerning?", etc. | Model REUSES prior `grade_clause_severity` tool_result blocks; does NOT re-call the scan tools; cites prior reasoning + statute_citation in its response |
| Explicit re-scan request | User says "scan again", "re-extract the clauses", "the lease changed", "run a fresh scan" | Model CALLS `extract_clauses` and `grade_clause_severity` again (carve-out in the new prompt paragraph) |
| New lease uploaded | A different lease is bound to the conversation | Existing recent-upload fallback continues to work |

### 3d. Acceptance walk per phase

Per-phase definitions of done live in [sprint.md](./sprint.md).

---

## 4. Acceptance criteria

### Automated

1. **AC #1 — `MAX_MESSAGES = 60`.** Asserted via inspection of the source constant.
2. **AC #2 — Full-scan-survival test.** Build a 34-message scan transcript + a 35th user follow-up message. `buildContextWindow` returns a window that includes **all 15** `grade_clause_severity` tool_result blocks (verified by counting `tool_result` blocks across the merged content arrays).
3. **AC #3 — System prompt mentions reusing prior tool results.** The rendered system prompt (with `activeLease` set) contains a phrase matching `/reuse.*prior.*tool_result/i` or equivalent.
4. **AC #4 — System prompt carves out re-scan exception.** The same paragraph contains a phrase matching `/(re-scan|scan again|lease changed|user explicitly asks)/i`.
5. **AC #5 — Test sweep.** `npm test` ≥ 790 + 2 new = 792; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.
6. **AC #6 — Existing context-window tests unchanged.** The existing alternation + trim tests still pass with the bumped `MAX_MESSAGES`.

### Manual (the load-bearing check — reproduces the original bug)

1. `npm run dev`, open `http://localhost:3000/`.
2. Upload `src/corpus/sample-lease/sample-nj-residential-lease.pdf`.
3. Click "Run standard scan" on the synthetic intro chip. Wait for full scan completion (15 clauses graded; right pane shows the red flags).
4. **Turn 2:** Ask *"Rank the red flags by which one I should push back on first."* — confirm the assistant answers **without** re-running the scan tools. ScanTimeline does NOT re-appear in the new assistant message.
5. **Turn 3:** Ask *"Draft polished negotiation emails for each high-severity clause."* — confirm the assistant calls `draft_negotiation_email` once per high-severity clause; the emails reference the prior grading's `reasoning` and `statute_citation`. The model must **not** say "I don't have a record of clause gradings".
6. **Turn 4 (regression-check):** Ask *"What's the strongest negotiation point overall?"* — confirm a coherent answer that references specific prior gradings, no re-extraction.
7. **Turn 5 (re-scan carve-out):** Ask *"Scan the lease again — I want a fresh pass."* — confirm the model DOES call `extract_clauses` + `grade_clause_severity` (the carve-out works).

---

## 5. Out of scope

- Any visual change.
- Anthropic API request-shape changes — the route already threads tool blocks correctly.
- DB schema / migrations.
- Tool contract changes (`grade_clause_severity` validator, etc.).
- Corpus, classifier, or grading-logic changes.
- Summary-window compaction (e.g., compressing tool_results older than N turns into a synopsis block). Future sprint if needed.
- Re-architecting `buildContextWindow` or `normalizeAlternation`.
- Replacing `motion` library, Tailwind, or any other dependency.
- Conversation lifecycle / archival / pruning logic.

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes. The Anthropic API request body changes only in the volume of history it carries.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged.
- **§6 simplicity:** the fix is two additive changes: a constant and a paragraph. Both have explicit tests. No new abstractions, no new modules.
- **§7 spec-first:** this spec ships before any code edits.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** no library API changes.

---

## 7. Cross-references

- Origin: hotfix plan at `/Users/franklind.rosarioabreu/.claude/plans/please-review-the-codebase-cosmic-crown.md`.
- Predecessors: [sprint-23a](../sprint-23a-ui-foundation/spec.md), [sprint-23b](../sprint-23b-document-dock/spec.md), [sprint-23c](../sprint-23c-conversation-workspace/spec.md), [sprint-23d](../sprint-23d-risk-radar/spec.md).
- Downstream: none. This is the final sprint of the 23-series.

---

**End of spec.**
