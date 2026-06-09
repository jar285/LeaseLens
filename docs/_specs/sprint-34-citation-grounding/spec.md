# Sprint 34 — Citation-Grounding Robustness

## Context

After Sprint 33.B added the "N clauses couldn't be graded" line to the right pane, the user-visible loss is now *named* — but the underlying loss is still happening. Sprint 32.2.0's diagnostic confirms the pattern: roughly **4-5 of 15 `grade_clause_severity` calls per scan throw** with `"statute_citation '…' does not appear in the cited chunk's text — citation not grounded"`. The grading work is permanently lost; the user sees fewer cards than the model actually attempted.

Concrete sample (from the 2026-05-29 reproduction on `sample-nj-residential-lease.pdf`):

```
result_has_error:true, error_msg_head:'grade_clause_severity: statute_citation
  "security-deposit-cap#section:4" does not appear in the cited chunk'
result_has_error:true, error_msg_head:'… "subletting-consent#section:3" …'
result_has_error:true, error_msg_head:'… "Marini v. Ireland, 56 N.J. 130 (1970)" …'
result_has_error:true, error_msg_head:'… "Attorneys\' Fees Clauses" …'
result_has_error:true, error_msg_head:'… "parking-and-storage#section:5" …'
```

Three failure patterns emerge from the error_msg_head alone:

1. **Model picks the chunk_id**, e.g. `"security-deposit-cap#section:4"`. The prompt explicitly says *"DO NOT use the bracketed chunk identifier"* — model ignores it sometimes.
2. **Model picks a section heading** rather than verbatim body text, e.g. `"Marini v. Ireland, 56 N.J. 130 (1970)"` or `"Attorneys' Fees Clauses"` — these are likely chunk headings, not in the body content.
3. **Possibly stale memory** — `"Attorneys' Fees Clauses"` doesn't look like any NJSA citation.

