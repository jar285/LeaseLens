# Sprint 47 — implementation QA notes

Premium refinement of the Sprint 46 highlighter. One section per slice; gate sweep at the end.

## 47.1 — Refined static visual states (2026-06-10)
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-hl` now drives its tint via `--ll-color` +
  `--ll-alpha` custom props; passive opacities lowered (high .18 / med .20 / low .16 / ok .14); `radius 3px`;
  faint inset edge for definition; **per-severity underline removed** (severity still conveyed non-colour by the
  `::before` glyph + card badge + aria-label). `--hover` (.30) and `--active`/`--pulse` (.38) are alpha bumps —
  the ring/halo/glow moved to the frame overlay.
- No JS change → the existing class-application tests (`ll-hl--high/active/hover/pulse`) stay green.
- Gate: `biome` clean; highlight + RedFlag + controls suites green (53).

## 47.2 — Evidence-frame overlay (2026-06-10)
- [src/components/lease/PdfEvidenceOverlay.tsx](../../../src/components/lease/PdfEvidenceOverlay.tsx) (NEW) —
  computes the union bounding box of the active (and hovered) clause's mark rects in the scroll section's content
  space; renders one fill-less rounded frame per emphasized clause (`data-variant` active|hover). Direct child of
  the scroll `<section>` (NOT an `inset-0` wrapper, which would pin it to the viewport); recompute on selection,
  `effectivePageWidth`, and scroll (rAF-throttled, listener only while emphasized).
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-evidence-frame*`: severity tint via `--ll-color`;
  hover = 1px ring; active = 1px ring + 4px soft halo + low warm glow.
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — mounts the overlay as the section's
  last child.
- Tests (+4): frame present for active (clause/severity/variant attrs); cleared on deselect; absent when nothing
  active; hover variant on mark hover. (happy-dom rects are 0 → assert presence/attrs, not pixels.)
- Gate: `biome` clean; `tsc` clean; full suite 1337 / 153.

## 47.3 — Floating evidence label (2026-06-10)
- [PdfEvidenceOverlay.tsx](../../../src/components/lease/PdfEvidenceOverlay.tsx) — renders a `pdf-evidence-label`
  caption (`clauseLabel`, e.g. "Security deposit · §1") inside each frame.
- [src/app/globals.css](../../../src/app/globals.css) — `.ll-evidence-label`: warm glass pill (backdrop blur +
  parchment alpha + `--shadow-popover` + hairline border), positioned just above the clause's first line.
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — **relocated** the Phase-10.8 top
  sticky callout into the anchored label; removed the now-orphaned `CLAUSE_TYPE_LABEL`, `MapPin` import, and
  `activeLabel`/`activeClauseIndex` derivations (no test referenced the callout).
- Tests (+1): label shows the clause label for the active clause only.
- Gate: `biome` clean; `tsc` clean; full suite 1338 / 153.

## 47.4 — Motion polish (2026-06-10)
- [src/app/globals.css](../../../src/app/globals.css) — under `@media (prefers-reduced-motion: no-preference)`:
  frame `@starting-style` opacity fade-in; single `evidenceFocusPulse` on `--active` (plays once on mount →
  once per selection, no loop, settles to the resting halo); `evidenceReveal` opacity fade on `.ll-reveal .ll-hl`
  (`<mark>` is inline → opacity-only, no transform).
- [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) — one-shot `revealing` state on the
  scan's 0→N `count` transition (gated on motion); adds `ll-reveal` to the page container for one beat; never
  replays on zoom/filter (count is the graded total).
- Tests (+2): reveal class added under motion; absent under reduced-motion.
- Gate: `biome` clean; `tsc` clean; full suite 1340 / 153.

## 47.5 — Controls polish + a11y + gate sweep (2026-06-10)
- [HighlightControls.tsx](../../../src/components/lease/HighlightControls.tsx) — dynamic `aria-label`
  (Show/Hide highlights) on the master toggle; pressed severity chips now carry a faint accent ring (selected
  state no longer opacity-alone). Behavior unchanged → existing 6 control tests green.

## Final gate sweep (2026-06-10)
- `npm run lint` — clean (351 files).
- `npm run typecheck` — clean.
- `npm test` — **1340 passed / 153 files** (+9 across sprint 47; pinned `ChatStreamContext` invariant green).
- `npm run build` — ✓ compiled successfully (~8.3s).

## Deferred / needs manual QA (browser — happy-dom can't render CSS)
- Visual judgment of the calm passive tint, the cohesive frame halo/glow, the glass label, the single focus
  pulse, and the reveal fade — all unit-asserted by class/attribute/presence only.
- **Frame ↔ mark alignment under zoom/scroll** (rect math) — verify in `npm run dev`.
- Minor: a one-frame reveal flicker is possible (marks paint at opacity 1 before `ll-reveal` applies) — check.
- Label placement when a clause sits at the very top of the scroll content (caption translates above it).
- Keyboard-nav TO marks (roving tabindex) still deferred from Sprint 46.
