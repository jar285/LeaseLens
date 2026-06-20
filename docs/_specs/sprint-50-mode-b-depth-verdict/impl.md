# Implementation + QA — Sprint 50: Mode B depth + verdict moment

**Sprint:** 50
**Status:** Complete
**Date:** 2026-06-16
**Branch:** `feature/pdf-highlight`
**Method:** spec → spec-QA → TDD per slice → gate sweep. See `spec.md`, `spec-qa.md`.

---

## What shipped, by slice

### S50.1 — Warm depth tokens (`src/app/globals.css`)
Added `--shadow-card` (resting) + `--shadow-card-hover`, reusing the palette's warm brown `rgb(40 28 16 …)`
(the same hue as `--shadow-popover`), with black-based dark-mode overrides so the lift still reads on espresso
surfaces. `--shadow-lift` (cold grey) is left in place for its existing non-card callsites. Tailwind v4
auto-emits `shadow-card` / `hover:shadow-card-hover` utilities from the `--shadow-*` keys.
*No behaviour; verified by consumption in S50.3 + the build.*

### S50.2 — Verdict moment (`RedFlagReport.tsx`, `SeverityBadge.tsx`)
The `red-flag-verdict` headline now reads as an outcome. Wrapped it in a `relative isolate` region carrying:
- **`VerdictHalo`** — a soft tier-tinted radial wash behind the headline (`-z-10`, `aria-hidden`,
  `pointer-events-none`), tier→colour via `VERDICT_TIER_VAR` (the same semantic tokens as the card bar/badge).
- **`VerdictTierGlyph`** — the severity glyph, reusing `SEVERITY_ICON` now **exported** from `SeverityBadge.tsx`
  (one source of truth; spec-QA M1). `aria-hidden`, so the headline words stay the accessible name.
- **`data-tier`** on the verdict element (and region + halo + glyph), reflecting `computeScanVerdict().tier`.

Severity is carried by words + glyph + a colour wash, never colour alone (WCAG). The existing one-shot settle
and editorial classes (`font-serif`/`font-bold`/`tracking-tight`) are preserved.
**Tests (RedFlagReport.test.tsx, new `describe('Sprint 50.2 …')`):** data-tier high; data-tier ok; halo is
`aria-hidden` + non-interactive + tiered; tier conveyed by glyph + words; editorial typography preserved.

### S50.3 — Card object quality (`RedFlagReport.tsx`, `ParserResultsShell.tsx`, `ClausesList.tsx`)
Root cause of "flat/lifeless": cards were `bg-surface-card` inside a `bg-surface-card` section (cream-on-cream,
zero figure-ground). Fix:
- Red-flag cards now rest on `bg-surface-elevated` (the only surface lighter than base) with `shadow-card`,
  deepening to `hover:shadow-card-hover`. Border kept for a crisp edge. **No fill tint** (user decision).
- The red-flags + clauses sections shed their panel border, becoming quiet vellum trays so the elevated cards
  are the only objects (also clears the nested-card smell).
**Test:** `Sprint 50.3 — red-flag cards lift onto an elevated surface with a warm shadow` (asserts elevated
surface + warm shadow + `hover:shadow-card-hover`, and **no** `bg-danger/warning/info/success` fill tint).

### S50.4 — Masthead glow (`ParserResultsShell.tsx`)
Shell root gains `relative isolate`; a top-anchored `ResultsMastheadGlow` (`-z-10`, `aria-hidden`,
`pointer-events-none`) carries Mode A's `--accent-ambient-*` terracotta field across the seam as page
atmosphere at ~45% of the landing's gradient strength, fading before the grid. It does not penetrate the
opaque panels, so it never touches text contrast. Pure CSS (static under reduced motion).
**Test:** `Sprint 50.4 — renders a decorative masthead glow behind the workspace` (root has `isolate`; glow is
`aria-hidden` + `pointer-events-none`).

### S50.5 — Contrast (`ParserResultsShell.tsx`)
The results-header metadata moved from `text-fg-subtle` (#a8997e ≈ **2.26:1** on the cream card — fails WCAG AA
for its 11px size) to `text-fg-muted` (≈ **6.46:1**). The card body reasoning text already passed AA
(6.46:1); its washed-out feel was figure-ground, addressed by S50.3.
**Test:** `Sprint 50.5 — header metadata uses an AA-contrast token (fg-muted, not fg-subtle)`.

