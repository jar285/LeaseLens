# Sprint 46 — implementation QA notes

Running log; one section per slice as it lands. Gate sweep (lint/typecheck/test/build) at the end.

## 46.1 — Matching engine + HTML escaping (2026-06-09)

**What changed (4 new files)**
- [src/lib/lease/highlight-match.ts](../../../src/lib/lease/highlight-match.ts) — pure clause-text → text-layer
  range matcher. `matchClausesOnPage(items, clauses)` builds one normalized page string (NFKC + whitespace/
  quote/dash/ligature folding) with a back-map to original item offsets, locates each clause's span, and emits
  per-item `{itemIndex,start,end}` ranges. Anchored-prefix fallback covers the 1200-char clause truncation +
  tail drift; a forward scan cursor (clause_index order) disambiguates repeated boilerplate. `MIN_MATCH_CHARS`/
  `MIN_ANCHOR_CHARS` exported + pinned by tests.
- [src/lib/lease/escape-html.ts](../../../src/lib/lease/escape-html.ts) — escapes the five HTML-significant
  chars (`&` first) so untrusted PDF text can't emit stray tags when wrapped in `<mark>` via customTextRenderer.

**Tests added (+17, TDD red→green)**
- `escape-html.test.ts` ×5 (neutralizes injected tag; `&`-first ordering; all five chars; plain text untouched; empty).
- `highlight-match.test.ts` ×12 (single-item; multi-item; hasEOL-spanning; whitespace collapse; curly-quote fold;
  ligature ﬃ fold; repeated-text forward cursor; anchored-prefix degrade; no-match; sub-MIN ignored; document
  order non-overlapping; normalizeQuery folding). Assertions reconstruct the matched passage from ranges rather
  than hand-counting offsets.

**Gate (slice-local):** `vitest` 17/17 green; `biome check` clean; `tsc --noEmit` clean.

## 46.2 — Per-page highlight targets hook (2026-06-09)

**What changed (1 new file)**
- [src/components/lease/use-clause-highlights.ts](../../../src/components/lease/use-clause-highlights.ts) —
  `computeClauseHighlights(events, leaseId)` (pure, mirrors the `computeScanProgress` pattern) + `useClauseHighlights()`.
  Joins the latest `extract_clauses` (text + page) with the last-wins `grade_clause_severity` (severity), keeps
  only graded clauses (the red flags), groups by page in clause_index order, and gates on scan-complete
  (`computeScanProgress(...).phase === 'complete'`). Reuses `partitionByLatestExtract` + the same lease filter
  RedFlagReport uses, so highlights can't disagree with the cards.

**Tests added (+6, TDD red→green)**
- `use-clause-highlights.test.ts` ×6 (group by page w/ text+severity; last-wins re-grade; exclude ungraded/errored;
  ignore prior-lease clause; nothing until scan complete; order within page by clause_index).

**Gate (slice-local):** `vitest` 6/6 green; `biome check` clean.

## 46.3 — PdfHighlightContext + wiring (2026-06-09)

**What changed (1 new file, 2 edits)**
- [src/components/lease/PdfHighlightContext.tsx](../../../src/components/lease/PdfHighlightContext.tsx) — new
  provider owning `showHighlights` (default true), `severityFilter` (default `{high,medium}` on; low/ok off),
  `hoveredClauseId`, plus `toggleSeverity` / `isSeverityVisible`. Deliberately separate from LeaseParserContext
  (parser DATA) and ChatStreamContext (chat-only, pinned). Click-focus reuses the existing `activeClauseId`.
- [src/components/lease/ParserResultsShell.tsx](../../../src/components/lease/ParserResultsShell.tsx) — mounts
  `PdfHighlightProvider` under `LeaseParserProvider`, around `ChatStreamProvider`. The pinned three-provider
  order (AssistantFab → LeaseParser → ChatStream) is preserved.
- [src/components/chat/test-helpers.tsx](../../../src/components/chat/test-helpers.tsx) — `withChatStream` now
  includes `PdfHighlightProvider` so component tests using the shared harness get the new context.

**Tests added (+6, TDD red→green)**
- `PdfHighlightContext.test.tsx` ×6 (defaults; master toggle; per-severity toggle; hover tracking;
  `isSeverityVisible` = master AND filter; throws outside provider).

