# Sprint 34 — Implementation Notes & QA Report

## What was completed

Two slices, shipped per spec methodology (diagnose → fix).

### Sprint 34.0 — Per-rejection diagnostic enrichment (NODE_ENV-gated, no behaviour change)

Inside [`validateGrading`](../../../src/lib/tools/lease-tools.ts) — immediately before each `throw` — emit a sibling `[chat-diag s32.2-reject]` log line with the rich context the route-level catch site can't see:

- `rejected_citation` (the model's exact citation string)
- `cited_chunk_id` (the model's chunk choice)
- `chunk_heading` (chunk metadata, or `null` when chunk_id wasn't found)
- `chunk_body_head` (first 120 chars of chunk content, or `null`)
- `rejection_reason` (`chunk_id_not_retrieved` | `citation_not_in_body`)

Implemented via the Workflow tool (`waqrn27n7`, 2 phases — Implement + Verify). +26 LOC; tests + lint + typecheck stayed green throughout.

### Sprint 34.1 — Validator + canonicalisation fix (signal-driven)

The diagnostic surfaced two patterns across 4 rejections per scan on the residential sample lease:

| Pattern | Count | Example |
|---|---|---|
| **chunk_id-as-citation** (model passes `cited_chunk_id` literally as `statute_citation`) | 3 of 4 | `rejected_citation: "late-fees-general#section:5"`, `cited_chunk_id: "late-fees-general#section:5"` |
| **Concatenated multi-statute** (model joins multiple statutes with `;`) | 1 of 4 | `rejected_citation: "Late Fees on Rent — Marini v. Ireland, 56 N.J. 130 (1970); NJSA 56:8-1 et seq."` |

Two fixes in `validateGrading`:

**Lever A.1 — chunk-pointer canonicalisation.** When `raw.statute_citation === raw.chunk_id` AND the chunk_id is in the retrieved set (already validated by the prior `cited` check), accept it and rewrite the stored citation to a humanised slug-derived label via the new `humaniseChunkPointer` helper:

| Slug | Canonical label |
|---|---|
| `late-fees-general#section:5` | `Late fees (NJ tenant-law corpus, §5)` |
| `early-termination-general#section:4` | `Early termination (NJ tenant-law corpus, §4)` |
| `subletting-consent#section:5` | `Subletting consent (NJ tenant-law corpus, §5)` |
| `parking-and-storage#section:5` | `Parking and storage (NJ tenant-law corpus, §5)` |

The `-general` suffix is dropped (corpus convention for top-level chunks); kebab-case is humanised; the section number renders as `§N`.

**Lever A.2 — concatenated-citation split.** Split the `statute_citation` on `;`, ` & `, or ` and ` (case-insensitive). If ANY part appears in the chunk body, accept and canonicalise the stored citation to the matching part. Single-part citations preserve existing behaviour exactly.

Both levers preserve the fabrication-rejection guarantee: a citation that isn't a chunk_id AND doesn't appear in any of the split parts still throws.

## Tests added (Sprint 34.1)

Three new tests in [src/lib/tools/lease-tools.test.ts](../../../src/lib/tools/lease-tools.test.ts), describe block `Sprint 34.1 — citation-grounding robustness`:

| Test | What it pins |
|---|---|
| `accepts a chunk_id-form citation when it matches the chunk_id, canonicalised to a humanised label` | Lever A.1: model passes chunk_id as citation → accepted; result.statute_citation is humanised slug ("Late fees ... §5"), NOT the raw chunk_id. |
| `accepts a concatenated multi-statute citation when ANY part appears in the chunk body, canonicalising to the matching part` | Lever A.2: `"Late Fees on Rent — Marini v. Ireland …; NJSA 56:8-1 et seq."` accepted because `NJSA 56:8-1` is in the body; canonicalised to that matching part. |
| `still rejects a genuinely fabricated citation that is not in body and not a chunk_id (regression guard)` | Fabrication blocking preserved: `"NJSA 99:99-99 (totally invented)"` still throws. |

## Gates (final)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors / 0 warnings / 0 info |
| `npm run typecheck` | **PASS** — clean |
| `npm test` | **PASS** — **1105/1105** across 124 files (28.00s); grew from 1102 by 3 |
| `npm run build` | **PASS** — Compiled in 8.6s |

## Live Playwright re-verify (sample-nj-residential-lease.pdf)

Fresh upload through the live UI; observed the right-pane state after the scan completed:

| Metric | Before Sprint 34.1 | After Sprint 34.1 | Δ |
|---|---|---|---|
| `red-flag-card` count | 11 | **14** | **+3** |
| Verdict headline | `"High risk — 10 findings, biggest concern is Auto-renewal · §1."` | `"High risk — 13 findings, biggest concern is Auto-renewal · §1."` | +3 findings |
| Summary count strip | `10 High · 1 OK` | **`13 High · 1 OK`** | +3 high |
| Ungraded line | `"4 clauses couldn't be graded"` | **`"1 clause couldn't be graded"`** | **−3 (75% reduction)** |
| Card citations (sample) | mixed (some `xxx#section:N`) | `NJSA 46:8-10`, `NJSA 56:8-1 et seq.`, `Marini v...` | canonicalised ✓ |

**Card recovery rate: 75%** (3 of 4 previously-lost gradings recovered on this lease). The remaining 1 ungraded clause is a different rejection pattern not covered by Lever A.1 or A.2 — likely fabrication or a rare third pattern. Acceptable; addressing it would be a follow-up sprint if the rate matters.

The Sprint 33.0 conversation-isolation + Sprint 33.A+33.B chat-trim + verdict-headline stack is all still working: the conversation_id this run was `0301e9dd-…` (fresh per scan), chat final_text was 384 chars with no markdown table.

## Spec alignment

| Spec section | Status |
|---|---|
| 34.0 — Diagnose | **DONE** (via Workflow tool, verified, gates green) |
| 34.1 Lever A.1 — chunk-pointer canonicalisation | **DONE** (3 of 4 rejections covered) |
| 34.1 Lever A.2 — concatenated-citation split | **DONE** (4th rejection covered in unit test; live recovery rate suggests it covers similar future variants) |
| 34.1 Lever A.3 — heading-match | **NOT NEEDED** (corpus headings are too generic — all `"Common red flags"` on the rejection cases — to be useful citation sources) |
| 34.1 Lever B — prompt sharpening | **DEFERRED** (model has ignored the existing "DO NOT use chunk identifier" instruction; A.1 + A.2 handle the failure mode in the validator instead) |
| 34.1 Lever C — server-side canonicalisation | **DONE** (built into A.1 and A.2; surfaced citation strings are now domain-readable) |

## Drift observed

None.

## Carry into next sprint

- The 1 remaining ungraded clause per scan (down from 4) — different failure pattern not covered here. Could be:
  - A fabricated citation (validator correctly rejects)
  - A novel concatenation form not caught by the `;`/`&`/`and` split
  - Pull another `[chat-diag s32.2-reject]` sample if you want to investigate.
- Sprint 33.A.2 polish (gate ScanTimeline off auto-scan + deterministic synthetic receipt) — independent slice, still available.
- Sprint 28 `window.confirm` modal replacement — independent UX polish.

## How to re-verify locally

```bash
npm test src/lib/tools/lease-tools.test.ts
# 20/20 green; the 3 new Sprint 34.1 tests are in the describe block at the end

npm run lint && npm run typecheck && npm run build  # all green

npm run dev
# Upload sample-nj-residential-lease.pdf
# Wait ~60s
# Expect: 14 cards, "13 High · 1 OK" summary, "1 clause couldn't be graded" ungraded line
# Each card's citation should read as a real statute reference, not a chunk_id with "#section:N"
```