**Coordinated reveal — deliberately deferred (spec-QA M3 escape hatch).** The scan-complete reveal the user
asked about already plays and is bounded: per-card `SPRING_GENTLE` entrance, the Sprint 43.4 capped clause
cascade, the verdict one-shot settle, and the `.ll-reveal` PDF paint-on. Introducing a single orchestrator
would add latency and regression risk (and the `STAGGER` token's own comment warns against withholding
high-severity content) for no real gain. Shipped contrast-only; the existing motion stands.

### S50.6 — One smooth glide on clause jump (`PdfViewer.client.tsx`)
**Reported follow-up (2026-06-16):** clicking a red flag jumped to the PDF section but felt instant/cluttery,
with no smooth transition.

**Root cause:** a single click fired *two* competing scrolls. `jumpToClausePage` called
`pdfViewerRef.scrollToPage(N)` (smooth-scroll page top → pane top, `block:'start'`) *and* set `activeClauseId`,
which ~a frame later triggered the Sprint 46.5 effect that smooth-scrolled the matched highlight to centre
(`block:'center'`). The second `scrollIntoView` interrupted the first mid-flight — the stutter the user saw.
Page nav felt fine because it only fires the first scroll.

**Fix (user-chosen "one glide to the highlight"):** the viewer's `activeClauseId` effect is now the single
animated scroll. The imperative `scrollToPage` no longer scrolls — it *records* the target page
(`pendingClauseScrollPageRef`); the effect performs one scroll: highlight-centre if a mark exists, else the
recorded page (`block:'start'`), reduced-motion aware. Page navigation (Prev/Next/keyboard) keeps its own
synchronous `scrollToPageNumber` path, untouched.

This **preserves the tested contract** — `jumpToClausePage` / `handleRowClick` / `CitationChip` still call
`scrollToPage(N)` (so the RedFlagReport + integration spy tests stay green); only what the viewer does with
that call changed. Covers graded red flags (mark-centre), graded no-mark clauses, and non-graded clause rows
(recorded-page fallback) with a single scroll each.
**Tests (PdfViewer.test.tsx, `describe('Sprint 50.6 …')`):** `scrollToPage` records without scrolling; an
active clause with no matched mark performs exactly ONE scroll to the recorded page (`behavior:'smooth'`,
`block:'start'`). Page-nav scroll tests remain green (separate path).

---

## QA verdict

**Spec alignment:** Full. All five slices landed as specified; the one deferral (S50.5 reveal) used the
escape hatch the spec/spec-QA explicitly authorised, and is documented above.

**Invariants held:**
- Severity never colour-alone — verdict (words + glyph + wash) and cards (bar + badge) both keep ≥2 non-colour
  channels; halo/glow are `aria-hidden`.
- No full-card severity fill tint — pinned by a negative assertion in the S50.3 test.
- `red-flag-verdict` testid + editorial classes preserved — covered by the retained Sprint 33.B / 35.1 tests.
- Decorative layers `aria-hidden` + `pointer-events-none` + behind content; pure CSS so reduced-motion safe.
- No parser/chat state-ownership or provider-order changes.

**Drift observed:** None. `surface-elevated` is used as a resting card surface (an extension of its
"floating/lifts" purpose, spec-QA L1); noted in the CLAUDE.md token comment. No new dependencies.

**Tests added:** 9 (5 verdict-moment + 1 card-object-quality in `RedFlagReport.test.tsx`; 1 glow + 1 contrast
in `ParserResultsShell.test.tsx`; 2 single-scroll in `PdfViewer.test.tsx`).

**Verification (all green):**
- `npm run lint` — clean (352 files; one Biome format auto-fix applied to globals.css).
- `npm run typecheck` — clean (`verdict.tier` narrows to `Severity` after the `!== 'idle'` guard).
- `npm test` — **1355 passed / 153 files** (includes the 2 S50.6 single-scroll tests).
- `npm run build` — succeeded; all routes generated.

**Carry-over / diminishing returns:** None required. Optional future polish (not this sprint): a dedicated
`--color-surface-raised` alias if token purity is wanted; a coordinated reveal only if a measured need appears.
A `npm run dev` visual pass against the seeded sample lease is recommended before merge (warm card depth,
verdict halo per tier, masthead glow).
