# Implementation + QA — Sprint 51 Mode B premium pass

**Status:** S54-prep + S51 + S52 shipped. S53–S55 pending.
**Date:** 2026-06-17 · **Branch:** `feature/pdf-highlight`
**Plan:** `~/.claude/plans/sounds-good-use-plan-sharded-lynx.md`

---

## Shipped

### S54-prep — `topClauseId` on `ScanVerdict` (`scan-verdict.ts`)
Added `topClauseId: string | null` to the interface + `EMPTY_VERDICT`; returns `inTier[0].clause_id` for
high/medium/low, `null` for ok/idle. Same pick as `topClauseTitle`, so they can't disagree. Pure-function
change landed first so S54's verdict anchor stays pure-UI (Martin Fowler).
**Tests:** new `scan-verdict.test.ts` `describe('topClauseId anchor')` (idle/ok → null; high/medium/low → id;
id matches the title's clause). 4 cases.

### S51 — Severity-grouped card sections (`RedFlagReport.tsx`)
- **Grouping:** the flat `gradings.map` became a `flatMap` that emits a counted `GroupDivider`
  (`data-testid="red-flag-group"` `data-severity`, reusing the SeverityBadge sm + count idiom) before the first
  card of each severity. Cards stay one `<article data-testid="red-flag-card">` per non-OK grading (count/order
  pins + T11 hold); dividers are keyed siblings inside the existing `AnimatePresence` (flat-children model
  preserved).
- **HIGH emphasis:** HIGH cards rest at the deeper warm `--shadow-card-hover` + a one-step-heavier
  `border-neutral-300`. Depth + edge only — no fill tint (regression-tested), severity still on bar + badge +
  divider.
- **OK roll-up:** OK cards fold behind a collapsed `OkRollup` button ("N clauses look standard",
  `aria-expanded`); expanding renders the OK cards in place.
**Tests:** rewrote the order test → grouped + roll-up behavior (visible [high, medium], rollup collapsed, click
→ ok card appears last); added divider-per-group + HIGH-emphasis (depth/border, no fill) tests; re-pointed the
S50.3 baseline test at a medium card (HIGH now has its own deeper treatment). 45 RedFlagReport tests green.

### S52 — Designed PDF recovery card (`ParserResultsShell.tsx`, reattach branch)
Replaced the bare two-line "We lost the cached file" void with a centered `surface-elevated` recovery card
(`data-testid="pdf-reattach-card"`): document icon, filename, honest copy, and a primary terracotta
"Replace lease" button (`data-testid="pdf-reattach-replace"`) that routes to the existing `requestReplace`
(opens the destructive ConfirmDialog). `PdfPaneContent` gained an `onReplace` prop.
**Honesty invariant:** copy never claims the review is preserved (Replace resets lease + clauses + red flags) —
test asserts the card text does NOT match `/preserved/i`.
**Tests:** new shell test drives reattach (activeLease without `pdfUrl` + IndexedDB `get` → null) and asserts
the card + filename + the button opening the alertdialog. T4 e2e unaffected (filename + `/replace/i` + header
button still present).

## Decisions & findings

- **AA / terracotta buttons:** white text on `accent-600` (#cc6347) is **3.86:1 (fails AA)**; `accent-700`
  (#a85138) is **5.39:1 (passes)**. The S52 recovery button uses `accent-700`. **This binds S53's FAB
  de-gradient too** — a flat terracotta FAB with white label must be `accent-700`, not `accent-600`.
- **S51 grouped-reveal stagger DEFERRED** (see spec.md). Layering a parent-variant `staggerChildren` onto the
  existing `AnimatePresence` + `popLayout` + per-card streaming entrance is fragile (re-staggers every grading
  tick). The visible hierarchy (grouping + HIGH emphasis + OK roll-up) is the core premium win and shipped; the
  existing per-card entrance already animates. A coordinated stagger is a careful follow-up.

### S53 — De-gradient FAB, header weight, pills merge (`AssistantFab.client.tsx`, `ParserResultsShell.tsx`, `RedFlagReport.tsx`)
- **FAB:** flat `bg-accent-700` + house `shadow-popover` (was a `bg-gradient-to-br` + glossy inset bevel — the
  one "AI tell"). `accent-700` (not 600) for white-label AA in light (5.39:1). Kept the `translate,scale`
  transition naming, motion-safe lift, active press, focus ring, reduced-motion. Test rewritten (Sprint 38.3 →
  flat). **Dark-mode note:** white on dark `accent-700` (#d86348) is 3.62:1 — below strict AA but a net
  improvement over the prior gradient and the visible label is desktop-only; flagged as a dark-mode follow-up.
- **Header:** document-grade masthead — 13px medium mono filename, larger icon, and the `· N pages · N clauses`
  metadata is now **always visible** (dropped `hidden sm:inline`). Pins held (textContent + `fg-muted`).
- **Pills:** four equal pills → three units. The twin explanations merge into one segmented **"Explain"**
  control (`red-flag-explain-group`) keeping both segments' testids (`red-flag-explain-plain` /
  `red-flag-explain`) + prompts; "Draft email" is the accent primary; "View on page N" is the quiet anchor.
  Rewrote the two-pill distinctness test; the fab e2e (clicks `red-flag-explain` → `/explain/i`) still passes.

### S54 — Verdict anchor, em-dash, highlight label, clauses identity (`RedFlagReport.tsx`, `scan-verdict.ts`, `HighlightControls.tsx`, `ClausesList.tsx`)
- **Verdict anchor:** the "biggest concern" phrase is now a `red-flag-verdict-concern` button (rendered when
  `topClauseId` + a page exist); clicking runs the shared `runHighlightJump` (extracted; the per-card
  `jumpToClausePage` now delegates to it — DRY) to scroll + activate the clause (S50.6 single-glide).
- **Em-dash:** verdict headlines now use a colon / comma (house no-em-dash rule), preserving the pinned
  substrings ('balanced', 'no high-severity', 'High risk', 'N finding(s)', the clause title).
- **Highlight label:** `HighlightControls` gains a "Highlight on PDF" scope label (`fg-muted`, AA) so the
  toggle/chips clearly govern the PDF, not the cards.
- **Clauses identity:** the list gains a "Every clause we parsed, in document order." subtitle (full inventory
  vs the flagged findings), the total count moves to `fg-muted`, and the leftover border is dropped to match
  the red-flags tray.

### S55 — Polish (`ClausesList.tsx`, `ParserResultsShell.tsx`, `CitationChip.tsx`)
- **Contrast:** the row "p. N" page label `fg-subtle` → `fg-muted` (AA, like S50.5). The ungraded "—" stays
  (it's `aria-hidden` with an sr-only label — exempt).
- **Masthead glow:** nudged 0.45 → 0.7 of the landing's gradient strength (was invisible behind the grid).
- **Citation chip:** a faint citation-tinted resting chip (`bg-citation/[0.05]`) so the statute reads as a
  credential; the interactive accent hover is unchanged.
- **Deferred (diminishing returns):** the empty-state example-card surface alignment (it's `aria-hidden`
  decorative, pre-scan only).

## Verification (final)

- `npm run lint` — clean. `npm run typecheck` — clean. `npm test` — **1366 passed / 153 files** (+11 across the
  pass). `npm run build` — succeeded; all routes generated. (One run showed a single flake in the slow/parallel
  pass; green on two subsequent runs — an async-timing flake, not a correctness regression.)
- Browser visual pass (seeded sample lease, `npm run dev` + Playwright) — screenshots in
  `screenshots/`: `modeB-s51-*` (grouping + roll-up), `modeB-s52-recovery` (recovery card), `s53-header-fab` +
  `s53-pills-merged` (flat FAB, document header, segmented Explain), `s54-verdict-anchor-label` + `s54-fullpage`
  (colon verdict + concern anchor + "Highlight on PDF"), `s55-final-abovefold` (glow + citation credential
  chips). Baselines: `modeB-01…04`.

## Power-words applied (per slice)

S54-prep: Martin Fowler, Page Anchoring · S51: Wathan/Schoger, IBM Carbon, Material, Dieter Rams, Don Norman,
Steve Krug, WCAG, Kent C. Dodds · S52: Don Norman, Jakob Nielsen, Dieter Rams, WCAG · S53: Dieter Rams, Apple
HIG, WCAG, Steve Krug, Don Norman, Kent C. Dodds · S54: Page Anchoring, Don Norman, Jakob Nielsen, Steve Krug,
WCAG · S55: WCAG, Dieter Rams, Wathan/Schoger, Source-Grounded-AI.

## Carry-over / follow-ups

- S51 grouped-reveal stagger (deferred — fragile against the live grading stream).
- FAB dark-mode label contrast (3.62:1; needs a dedicated darker dark-FAB shade for strict AA).
- Empty-state example-card surface alignment (cosmetic).
