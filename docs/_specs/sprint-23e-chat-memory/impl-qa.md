# Sprint 23e — Implementation QA

**Status:** Implementation complete (Phases 1, 2, 2b), awaiting user smoke walk.
**Date:** 2026-05-13.
**Baseline tests at start:** 790/790.
**Tests at finish:** 799/799 (+9 new sprint-23e tests: 4 from Phases 1-2 + 3 from Phase 2b + 2 from the s23c.5 polish landed alongside).

## Phase 0 — Pre-flight

- [x] `git status` clean apart from `handoff.md` and pre-existing `package*.json` (unrelated `@vitest/coverage-v8` addition by tooling).
- [x] Baseline `npm test` → 790/790 green.
- [x] Baseline `npm run lint` → 0 errors.
- [x] Baseline `npm run build` succeeds.

## Phase 1 — Raise MAX_MESSAGES to 60

**TDD red-green:**

- [x] RED: full-scan-survival test added (constructs a 34-message scan transcript + 35th user turn; asserts 15 grade_clause_severity tool_use blocks, 16 total tool_result blocks, 1 extract_clauses tool_use, and `trimmed === false`); failing at `MAX_MESSAGES = 20`.
- [x] GREEN: bumped `MAX_MESSAGES` to 60 with a multi-line comment explaining the rationale; the new test passes.
- [x] Two pre-existing tests pinned to `≤ 20` updated to use 62-message fixtures and `≤ 60` assertions (the cap is enforced — only the value moved).

**Verification snapshot:**

| Pre | Post |
|---|---|
| `MAX_MESSAGES = 20` | `MAX_MESSAGES = 60` |
| 34-msg scan + 1 follow-up trims to ~5-10 messages | All 34 + follow-up survive (35 total) |

## Phase 2 — System prompt prefers prior tool results

**TDD red-green:**

- [x] RED: 3 new tests added (reuse-prior-results phrase present; re-scan carve-out present; names extract_clauses + grade_clause_severity by name); 1 failing (the reuse phrase — the other 2 happened to already match existing prompt copy by coincidence, which is fine).
- [x] GREEN: new `reusePriorResultsSection` const inserted as section 2.6 in `buildSystemPrompt`'s `sections` array, immediately after `leaseAwarenessSection`.
- [x] All 12 pre-existing system-prompt tests still pass.

**New paragraph text (final, post-biome-format):**

```
When the conversation history already contains grade_clause_severity or
extract_clauses tool_result blocks from earlier turns, REUSE those results to
answer follow-up questions (ranking, summarising, drafting emails for specific
clauses). Do NOT re-run the scan tools on follow-up turns unless the user
explicitly asks for a re-scan, the lease changed, or a needed clause is missing
from the prior results. When drafting emails or ranking by severity, cite the
prior grading's `reasoning` and `statute_citation` directly rather than calling
the tool again.
```

## Phase 2b — Verbatim draft-email rendering

**Surfaced during the user's combined smoke walk** after Phases 1-2 landed: the chat-memory fix worked (turn 2 ranked without re-scanning, turn 3 called `draft_negotiation_email` ×10 correctly), BUT the user couldn't actually SEE the 10 emails. The model produced a summary table of titles ("Email sequence by priority: 1. Security Deposit – Most winnable…") while the actual `subject` + `body` for each email stayed buried inside collapsed `draft_negotiation_email` tool-result JSON cards.

**Fix:** new section 2.7 in the system prompt — `draftEmailRenderingSection` — that forces verbatim markdown rendering of each email's `subject` and `body` fields. Same pattern as the Phase 2 `reusePriorResultsSection`: a constant inserted into the `sections` array.

**TDD red-green:**

- [x] RED: 3 new tests added (render VERBATIM mentions subject + body; forbids summary-table failure mode; names the `## Email N` + `**Subject:**` markdown shape); 1 failing on first run (the verbatim instruction didn't exist; the other 2 happened to coincidentally match prompt text).
- [x] GREEN: section 2.7 added between section 2.6 and the tool manifest; all 3 tests pass.
- [x] All 15 pre-existing system-prompt tests still pass.

**New paragraph text (final, post-biome-format):**

```
After every draft_negotiation_email tool_result, you MUST render the email
VERBATIM in your assistant text using this exact markdown shape, one block per
tool call: a ## Email N: {clause label} heading, then a **Subject:**
{tool_result.subject} line, then a blank line, then the full tool_result.body
text rendered as plain paragraphs (preserve line breaks). Do NOT produce a
summary table of email titles, a numbered list of clause names, or "I drafted
N emails…" boilerplate — the user needs to read and copy the actual email
body the tool generated. Do NOT paraphrase the body or omit any of its text.
The subject line and body are the deliverable; everything else in the message
is scaffolding.
```

**Companion follow-up (next sprint):** A dedicated `NegotiationEmailCard` component (sprint-23f) will replace the generic ToolCard JSON view for `draft_negotiation_email` tool_results in Tenant mode — rendering the email as a real card with a Copy button. The Phase 2b prompt change is the immediate fix; the card is the proper UX.

## Acceptance walk

- [x] AC #1 `MAX_MESSAGES = 60` — `src/lib/chat/context-window.ts:16` inspected.
- [x] AC #2 full-scan-survival test — passing; 15 grade tool_use, 16 tool_result, 1 extract tool_use all survive.
- [x] AC #3 prompt mentions reusing prior tool results — `/reuse.*prior.*(tool_result|results)/i` matches.
- [x] AC #4 prompt carves out re-scan exception — `/(re-scan|scan again|lease changed|user (?:asks|explicitly))/i` matches.
- [x] AC #5 test sweep — 794/794 ≥ 792 target.
- [x] AC #6 existing context-window tests still pass — 13/13 in `context-window.test.ts`.

## Manual smoke (load-bearing — reproduces the original bug)

Pending user smoke walk. Steps for the reviewer:

- [ ] Turn 1: standard scan completes with 15 clauses graded.
- [ ] Turn 2: "Rank the red flags…" → assistant answers WITHOUT re-running the scan tools.
- [ ] Turn 3: "Draft polished negotiation emails…" → assistant calls `draft_negotiation_email` per high-severity clause; does NOT say "I don't have a record".
- [ ] Turn 4: follow-up question → coherent answer that references prior gradings.
- [ ] Turn 5: "Scan again" → carve-out works; model DOES re-run the scan tools.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 101 | 101 | 0 |
| Total tests | 790 | 794 | +4 |
| Lint errors | 0 | 0 | 0 |
| Build | green | green | unchanged |

Breakdown of +9:
- Phase 1: +1 (full-scan-survival test)
- Phase 2: +3 (reuse-phrase, re-scan carve-out, tool-names mentioned)
- Phase 2b: +3 (verbatim+subject+body, forbids-summary-table, names-markdown-shape)
- s23c.5 polish landed alongside: +2 (motion-on attribute, no-regression content check)
- Total: 1+3+3+2 = **9**

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23e.0 | 42f127d | docs(s23e): sprint-23e chat-memory specs and QA scaffolds |
| s23e.1 | (pending — awaiting smoke) | refactor(s23e.1): raise MAX_MESSAGES from 20 to 60 in context window (+ survival test) |
| s23e.2 | (pending — awaiting smoke) | refactor(s23e.2): system prompt prefers prior tool results on follow-ups |
| s23e.3 | (pending — awaiting smoke) | refactor(s23e.3): system prompt mandates verbatim draft_negotiation_email rendering |
| s23e.4 | (pending — awaiting smoke) | docs(s23e): record implementation audit in impl-qa.md |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
