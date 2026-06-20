# Sprint 46 — Highlight PDF text connected to red flags

> Branch: `feature/pdf-highlight` (off `main`).
> Methodology: spec → spec-QA → TDD red→green per slice → gate sweep (lint/typecheck/test/build) → live verification.

## Goal
After a lease scan completes, highlight the exact lease language behind each red flag directly on the PDF
(Turnitin-style evidence markers), severity-colored, with a two-way link between the red-flag cards and the
PDF highlights. Let a tenant move *red-flag card → exact PDF text → explanation → recommended action* without
hunting the page for the sentence that triggered the concern.

## Why now — what "View on page" leaves on the table (verified in code)
Today the workspace wires cards to the PDF only at **page** granularity:
- [RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) `jumpToClausePage` and
  [ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) `handleRowClick` set `activeClauseId` and call
  `pdfViewerRef.current?.scrollToPage(page_number)` — the user still scans the page for the clause.
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) renders the react-pdf **text layer**
  (`TextLayer.css` imported) but adds no overlay; the only cue is a sticky "Clause · §N · page M" callout.
- The data pipeline keeps only `page_number` + clause `text`: [parse-pdf.ts](../../../src/lib/lease/parse-pdf.ts)
  explicitly discards pdfjs transforms/coordinates, and clause text reaching the UI is **truncated to 1200 chars**
  ([lease-tools.ts:45](../../../src/lib/tools/lease-tools.ts#L45)). So there is no stored geometry to draw from.

## Target user
The NJ **tenant** reviewing a dense lease. They see "Late fee · High" on a card but can't quickly verify *which*
sentence caused it. Highlighting the source text turns a claim into evidence — the trust core of a parser-first,
source-grounded product.

## Decisions confirmed with the user
- **Display model: persistent + filters.** Every red-flagged (graded) clause highlights on scan-complete;
  **High + Medium ON by default, Low/OK behind a toggle**. Clicking a card pulses its highlight.
- **Visual: soft severity tint + inline severity icon** — color is never the only channel.

## Governing power-words (per `power-words.md` acceptance standard)
| Power word | Decision it governs | Verification |
|---|---|---|
| **Page Anchoring** | A red flag is trustworthy only when the user can see the exact clause that caused it; highlight + jump to the source text. | Clicking a card scrolls to and pulses the matched `<mark>` for that clause. |
| **Source-Grounded AI** | Highlights derive from the same graded clauses the cards render (one source of truth), never invented spans. | `computeClauseHighlights` reuses `partitionByLatestExtract` + the last-wins grading scan; highlights can't disagree with cards. |
| **Text-Layer First** | v1 matches clause text against the rendered text layer; scanned/no-text-layer PDFs degrade gracefully, OCR deferred. | A page with no usable text items shows a "highlighting unavailable" pill; page nav still works. |
| **React Team / Dan Abramov** (state ownership) | New highlight UI state lives in a dedicated `PdfHighlightContext`; click-focus reuses the existing `activeClauseId`. No parser fields leak into `ChatStreamContext`. | The pinned `ChatStreamContext` exposed-keys test stays green; hover never re-renders `<Page>`. |
| **WCAG** | Severity carries a non-color channel (inline icon + aria-label); pulse is reduced-motion-gated; highlights keyboard-reachable. | A11y tests: aria-label present; no pulse class under `prefers-reduced-motion: reduce`; controls/marks focusable. |
| **OWASP** (input handling) — *supporting* | Clause text is untrusted PDF content injected as an HTML string into `customTextRenderer`; escape before wrapping. | `escapeHtml` neutralizes injected tags; renderer never interpolates raw item text. |

Avoided as decorative: storing bounding-box coordinates (a real Martin Kleppmann data-modeling decision, but
**deferred** — v1 needs no schema change); Roy Fielding/REST (no new endpoints).

## Approach (client-side text matching + react-pdf `customTextRenderer`)
No DB / parsing / schema / tool changes. Match each clause's `text` against the page's text layer at render time
and render highlights via react-pdf's `customTextRenderer`, which the library re-runs on every text-layer
re-render — so **zoom / scroll / rotation realignment is free** (the riskiest part of a manual overlay).

react-pdf 10.4.1 sanitizes `customTextRenderer` output
([TextLayer.js:47-78](../../../node_modules/react-pdf/dist/Page/TextLayer.js)): it strips `on*`/`srcdoc`/dangerous
URLs but **keeps `class`/`data-*`/`tabindex`/`role`/`aria-*`**. Consequences:
- Mark interactivity uses **event delegation** (`closest('[data-clause-id]')`) — inline handlers are impossible.
- We **HTML-escape** clause text before wrapping (primary control; the sanitizer is defense-in-depth).

1. **Matching engine** ([highlight-match.ts](../../../src/lib/lease/highlight-match.ts)) — pure: normalize
   (whitespace/quote/dash/ligature) page + clause, locate the clause span, map back to per-item `<mark>` ranges.
   Anchored-prefix fallback for the 1200-char truncation / tail drift; forward scan cursor across a page's
   clauses (clause_index order) to disambiguate repeated boilerplate.
2. **Targets hook** ([use-clause-highlights.ts](../../../src/components/lease/use-clause-highlights.ts)) — join
   extract (text+page) with grading (severity), graded clauses only, grouped by page, gated on scan-complete.
3. **PdfHighlightContext** — `showHighlights`, `severityFilter` (default `{high,medium}`), `hoveredClauseId`;
   mounted under `LeaseParserProvider` in `ParserResultsShell`. Reuses `activeClauseId` for click-focus.
4. **Render** — `customTextRenderer` wraps filtered matched ranges in `<mark class="ll-hl ll-hl--{sev}" …>`;
   ref-backed renderer + per-`(page,clause)` range cache (no thrash); `onGetTextSuccess` empty-items → fallback pill.
5. **Emphasis** — effect on `activeClauseId` scrolls to + pulses the first mark (reduced-motion → static outline),
   scoped to the viewer instance; reuses RedFlagReport's 4s `HIGHLIGHT_DURATION_MS`.
6. **Two-way hover** — delegated listener ↔ `hoveredClauseId`; class-toggle emphasis, active outranks hover.
7. **Controls** — `HighlightControls` in `RedFlagsPaneHeader`: show/hide + four severity chips (each a
   `SeverityBadge`), aria-pressed, ≥44px, aria-live on active-highlight change.

## Variance (allowed to change without re-QA)
Exact mark class names + CSS tint values, the matcher's normalization/fuzzy thresholds, control placement copy,
and pulse timing. Frozen: highlights derive only from graded clauses; clause text is escaped before injection;
no parser fields added to `ChatStreamContext`; reduced-motion gating; severity not by color alone.

## Invariants
- Highlights vanish when the lease is Replaced (they derive from `toolEvents`/`activeLease`, which `resetParser` clears).
- A page with no usable text layer never throws — it shows the fallback pill; page navigation is unchanged.
- The matcher is pure (no DOM) and deterministic; the DOM/scroll/pulse layer is scoped to a single viewer instance.
- No DB / schema / parsing / tool-output change in v1.

## Risks
- **MED — match miss on text drift / truncation.** Mitigation: normalization + anchored-prefix fallback; on miss,
  degrade to the existing page-level scroll + sticky callout.
- **MED — renderer thrash / O(items) matching.** Mitigation: ref-backed renderer + per-`(page,clause)` range cache.
- **LOW — repeated boilerplate mis-highlight.** Mitigation: clause_index-ordered forward cursor.
- **LOW — XSS / stray tags from PDF text.** Mitigation: `escapeHtml` every segment; never interpolate raw `str`.
- **LOW — focus-mode double viewer.** Mitigation: scope every `querySelector` to the instance's scroll ref.

## Out of scope (deferred — spec Phase 5)
Exporting highlighted PDFs, OCR for scanned PDFs, highlight confidence scores, multi-color annotations,
side-by-side evidence. Stored per-clause bounding boxes (precise coordinates) is the natural successor and the
point at which a real schema/data-model change becomes justified.

## Definition of Done
TDD red→green per slice; lint + typecheck + full test + build green; the spec-demanded behaviors covered by tests
(highlight data created for red-flagged clauses; renders on correct page; click→scroll+pulse; gone after Replace;
visibility toggle; severity filters; zoom no permanent misalign; missing-text-layer fallback; keyboard;
reduced-motion no-pulse); QA notes in `impl.md`; live verification against the seeded sample lease.

## Sprint breakdown
- **46.1** matching engine + escape-html (pure)
- **46.2** `use-clause-highlights` hook (gated on scan-complete)
- **46.3** `PdfHighlightContext` + shell wiring + `withChatStream`
- **46.4** render marks via `customTextRenderer` + severity tint CSS + fallback pill
- **46.5** active-clause emphasis (scroll + pulse, reduced-motion gated)
- **46.6** two-way hover linkage (card ↔ PDF highlight)
- **46.7** `HighlightControls` (show/hide + severity filter)
- **46.8** regression + integration (Replace teardown, zoom, keyboard, fallback)