The validator at [src/lib/tools/lease-tools.ts:175-193](../../../src/lib/tools/lease-tools.ts#L175-L193) does the right thing — case-insensitive, whitespace-tolerant substring match against the chunk's body content. But it ONLY accepts matches in the body. It rejects matches that should be considered grounded:

- Chunk *heading* matches (should be valid — the heading is part of the chunk, surfaced as `chunk.heading`).
- Chunk *id* references (should be valid as a chunk pointer — the model is correctly identifying which chunk; we just need to canonicalise the citation string).

## Power-words framing (from [power-words.md](../../_architecture/power-words.md))

| Principle | How Sprint 34 advances it |
|---|---|
| [Source-Grounded AI](../../_architecture/power-words.md#source-grounded-ai) | Tightens true grounding (still reject if citation isn't anywhere in the chunk) **while** widening valid forms (heading + chunk_id). Today's strict-on-the-wrong-axis validator IS NOT real grounding — it's text-form gatekeeping. |
| [Jakob Nielsen](../../_architecture/power-words.md#jakob-nielsen---nielsen-norman-group) | Visibility of system status. Sprint 33.B counted the loss; 34 *recovers* it. |
| [Don Norman](../../_architecture/power-words.md#don-norman) | Recovery. There's currently no recovery path from a validator rejection. After 34.1, the model's heading/id-form citations are recovered (canonicalised server-side). |
| [Eric Evans](../../_architecture/power-words.md#eric-evans) | Domain language. `statute_citation` is overloaded. The fix introduces explicit roles: "statute-quote" (verbatim from body) / "heading-citation" (chunk heading) / "chunk-pointer" (chunk_id). All three are valid grounding; only one is verbatim. |
| [Brendan Gregg](../../_architecture/power-words.md#brendan-gregg) | Measure before optimising. **Sprint 34.0 logs the actual rejection pattern before we touch the validator**, so we know whether the heading/id hypothesis covers ≥80% of failures or there's a third pattern we haven't seen. |
| [Kent Beck](../../_architecture/power-words.md#kent-c-dodds--testing-library) | Every behaviour change ships with a test. The validator change has unit-test coverage per failure pattern. |

## Spec

### Two slices, ship in order

#### Sprint 34.0 — Diagnose (~10 LOC, no behaviour change)

Extend the existing per-tool log in [src/app/api/chat/route.ts:705-725](../../../src/app/api/chat/route.ts) (the `[chat-diag s32.2]` block). On rejection, also include:

- `rejected_citation` (full string, already in `error_msg_head` but truncated)
- `cited_chunk_id` (the model's chunk choice)
- `chunk_heading` (the chunk's `heading` metadata, if available)
- `chunk_body_head` (first 120 chars of the chunk's content)

The data needed is already in the catch-block scope. The current log doesn't print the `chunk_id` from the input or the chunk's metadata; we have to enrich at the catch site or surface the `RetrievedChunk` into the log.

Implementation: refactor `validateGrading` to return a structured error object (or pass the cited chunk back into the catch site) rather than throwing a string. The route then logs the structured details.

**User reproduces once.** I read 5-10 log entries. The failure-mode mix (chunk_id vs heading vs other) becomes ground truth.

#### Sprint 34.1 — Fix (shape decided by 34.0's signal)

Three potential fix levers; the exact combination depends on the signal:

**Lever A — Loosen the validator (the canonical change).** Update [`validateGrading`](../../../src/lib/tools/lease-tools.ts#L175-L193) to accept three forms of grounding:

1. **Body-verbatim match** (current behaviour). Keep as-is.
2. **Heading match.** If the citation appears in the cited chunk's `heading`, accept it. Canonicalise the stored `statute_citation` to whichever form is most user-readable.
3. **Chunk-pointer.** If the citation IS a chunk_id format (`/^[a-z0-9-]+#section:\d+$/`) AND the model also passed it as `chunk_id`, accept it and canonicalise to the chunk's heading.

**Lever B — Sharpen the prompt's citation-format guidance.** Add 2-3 verbatim examples per common statute family. Today's prompt says *"appears VERBATIM in the cited chunk's CONTENT"* — but the model trips on this. Showing it real examples of correct vs. incorrect citation strings should reduce the rejection rate at the source.

**Lever C — Server-side canonicalisation when the validator accepts a heading/id.** When Lever A accepts a heading/id-form citation, the persisted `statute_citation` on the tool result becomes the **canonical statute label** (chunk heading), not the model's freeform string. This ensures the right-pane card shows `"NJSA 46:8-19"` even if the model wrote `"security-deposit-cap#section:4"`.

The expected fix is **A + C together**, with **B** as low-cost belt-and-suspenders. The exact wording of A's heading/id matching depends on 34.0's signal.

### Invariants (carried)

- The validator MUST still reject citations that aren't anywhere in the chunk (heading, body, or id). No fabrication leaks through.
- The validator MUST still reject chunk_ids that aren't in the retrieved set. Sprint 23i grounding contract preserved.
- The tool's external return shape (`GradingResult`) is unchanged. Downstream consumers (`RedFlagReport`, `useScanProgress`, chat) see the same fields.
- Sprint 32.1 `forceScan` / `tool_choice: any` unchanged.
- Sprint 33.0 conversation scoping unchanged.

### Definition of done

- Sprint 34.0: dev log shows the four enriched fields on every grading rejection.
- Sprint 34.1: full unit-test coverage on `validateGrading` (5+ tests per failure pattern). Updated tool tests confirm grading completes when the citation is the heading or a chunk_id form. Existing fabrication-rejection tests still pass.
- All four gates green (lint / typecheck / tests at ≥1107 / build).
- Live Playwright re-verify on `sample-nj-residential-lease.pdf`:
  - **Before:** 10 cards (10 high + 1 ok) + "4 ungraded" line.
  - **After:** 14-15 cards + "0-1 ungraded" line. The exact number depends on whether the model produces any genuinely fabricated citations (those still get rejected).

## Spec QA — gaps & risks

- **Risk: heading-match acceptance lets through fabricated headings.** Mitigation: the heading match is gated on the cited chunk's HEADING field — the model can't fabricate that field, only the citation string. If the citation appears in the heading, it's grounded by construction.
- **Risk: canonicalisation surprises the user.** A model writing `"security-deposit-cap#section:4"` would have its citation card-rendered as `"NJSA 46:8-19"` (or whatever the chunk heading resolves to). Net positive — the user sees a real statute number, not a chunk identifier. Pin via unit test that the surfaced citation is human-readable.
- **Risk: prompt change conflicts with Sprint 31.1 / Sprint 33.A's prompt work.** Mitigation: the citation-format section is the `grade_clause_severity` tool's docstring at [lease-tools.ts:131-150](../../../src/lib/tools/lease-tools.ts#L131-L150), NOT the buildSystemPrompt() sections. Different surface; no conflict.
- **Risk: false positives from heading match (heading text accidentally containing the model's freeform string).** Mitigation: heading match uses the same whitespace+case-insensitive substring check as body match. The heading is short (typically <80 chars) so accidental matches are rare. If observed, tighten to a stricter match.
- **Risk: 34.0 diagnostic leaks corpus content to logs.** Mitigation: `chunk_body_head` is truncated to 120 chars; NODE_ENV-gated like the other dev diagnostics. No leak in production.

## Critical files

| Slice | File | Change |
|---|---|---|
| 34.0 | [src/lib/tools/lease-tools.ts](../../../src/lib/tools/lease-tools.ts) | Either throw a structured error object from `validateGrading`, OR pass the cited `RetrievedChunk` back to the route's catch site. ~15 LOC. |
| 34.0 | [src/app/api/chat/route.ts](../../../src/app/api/chat/route.ts) | Extend the `[chat-diag s32.2]` log block (lines 716-738) with the four new fields. ~10 LOC. |
| 34.1 | [src/lib/tools/lease-tools.ts](../../../src/lib/tools/lease-tools.ts) | Update `validateGrading` (lines 175-193) per Lever A. Sharpen the citation-format docstring (lines 131-150) per Lever B. Add canonicalisation per Lever C. |
| 34.1 | New `src/lib/tools/lease-tools.test.ts` (or extend if it exists) | Unit tests for each acceptance form (body / heading / chunk_id) + each rejection form. |
| 34.1 (optional) | [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | If canonicalisation surfaces a different citation string than the model produced, no UI change is needed — the card just reads better. |

## TDD plan (red → green)

**Sprint 34.0:**
- No new tests. The diagnostic is observed via the dev log; user reproduction is the verification.

**Sprint 34.1 (depending on 34.0 signal):**
1. **Red:** `validateGrading` accepts a citation that matches the chunk's heading (currently rejects).
2. **Red:** `validateGrading` accepts a chunk_id-form citation when chunk_id is in the retrieved set (currently rejects).
3. **Red:** `validateGrading` canonicalises a chunk_id-form citation to the chunk's heading on the returned `GradingResult` (no current behaviour).
4. **Green-still:** validator REJECTS a citation that doesn't appear in heading, body, or chunk_id list (regression guard — fabrication still blocked).
5. **Green-still:** validator REJECTS a chunk_id not in the retrieved set (Sprint 23i grounding contract preserved).
6. Implement → all green.
7. Gate sweep.

## Verification

### 34.0 (diagnostic)
- Dev log shows ≥1 grading rejection per fresh scan with the four enriched fields populated.
- User reproduces once; I read the entries; signal locked.

### 34.1 (live)
- Fresh upload of `sample-nj-residential-lease.pdf` after the fix lands.
- Right pane: card count rises from 11 → 14-15. Ungraded line drops from "4 clauses couldn't be graded" to "0" or "1".
- The verdict headline tier doesn't regress (still "High risk").
- Sprint 32.0 + 32.2.0 diagnostic logs show `result_has_error: true` count drops by ≥3 on the same lease.

## Out of scope

- Replacing the entire grading-tool architecture (e.g. moving to JSON-mode citations with structured output). Defer until evidence suggests it's worth the refactor.
- Improving the RAG corpus (better chunking, more statutes). Separate concern — citation grounding works AGAINST the existing corpus.
- Sprint 33.A.2 polish (A3 ScanTimeline gating + A4 deterministic receipt). Independent slice; queue separately if useful.
- Sprint 28 `window.confirm` modal styling.
- Sprint 33.C per-clause inline focus chat.

## Approval gate

User approves → I:

1. Implement Sprint 34.0 only — extend the diagnostic. ~25 LOC across two files.
2. **User reproduces once** and pastes back the new `[chat-diag s32.2]` lines (now enriched with `cited_chunk_id`, `chunk_heading`, `chunk_body_head`).
3. I read the signal and pick the exact Lever A/B/C shape for 34.1.
4. Sprint 34.1 ships with TDD + Playwright re-verify + QA report.

If the diagnostic signal contradicts the heading/id hypothesis (a third failure pattern dominates), I pause and re-plan with the user before implementing 34.1.
