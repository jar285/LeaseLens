# Sprint 31.1 — Scan-Prompt Disambiguation

## Context

Auto-scan on fresh upload silently fails: the lifecycle UI parks at "Upload received" forever because the model refuses to call `extract_clauses` / `grade_clause_severity` and responds with text instead ("I understand you're asking for a scan, but your lease has already been fully scanned. All 15 clauses were…").

Reproduced live via Playwright (2026-05-28):
- Clicked Replace, uploaded `sample-nj-clean-lease.pdf` → `AutoScanRunner` fired one `/api/chat` request.
- Teed the response stream: exactly **2 lines** in 15 seconds — one `conversationId` envelope, one `chunk` line with refusal text. Zero `tool_use`, zero `tool_result`.
- `LeaseParserContext.toolEvents` stays at `[]` → `computeScanLifecycleStage()` returns `stage: 'upload_received'` → `RedFlagsLoadingState` renders the staircase with row 0 active. Matches the user's screenshot exactly.

## Root cause

The active-lease summary at [src/lib/chat/system-prompt.ts:108](../../../src/lib/chat/system-prompt.ts#L108) currently reads:

> *"An active lease IS loaded for this conversation: '...' (3 pages, 15 clauses **extracted**, lease_id ...)."*

The `clause_count: 15` comes from the **upload pipeline** — `pdfjs-dist` text-layer extraction happens server-side at upload time and is stored in the DB before any chat turn. The phrase "15 clauses extracted" sounds identical to "the `extract_clauses` tool has already been called." Combined with the guard at [system-prompt.ts:118](../../../src/lib/chat/system-prompt.ts#L118) — *"Do NOT re-run the scan tools on follow-up turns"* — the model concludes this is a follow-up turn and answers in plain text.

This is a Domain-Driven Design ([Eric Evans](../../_architecture/power-words.md#eric-evans)) issue: **"extracted"** carries two meanings — (a) PDF text-layer extraction by the upload pipeline (already done), and (b) the chat tool named `extract_clauses` (what the scan still needs to call). The prompt blurs them and the model honors the wrong reading.

## Spec

### Invariants (carried)

- All other system-prompt sections unchanged: identity, role rendering, disclaimer, tool surface, NJ-only refusal, UTC date, render_workflow_diagram, reuse-prior-results guard, scan-progress awareness, draft-email summary, scan-complete table format.
- `buildSystemPrompt(...)` signature unchanged.
- `ActiveLeaseSummary` interface unchanged.

### New behaviour

The `activeLease` branch of `leaseAwarenessSection` (lines 107-108) rewords the metadata so that:
1. The clause count is unambiguously described as **PDF text-layer indexing**, not as a prior tool call.
2. The instruction explicitly says the model **must still call** `extract_clauses` and `grade_clause_severity` to actually perform the scan.
3. The phrase "clauses extracted" is removed.

Proposed wording:

> *"An active lease IS loaded for this conversation: '{filename}' ({page_count} {pages}, {clause_count} {clauses} **indexed from the PDF text-layer at upload time — NOT YET graded**; you still need to call extract_clauses to read the clause list and grade_clause_severity once per clause to grade them, lease_id {id}). When the user asks about 'this lease', 'the lease', 'my lease', or anything specific to it (e.g. 'find red flags', 'what does it say about X', 'review the deposit clause'), CALL extract_clauses or grade_clause_severity directly — do NOT ask the user to upload, the upload is already in the left pane and this conversation is bound to it."*

### Definition of done

- New tests pin the disambiguated wording.
- Existing tests stay green (the Sprint 23e "reuse prior results" tests must not regress — they don't depend on the word "extracted").
- `npm run lint` / `typecheck` / `test` / `build` all green.
- Playwright re-verify: fresh upload of sample lease produces `tool_use` + `tool_result` events within ~30 seconds and the lifecycle UI advances past `upload_received`.

## Spec QA

- **Risk: model still refuses with new wording.** Mitigation: the new wording uses explicit imperative ("you still need to call extract_clauses") rather than relying on the model to infer intent. Playwright re-verify is mandatory.
- **Risk: regressing the Sprint 23e reuse-prior-results contract.** Mitigation: that section is at line 118 (separate from line 108); reuse-prior-results test asserts `/reuse.*prior.*(tool_result|results)/i` which doesn't overlap with the metadata wording.
- **Risk: stochastic model behaviour.** A single Playwright pass that emits tool events is insufficient evidence — but it's strong evidence given that the OLD wording reliably produced zero tool events on the same lease. If the new run shows N>0 tool events, the prompt is materially better even if not 100% deterministic.

## Out of scope

- Rewriting `STANDARD_SCAN_PROMPT` (option 2 from the AskUserQuestion menu). Deferred to Sprint 31.2 if the metadata-only fix proves insufficient.
- Server-side guard / re-scan injection (option 3). Bigger surface; defer until evidence demands it.
