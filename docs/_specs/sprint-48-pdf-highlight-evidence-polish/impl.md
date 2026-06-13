# Sprint 48 — implementation QA notes

Second premium pass on the highlighter (no rebuild; refine-in-place). One section per slice.

## 48.1 — Calmer passive + softer glow + richer label + selected-evidence focus (2026-06-10)
- [src/app/globals.css](../../../src/app/globals.css) — passive `--ll-alpha` lowered (high .14 / med .13 / low .12
  / ok .10); inset edge 26→20%; hover .30→.24, active .38→.32; **softer active frame** (ring 60→55, halo
  15→11%, glow 22→14% + tighter radius) and matching `evidenceFocusPulse` 100%. New **`.ll-focus-mode`**: while a
  clause is active the page container dims non-active passive marks to `opacity .5` (active/hover stay 1), with a
  150ms opacity transition gated under no-preference.
- [PdfEvidenceOverlay.tsx](../../../src/components/lease/PdfEvidenceOverlay.tsx) — label now reads
  "Type · §N · {concern}" (severity in text); `SEVERITY_CONCERN` promoted to [grading.ts](../../../src/components/lease/grading.ts).
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — adds `ll-focus-mode` to the page
  container while `activeClauseId` is set.
- Tests (+1, 1 updated): focus-mode class toggles with active; label text updated to include "High concern".

## 48.2 — Turnitin-style evidence gutter (2026-06-10)
- [src/components/lease/PdfEvidenceGutter.tsx](../../../src/components/lease/PdfEvidenceGutter.tsx) (NEW) — one
  small severity stud per VISIBLE red-flagged clause, measured in section content-space (direct absolute children
  of the scroll section, so they scroll with the pages — no scroll listener; re-measure on clause-set/filter/zoom
  only). Each is a `<button aria-label="Jump to …">`; click → `setActiveClauseId` (viewer scrolls + frames it).
  Severity carried by a shape glyph (▲◆●✓) + colour.
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-gutter-marker*` (16px stud, severity ring + tinted
  fill + glyph, focus ring, reduced-motion-gated hover scale).
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — mounts the gutter beside the overlay.
- Tests (+3): one marker per visible clause (Low hidden); click activates the clause (frame appears); no markers
  when highlights hidden.

## 48.4 — Ghosted-text fix (after first browser pass) (2026-06-10)
**Symptom (user screenshot):** text inside a highlight rendered DOUBLED/ghosted ("Tenant shall provide…"
overlapping itself); non-highlighted paragraphs were crisp.
**Root cause:** react-pdf's `TextLayer.css` zeroes the colour only on `.textLayer :is(span, br)` — NOT on our
injected `<mark>`. The UA stylesheet gives `<mark>` an opaque text colour, so the (imperfectly-aligned)
transparent text-layer glyphs became visible on top of the canvas glyphs. This bug existed since Sprint 46;
unit tests never caught it because happy-dom doesn't paint the canvas/text-layer (the browser-visual gap we
flagged each sprint).
**Fix** ([globals.css](../../../src/app/globals.css)): `.ll-hl { color: transparent }` (keep the mark as
transparent as its parent span → canvas is the single source of glyphs, only the tint film shows). Also removed
the per-line inset edge from passive (it boxed every wrapped line — the "clutter"); passive is now a clean
continuous tint film, and the crisp edge belongs to the ACTIVE frame only. Load-bearing WHY comment added.
- Gate: lint clean; typecheck clean; `npm test` **1344 / 153**; `npm run build` ✓ ~6.9s.
- Still requires a browser re-check (CSS not paintable in happy-dom).

> Note: the terminal `grade_clause_severity tool.execute_failed` is a backend SCAN error for one clause
> (citation grounding / model), unrelated to the highlight UI — that clause simply isn't graded, so it gets no
> highlight (surfaced as `ungradedCount` in RedFlagReport). Not introduced by Sprint 46–48.

## 48.5 — Continuous "ribbon" passive highlight (2026-06-10)
**Direction (user):** keep EXACT text-layer matching (no paragraph/block highlighting); passive marks should read
as a soft continuous phrase ribbon, not word-by-word chips, not paragraph boxes. Active framing stays the
premium moment.
**Why it was fragmenting:** the sample lease's clauses store per-word-spaced text ("TERM.   The   lease"),
confirming pdfjs emits one text item per word → a clause becomes many adjacent `<mark>`s with the inter-word gap
untinted → "word chips".
**Fix** ([globals.css](../../../src/app/globals.css) `.ll-hl`): `padding-inline: 0.16em` + `margin-inline:
-0.16em` (bleeds the tint to meet the neighbouring word while the equal negative margin cancels the layout shift,
so the transparent glyphs stay aligned to the canvas) + `box-decoration-break: clone` (each wrapped line is a
clean ribbon segment, not a box with odd corners). Still exact evidence — only matched words tint; the bleed just
closes the seams. em-based so it scales with zoom.
- Gate: lint clean (352 files); typecheck clean; `npm test` **1344 / 153**; `npm run build` ✓ ~6.7s.

### Browser-QA status (honest)
Could not run a faithful automated browser pass: a fresh Playwright context can't see the user's in-browser
scanned lease (PDF lives in their IndexedDB + an in-memory Blob URL), and reproducing it headlessly hits a deep
chain (demo-user provisioning via `ensureDemoUsersExist`, workspace/session cookie encoding, IndexedDB Blob
injection for the sample lease, react-pdf worker + text-layer timing in headless). The ribbon fix is grounded in
the confirmed per-word data; the 6 visual points are reasoned + unit-test-backed below and should be confirmed in
the running dev. Per-point: (1) word-by-word → fixed by bleed; (2) multi-line continuity → box-decoration-break
clone; (3) active frame unify → union-box overlay (unit-tested); (4) gutter declutter → one stud per visible
clause (unit-tested); (5) zoom/scroll → text-layer marks reflow free + em-based bleed + content-space frame/gutter
recompute on width; (6) readability → 14% max alpha + transparent mark text (the 48.4 doubling fix).

## 48.3 — Gate sweep + docs (2026-06-10)
- Controls left as-is (already premium from 47.5: pressed-chip ring + dynamic toggle aria-label).
- `npm run lint` — clean (352 files); `npm run typecheck` — clean; `npm test` — **1344 passed / 153 files**
  (+4 across sprint 48, no regressions; pinned `ChatStreamContext` invariant green); `npm run build` — ✓ ~7.7s.

## Deferred / needs manual QA (browser — happy-dom can't render CSS)
- Visual judgment of the calmer tints, the softer frame glow, the glass label, the focus-dim, and gutter
  appearance — all unit-asserted by class/attribute/presence only.
- **Gutter vertical alignment under zoom/scroll** and at fit-width vs zoomed (markers sit at `right: 4px` in
  content space; verify they stay in the gutter when horizontally scrolled while zoomed).
- Gutter marker touch size is ~16px (intentional scan stud, below 44px) — the cards remain the primary large
  target; confirm it feels right on touch.
- Keyboard-nav TO inline marks (roving tabindex) still deferred; gutter markers ARE keyboard-focusable buttons.
