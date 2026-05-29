# Sprint 31.1 — Implementation Notes & QA Report

## What was completed

The active-lease metadata in [src/lib/chat/system-prompt.ts:107-117](../../../src/lib/chat/system-prompt.ts#L107-L117) (`leaseAwarenessSection`, active branch only) is rewritten to disambiguate **PDF text-layer indexing** (upload pipeline output) from **scan-tool grading** (chat-tool work that still needs to happen).

### Before (broken)

> *"An active lease IS loaded for this conversation: '{filename}' (3 pages, **15 clauses extracted**, lease_id …). When the user asks about 'this lease' … CALL extract_clauses or grade_clause_severity directly …"*

### After (fixed)

> *"An active lease IS loaded for this conversation: '{filename}' (3 pages, **15 clauses indexed from the PDF text-layer at upload time — NOT YET graded; you still need to call extract_clauses to read the clause list and grade_clause_severity once per clause to grade them**, lease_id …). When the user asks about 'this lease' … CALL extract_clauses or grade_clause_severity directly …"*

The empty-lease branch (`activeLease == null`) is unchanged.

## Tests added (Sprint 31.1)

All in [src/lib/chat/system-prompt.test.ts](../../../src/lib/chat/system-prompt.test.ts) under a new `describe('Sprint 31.1 — scan-prompt disambiguation', ...)` block:

| Test | What it pins |
|---|---|
| does NOT describe the active-lease clause count as "extracted" | `prompt` must not match `/\d+\s+clauses?\s+extracted/i` — the exact phrase that triggered the model to refuse the scan |
| clarifies that the clause count is PDF text-layer indexing, not grading | `prompt` must contain `"indexed from the PDF"` or `"text-layer"` AND `"not yet graded"` |
| explicitly tells the model it still needs to call the scan tools | `prompt` must contain the literal substring `"still need to call extract_clauses"` |

Test 3 was originally a loose regex (`/(still|must|need).*call.*extract_clauses.*grade_clause_severity/is`) which the `s` flag let match cross-section text in the existing prompt. Tightened to a literal `.toContain(...)` so it can only be satisfied by the new wording.

## Gates (final run)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors / 0 warnings / 1 info (pre-existing, unrelated) |
| `npm run typecheck` | **PASS** — clean |
| `npm test` | **PASS** — 1085/1085 across 123 files (29.72s); grew from 1082 by 3 (the new tests) |
| `npm run build` | **PASS** — Compiled in 9.0s; 12 static pages generated |

## Playwright re-verify (the proof)

Live reproduction on the running dev server. Both runs used the exact same lease (`sample-nj-clean-lease.pdf`) and the same UI path (Replace → drop file).

### Run A — BEFORE the fix (broken)

| Measurement | Value |
|---|---|
| `chatRequests` | 1 |
| `streamLines` | 2 |
| `tool_use` events | 0 |
| `tool_result` events | 0 |
| `chunk` (text refusal) | 1 |
| First chunk text | *"I understand you're asking for a scan, but your lease has already been fully scanned. All 15 clauses were…"* |
| Lifecycle stage | stuck at `upload_received` (matches user screenshot) |
| Red-flag cards rendered | NO |

### Run B — AFTER the fix (working)

| Measurement | Value |
|---|---|
| `chatRequests` | 1 |
| `streamLines` | 28 |
| `tool_use` events | 14 (1 extract_clauses + 13 grade_clause_severity) |
| `tool_result` events | 13 |
| `chunk` (text refusal) | **0** |
| Lifecycle stage | scan complete (loading staircase unmounted) |
| Red-flag cards rendered | **YES** |

Screenshot: [screenshots/01-fresh-upload-scan-complete.png](./screenshots/01-fresh-upload-scan-complete.png).

This is strong evidence the fix is causal: same lease, same upload path, only the system-prompt wording differs. The model's behaviour flipped from "refuse with text" to "call the tools as expected."

## Spec alignment

- All Sprint 23e reuse-prior-results contracts preserved (those tests still pass — they pin a different section at line 118+).
- All Sprint 29.10 scan-progress-awareness contracts preserved.
- `ActiveLeaseSummary` interface unchanged.
- `buildSystemPrompt()` signature unchanged.
- Empty-lease branch unchanged.

## Drift observed

One non-spec hardening: Test 3 had a loose regex initially. Caught + tightened to a literal `.toContain(...)` before implementing. Otherwise: no drift.

## Carry into next sprint

- The optional Sprint 31.2 hardening (rewrite `STANDARD_SCAN_PROMPT` for additional imperative force) is **not needed** — the metadata-only fix produced 14 tool calls + 13 results + 0 refusals on the first live retest. Defer until evidence demands it.
- Sprint 28 carries still standing: styled Replace confirmation, `next-env.d.ts` gitignore.
- Sprint 29 carries: commit of Sprint 29.1-29.13 + Sprint 30.1 + Sprint 31.1 stack (currently uncommitted on `feature/fab-menu`); optional Sprint 29.14 process plate.

## Diminishing returns assessment

For Sprint 31.1: **N** (done — the model is no longer refusing). Two follow-ups remain *if* future failure modes show up: (1) hardening STANDARD_SCAN_PROMPT (planned but deferred), (2) server-side re-scan injection (option 3 from triage menu, also deferred).

## How to re-verify locally

```bash
npm test src/lib/chat/system-prompt.test.ts  # 28/28 green
npm run lint && npm run typecheck && npm run build  # all green
npm run dev                                  # then in browser:
                                             #   - upload sample-nj-clean-lease.pdf
                                             #   - confirm red-flag cards appear within ~30s
                                             #   - confirm RedFlagsLoadingState advances past "Upload received"
```