**Gate (slice-local):** `biome` clean; `tsc --noEmit` clean; **full suite 1305 passed / 150 files** (+12 across
46.1–46.3, no regressions) — confirms the shared `withChatStream` edit and the pinned `ChatStreamContext`
exposed-keys test both stay green.

## 46.4 — Render marks via customTextRenderer + severity CSS + fallback (2026-06-10)

**What changed (1 new file, 4 edits)**
- [src/components/lease/highlight-render.ts](../../../src/components/lease/highlight-render.ts) — pure render
  helpers: `buildItemHtml` (escape every segment, wrap matched ranges in `<mark class data-clause-id
  data-severity data-hl-first aria-label>`), `computePageItemMarks` (match all page targets once → bucket by
  item; filter which to emit; flag each clause's first fragment for the icon), `buildHighlightLabel`.
- [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — consumes
  `useClauseHighlights` + `useHighlightSettings`; captures text-layer items per page via `onGetTextSuccess`
  (defensive read — pdfjs items are `TextItem | TextMarkedContent`); per-page memoized `customTextRenderer`
  whose identity changes on targets/filter/toggle so react-pdf re-runs it; per-`(page,items,targets,filter)`
  mark cache so the matcher runs once per text-layer pass, not per item; "highlights unavailable" notice for
  scanned pages.
- [src/components/lease/use-clause-highlights.ts](../../../src/components/lease/use-clause-highlights.ts) —
  `ClauseHighlightTarget` gains `clauseType` (drives the aria-label).
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-hl--{severity}` translucent tint (`color-mix` so
  the canvas text shows through the text-layer mark) + per-severity underline STYLE + an absolutely-positioned
  severity glyph on `[data-hl-first]` (icon channel that never shifts text-layer alignment). Three non-color
  channels: colour + underline shape + icon.
- [src/components/lease/PdfViewer.test.tsx](../../../src/components/lease/PdfViewer.test.tsx) — `wrap` now
  includes `PdfHighlightProvider` (the viewer consumes it).

**Tests added (+15, TDD red→green)**
- `highlight-render.test.ts` ×11 (escaped passthrough; mid-string wrap; attrs; quote-escaped attrs; ordering/
  clamp; `isFirst`; per-item marks; filtered-out severity; no-match; label build ×2).
- `PdfViewer.highlights.test.tsx` ×4 (high clause → severity `<mark>` + aria-label; Low hidden by default + text
  escaped; scanned page → unavailable notice; no marks before scan completes). Uses a richer react-pdf mock that
  simulates the text layer (calls `onGetTextSuccess`, renders items through `customTextRenderer`).

**Gate (slice-local):** `biome` clean; `tsc --noEmit` clean; **full suite 1320 passed / 152 files** (+15, no
regressions). Note: the severity tint / icon glyph need a browser visual pass (happy-dom can't render CSS); the
class/attr structure is unit-asserted.

## 46.5 — Active-clause emphasis (2026-06-10)

**What changed (2 edits)**
- [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — effect on
  `activeClauseId` queries `mark[data-clause-id="…"]` scoped to the instance's `scrollAreaRef`, scrolls the first
  match into view and toggles `ll-hl--pulse` (motion) or `ll-hl--active` (reduced-motion → static outline);
  cleans the classes on change/unmount. Highlights are persistent so the marks already exist — no rAF, no second
  timer (reuses RedFlagReport's 4s `activeClauseId` lifecycle). Helpers `cssEscape` + `prefersReducedMotion`.
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-hl--active` (static accent outline) and
  `.ll-hl--pulse` (accent outline + `ll-hl-pulse` keyframe, gated under `prefers-reduced-motion: no-preference`).

**Tests added (+3, TDD red→green)**
- `PdfViewer.highlights.test.tsx` ×3 (motion → scrollIntoView + `ll-hl--pulse`; reduced-motion → `ll-hl--active`,
  no pulse, `behavior:'auto'`; unknown clause → no scroll). `matchMedia` stubbed per test.

**Gate (slice-local):** `biome` clean; `tsc --noEmit` clean; viewer-highlight suite 7/7.

## 46.6 — Two-way hover linkage (2026-06-10)

**What changed (3 edits + 3 test-harness updates)**
- [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — delegated
  `onMouseOver`/`onMouseOut` + `onFocus`/`onBlur` on the scroll `<section>` read the nearest `[data-clause-id]`
  (marks can't carry inline handlers — react-pdf strips them) → `setHoveredClauseId`; an effect toggles
  `ll-hl--hover` on the hovered clause's marks (no scroll).
- [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) — cards set
  `hoveredClauseId` on enter/leave + focus/blur and emphasize themselves (`data-hovered`, accent ring) when
  hovered; active (the click ring) takes precedence over hover.
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-hl--hover` (lighter dashed accent outline, distinct
  from the solid active outline).
- Test harnesses that mount RedFlagReport now include `PdfHighlightProvider`: `RedFlagReport.test.tsx` (3
  wrappers) + `LeaseParserContext.test.tsx` (consumer-migration invariant test).

**Tests added (+2, TDD red→green)**
- `RedFlagReport.test.tsx` ×1 (card `data-hovered` flips on mouse-enter/leave).
- `PdfViewer.highlights.test.tsx` ×1 (mouse-over a mark → `ll-hl--hover`; mouse-out clears it; via `fireEvent`).

**Gate (slice-local):** `biome` clean; `tsc --noEmit` clean; **full suite 1325 passed / 152 files** (+5 across
46.5–46.6, no regressions).

## 46.7 — Highlight controls (2026-06-10)

**What changed (1 new file, 1 edit)**
- [src/components/lease/HighlightControls.tsx](../../../src/components/lease/HighlightControls.tsx) — master
  show/hide toggle + four severity chips (each a `SeverityBadge` = icon+text+colour, never colour alone).
  `aria-pressed` state, `min-h-11` (≥44px), `<fieldset>` group for the filters, polite `aria-live` status that
  announces the visibility summary. Self-gates on `useClauseHighlights().count > 0` so it never shows pre-scan.
- [src/components/lease/RedFlagsPaneHeader.tsx](../../../src/components/lease/RedFlagsPaneHeader.tsx) — renders
  `HighlightControls` in the right slot when the scan isn't in flight.

**Tests added (+6, TDD red→green)**
- `HighlightControls.test.tsx` ×6 (hidden until graded; defaults High+Med on / Low+OK off; master toggle flips
  + live status; severity toggle; disabled when hidden; chip carries text+icon not colour alone).

**Gate (slice-local):** `biome` clean; `tsc --noEmit` clean; **full suite 1331 / 153** (+6, no regressions).

## 46.8 — Regression + integration (2026-06-10)

**What changed (tests only)**
- [src/components/lease/PdfViewer.highlights.test.tsx](../../../src/components/lease/PdfViewer.highlights.test.tsx)
  — +2 regressions: highlights vanish after **Replace** (`resetParser` clears `toolEvents`/`activeLease` →
  `byPage` empties → marks gone); toggling a severity filter **re-renders** the marks (Low clause appears once
  enabled). These pin the "preserves parser state / doesn't couple" acceptance criterion and the renderer
  re-run path.

**Gate (slice-local):** viewer-highlight suite 10/10.

## Final gate sweep (2026-06-10)
- `npm run lint` — clean (350 files).
- `npm run typecheck` — clean.
- `npm test` — **1333 passed / 153 files** (+28 across sprint 46, no regressions; pinned `ChatStreamContext`
  exposed-keys invariant still green).
- `npm run build` — ✓ compiled successfully in ~10.6s.

## Deferred / needs manual QA
- **Browser visual pass** (happy-dom can't render CSS): the severity tint, the absolutely-positioned severity
  glyph (`[data-hl-first]::before`), the pulse, and the hover/active outlines. Structure + classes are
  unit-asserted; appearance is not.
- **Zoom alignment** is inherited from react-pdf re-running `customTextRenderer` on width change — verify in the
  browser (not unit-testable in happy-dom, which has no layout).
- **Keyboard-nav-TO-marks** (roving tabindex on highlights) is NOT implemented; marks carry `aria-label` for
  screen readers and the controls + cards are fully keyboard-operable. A focusable-marks pass is a follow-up.
- **Phase 5** (export highlighted PDF, OCR for scanned, confidence scores, stored bounding boxes) — out of scope.
