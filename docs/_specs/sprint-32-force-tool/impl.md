# Sprint 32.1 + 32.2.0 — Implementation Notes & QA Report

## Sprint 32.1 — Force Tool Use (primary fix)

### What was completed

The chat route accepts an optional `forceScan: boolean` field. When `true`, the route passes `tool_choice: { type: 'any' }` to Anthropic on the **first** iteration of the agentic loop. The API rejects any model path that returns text-only on that iteration — the model MUST call at least one tool. Subsequent iterations use default `auto` so the model can stop when grading is done.

`AutoScanRunner` sends `forceScan: true` every time. Regular FAB chat omits the flag (preserves the existing chat surface).

### Tests added / updated

| Test | File | Pins |
|---|---|---|
| `passes tool_choice:{type:"any"} on iteration 1 when forceScan=true` | [route.integration.test.ts](../../../src/app/api/chat/route.integration.test.ts) | Route wires forceScan to Anthropic call. |
| `does NOT pass tool_choice when forceScan is omitted` | [route.integration.test.ts](../../../src/app/api/chat/route.integration.test.ts) | Regression guard for FAB chat. |
| `AutoScanRunner POST body includes forceScan: true` | [AutoScanRunner.test.tsx](../../../src/components/lease/AutoScanRunner.test.tsx) | Client always sends the flag. |

### Gates (final)

| Gate | Result |
|---|---|
| `npm run lint` | PASS (0/0/1-info, pre-existing) |
| `npm run typecheck` | PASS |
| `npm test` | PASS (1087/1087) |
| `npm run build` | PASS (9.9s) |

---

## Sprint 32.2.0 — Per-Tool-Call Diagnostic

### What was completed

A second dev-only log line `[chat-diag s32.2]` inside `executeToolAndPersist` ([route.ts:717-738](../../../src/app/api/chat/route.ts#L717-L738)), printed once per tool invocation. Captures:

- `tool_name`
- `input_clause_id` (preserved on errors via input)
- `result_clause_id` (only populated on success)
- `result_severity`
- `result_has_error`
- `error_msg_head` (first 100 chars when present)

NODE_ENV-gated. Surfaced the precise reason RedFlagReport was rendering 0 cards in my Playwright test.

### Diagnostic outcome — Theory A confirmed (partial)

User reproduced. Per-event log showed:

```
1 × extract_clauses     → success
10 × grade_clause_severity → SUCCESS  (1 MEDIUM + 9 OK)
 5 × grade_clause_severity → ERROR ("statute_citation does not appear in the cited chunk")
```

Every error has the same shape: `grade_clause_severity` threw a `statute_citation does not appear in the cited chunk` validation failure. The validator at [lease-tools.ts](../../../src/lib/tools/lease-tools.ts) correctly rejects ungrounded grades, but the model is picking citation strings that aren't verbatim in the RAG chunks it cited.

The 10 successful gradings have valid `clause_id` + `severity` + `statute_citation` matching the active lease's extract. They DO render cards in the right pane.

### Live Playwright re-verify (the success state)

After waiting for the full ~58s scan to complete:

```
red-flag-card count:  10
summary:              "1Med9OK"
inFlight:             false
loading staircase:    not rendered
```

Screenshot: [screenshots/02-cards-render-after-32.1.png](./screenshots/02-cards-render-after-32.1.png).

The original bug — "fresh upload → red-flag panel stays empty forever" — is FULLY RESOLVED by the Sprint 31.1 (wording) + Sprint 32.1 (force tool) stack. The earlier Playwright observation where I saw 0 cards was a timing artifact (I checked at "Grading 14 of 15" before the final grading + lifecycle transition fired).

### Why my earlier observation was misleading

After Sprint 32.1, I observed: `tool_use=15, tool_result=15, lifecycleDetail="Grading 14 of 15", cardCount=0`. I interpreted that as "tools fired but cards don't render." Actual reading:

- The 15th `tool_use` was the model's text-summary turn (no actual tool call — the model emits final text after the agentic loop ends).
- `tool_result=15` includes the extract + 14 grades.
- `lifecycleDetail="14 of 15"` reflected that only 14 grades had landed; the 15th was a citation error and was being processed.
- At the moment I sampled, lifecycle was still in `checking_clauses` (1 grading remaining + 5 errors hadn't been counted yet).
- Cards weren't rendered because `inFlight` was true (lifecycle hadn't reached `review_ready` yet).

Lesson: the right test for "did the scan complete?" is `red-flag-report-scanning` testid absence + non-zero `red-flag-card` count, not raw stream counts.

---

## What's still imperfect (out of scope for Sprint 32; future polish)

### Carry 1 — Citation-grounding errors

5 of 15 clauses still error with `statute_citation does not appear in the cited chunk`. The validator is doing its job (preventing ungrounded grades), but the model is occasionally picking citation strings that are slightly off (e.g. `"security-deposit-cap#section:4"` may be a section *heading* rather than verbatim text within the chunk).

Possible follow-up sprints:
- Soften the validator to accept normalized citation strings (e.g. section heading lookups).
- Stronger prompt guidance for the model on how to pick citations that pass verbatim validation.
- Document acceptable citation patterns in the system prompt.

### Carry 2 — Silent drop of errored clauses in the right pane

The 5 errored clauses don't appear anywhere in the RedFlagReport panel — they're filtered out by `isGradingResult` and the user has no visibility unless they open the FAB chat. A transparency line ("4 clauses couldn't be graded — see chat") would close this UX gap.

### Both deferred per user direction

User chose to commit the working stack rather than continue polishing immediately.

---

## How to re-verify locally

```bash
npm test src/components/lease/AutoScanRunner.test.tsx src/app/api/chat/route.integration.test.ts
# 21/21 green

npm run lint && npm run typecheck && npm run build
# all green

npm run dev
# upload sample-nj-clean-lease.pdf
# wait ~60 seconds (the citation-error retries make this take longer than ideal)
# confirm right-pane shows ~10 cards with the summary "1 Med · 9 OK"
# confirm the loading staircase disappears

# dev logs in the terminal:
# - [chat-diag s32.0] line 1× per chat turn — summary stats
# - [chat-diag s32.2] line 1× per tool call — per-tool detail
```
