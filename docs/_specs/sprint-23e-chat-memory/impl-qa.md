# Sprint 23e — Implementation QA

Filled during implementation. Empty scaffold below.

## Phase 0 — Pre-flight

- [ ] `git status` clean apart from `handoff.md` and pre-existing `package*.json`.
- [ ] Baseline `npm test` → 790/790 green.
- [ ] Baseline `npm run lint` → 0 errors.
- [ ] Baseline `npm run build` succeeds.

## Phase 1 — Raise MAX_MESSAGES to 60

**TDD red-green:**

- [ ] RED: full-scan-survival test added; failing at `MAX_MESSAGES = 20`.
- [ ] GREEN: bump constant to 60; test passes.
- [ ] All existing context-window tests still pass.

**Verification snapshot:**

| Pre | Post |
|---|---|
| `MAX_MESSAGES = 20` | `MAX_MESSAGES = 60` |
| 34-msg scan + 1 follow-up trims to ~5-10 messages | All 34 + follow-up survive (35 total) |

## Phase 2 — System prompt prefers prior tool results

**TDD red-green:**

- [ ] RED: paragraph-presence + carve-out test added; failing.
- [ ] GREEN: new paragraph inserted as section 2.6 in `buildSystemPrompt`'s `sections` array.
- [ ] Existing system-prompt tests still pass.

**New paragraph text (final):**

```
When the conversation history already contains grade_clause_severity or
extract_clauses tool_result blocks from earlier turns, REUSE those results to
answer follow-up questions (ranking, summarising, drafting emails for specific
clauses). Do NOT re-run the scan tools on follow-up turns unless the user
explicitly asks for a re-scan, the lease changed, or a needed clause is missing
from the prior results. When drafting emails or ranking by severity, cite the
prior grading's reasoning and statute_citation directly.
```

## Acceptance walk

- [ ] AC #1 `MAX_MESSAGES = 60` (source inspection)
- [ ] AC #2 full-scan-survival test (15 tool_result blocks survive)
- [ ] AC #3 prompt mentions reusing prior tool results
- [ ] AC #4 prompt carves out re-scan exception
- [ ] AC #5 test sweep ≥ 792
- [ ] AC #6 existing context-window tests still pass

## Manual smoke (load-bearing — reproduces the original bug)

- [ ] Turn 1: standard scan completes with 15 clauses graded.
- [ ] Turn 2: "Rank the red flags…" → assistant answers WITHOUT re-running the scan tools.
- [ ] Turn 3: "Draft polished negotiation emails…" → assistant calls `draft_negotiation_email` per high-severity clause; does NOT say "I don't have a record".
- [ ] Turn 4: follow-up question → coherent answer that references prior gradings.
- [ ] Turn 5: "Scan again" → carve-out works; model DOES re-run the scan tools.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 101 | | |
| Total tests | 790 | | |
| Lint errors | 0 | | |
| Build | green | | |

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23e.0 | (pending) | docs(s23e): sprint-23e chat-memory specs and QA scaffolds |
| s23e.1 | (pending) | refactor(s23e.1): raise MAX_MESSAGES from 20 to 60 in context window (+ survival test) |
| s23e.2 | (pending) | refactor(s23e.2): system prompt prefers prior tool results on follow-ups |
| s23e.3 | (pending) | docs(s23e): record implementation audit in impl-qa.md |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
