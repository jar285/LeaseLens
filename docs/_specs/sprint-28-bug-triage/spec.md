# Sprint 28 — Bug Triage (Bug 1 Follow-Through · Window-Scroll Pivot · Sticky PDF · z-index Tokens)

**Status:** Implemented locally on `feature/cockpit`, awaiting commit.
**Date range:** 2026-05-24 → 2026-05-26.
**Branch:** `feature/cockpit` (continuation from Sprint 27).
**Parent plan:** [`~/.claude/plans/leaselens-bug-triage-synchronous-hoare.md`](../../../).
**Predecessor:** [Sprint 27 — Production Pivot](../sprint-27-production-pivot/spec.md).

> **Read this first if you're picking the session back up.** Sprint 28 began as a tight three-bug triage (blank scroll area, stuck scan animation, "New conversation" wiping the workspace). Sprints 28.1–28.10 closed the original triage. Sprints 28.11–28.15 fixed three more layered root causes that emerged once the obvious blank-scroll fix was in: a Tailwind v4 token-emission bug, a CSS positioning-context escape, and a deliberate spec pivot from viewport-clamp to window-scroll. This spec covers the 28.11→28.15 arc; the earlier sub-sprints are documented inside the parent plan file.

---

## 1. Problem

After Sprint 28.10 committed the first attempt at Bug 1 (an `h-28` sentinel as the last scrollable child of the right pane), the user re-tested and reported:

1. **Bug 1 was still visible.** The sentinel was geometrically equivalent to the `pb-28` it replaced — both inflated the right pane's `scrollHeight` by 112px any time content overflowed, leaving 112px of dead space below the last card.
2. **A larger window-level scroll persisted.** Even after removing the sentinel, the document was scrolling ~1800px past viewport. The `<main>` element with `h-dvh overflow-hidden grid-rows-[auto_minmax(0,1fr)]` looked like a viewport clamp, but in this Tailwind v4 build, `.h-dvh` emitted an **empty rule body** (`{ }`), so the clamp was silently a no-op. `<main>` defaulted to `height: auto` and grew to the intrinsic height of the PDF viewer + cards (2782px on a 900px viewport).
3. **Even after the `h-screen` substitution restored the clamp, the document still scrolled.** Tailwind's `.sr-only` utility uses `position: absolute clip: rect(0,0,0,0)`. With **no positioned ancestor** between the sr-only spans and `<html>`, the spans' containing block was the viewport — they escaped `<main>`'s `overflow: hidden` and contributed ~1700px to `documentElement.scrollHeight`.
4. **After the user verified the clamp worked, they changed their mind.** They preferred a window-scroll workspace where the page flows naturally rather than panes scrolling internally. This was a deliberate spec change — §1.6's "the page itself must not scroll" invariant was dropped.
5. **The window-scroll layout exposed an uneven-column problem.** PDF (~1500px) was much shorter than red flags + clauses (~2600px). CSS Grid's default `align-items: stretch` made the left cell extend to the row height, leaving cream-colored empty space below the PDF as the user scrolled.
6. **The sticky PDF fix exposed a hidden stacking-context bug.** Red-flag cards painted over the sticky page header where they overlapped. Root cause: `.z-raised`, `.z-overlay`, `.z-toast`, `.z-dialog` Tailwind utilities were silently emitting no CSS rules — Tailwind v4 only auto-generates utilities from its known token namespaces, and `--z-*` is not one of them. All seven production callsites had been silently broken since Sprint 23a; they "worked" only when default stacking happened to align.

---

## 2. Invariants

Carried from the parent plan and earlier sprints:

1. **No fabricated function or file names.** Every fix was preceded by a read of the actual code path.
2. **Every behavior change ships with a test.** TDD red-first for each sub-sprint.
3. **No skipped tests, no `xit` / `describe.skip`.** Final count: 1036/1036 across 122 files (was 1037; one consolidated layout assertion).
4. **Painless setup preserved.** No new env vars; `.env.example` unchanged.
5. **Smallest principled fix at each layer.** Each sub-sprint touches the smallest set of files that resolves a real root cause.
6. **No new TODOs / dead code introduced.**
7. **WCAG AA preserved.** Sticky header still announces, focus management unchanged, `prefers-reduced-motion` honored.
8. **Spec drift escalated, not silently changed.** Sprint 28.13 dropped §1.6 "the page itself must not scroll" after explicit user direction.

---

## 3. Sub-sprints (28.11 → 28.15)

Each sub-sprint = single-purpose, TDD red→green→cross-suite verify.

### 28.11 — `scroll-padding-bottom` for FAB clearance

**Problem.** Sprint 28.10's `h-28` sentinel inside `results-stack` permanently inflated scrollHeight by 112px once content overflowed. Geometrically equivalent to the `pb-28` it replaced.

**Fix.** Replace the sentinel with `scroll-pb-28` on the scroll container. `scroll-padding-bottom: 7rem` lets `scrollIntoView` land citation targets above the floating FAB without inflating the content's scrollable height — so manual scroll terminates flush with the last card.

**Files.** [`src/components/lease/ParserResultsShell.tsx`](../../../src/components/lease/ParserResultsShell.tsx), [`src/components/lease/ParserResultsShell.test.tsx`](../../../src/components/lease/ParserResultsShell.test.tsx).

### 28.12 — Repair viewport clamp (`h-dvh` empty rule + sr-only escape)

**Problem.** `.h-dvh` emitted `{}` in this Tailwind v4 build — the entire viewport clamp was silently broken. Even after switching to `h-screen`, sr-only spans (Tailwind's standard `position: absolute clip: rect(0,0,0,0)` pattern) escaped overflow:hidden because no positioned ancestor below `<html>` existed to contain them.

**Fix.** Two changes in [`src/app/page.tsx`](../../../src/app/page.tsx):
1. `h-dvh` → `h-screen` (emits `height: 100vh` reliably).
2. Add `relative` to `<main>` so it becomes the containing block for descendant `position: absolute` elements.

Also `h-dvh` → `h-screen` in [`src/components/layout/PageShell.tsx`](../../../src/components/layout/PageShell.tsx) (shared primitive used by future pages); paired unit-test update in [`PageShell.test.tsx`](../../../src/components/layout/PageShell.test.tsx).

**Numbers.** `<main>` height 2782px → 900px ✓. `documentElement.scrollHeight` 2782 → 900 ✓. `window.scrollTo(0,5000)` lands at 0 (no window scroll) ✓.

### 28.13 — Drop viewport clamp; restore window scroll (spec change)

**Problem.** User preferred window-scroll behavior after seeing the clamp work. Asked explicitly via AskUserQuestion with three options laid out as ASCII previews; picked "Full window scroll (one long page)".

**Fix.** Drop the height/overflow chain end-to-end:
- `<main>`: `h-screen ... grid-rows-[auto_minmax(0,1fr)] overflow-hidden` → `min-h-screen`. Keep `relative` (still needed for sr-only spans).
- `<header>`: add `sticky top-0` so brand/role/theme stay accessible during deep scroll.
- `<html>`: add `scroll-padding-top: 5rem` in [`globals.css`](../../../src/app/globals.css) so `scrollIntoView` lands targets below the sticky header.
- [`ParserResultsShell.tsx`](../../../src/components/lease/ParserResultsShell.tsx): drop every height/overflow class — outer shell, grid body, both panes flow naturally with the window.
- Tests: rewrite Sprint 28.11 layout-invariants block in [`ParserResultsShell.test.tsx`](../../../src/components/lease/ParserResultsShell.test.tsx); invert the existing "no window scroll" e2e regression test in [`tests/e2e/parser-results.spec.ts`](../../../tests/e2e/parser-results.spec.ts) to assert `scrollHeight > innerHeight + 200` and that the sticky header stays at viewport top.

**Spec drift logged.** §1.6 invariant "the page itself must not scroll; scroll must live inside named scroll containers" is dropped for the parser workspace.

### 28.14 — Sticky-on-desktop PDF column

**Problem.** With window-scroll active, the grid row stretched to the taller pane (right side at ~2600px). The left cell (PDF, ~1500px) was visually stretched to match, leaving empty `bg-surface-card` cream below the PDF as the user scrolled deep — "out of bounds" the user reported.

**Fix.** On the `results-pdf-pane` `<section>`: `self-start` (don't stretch with the row) plus, only at `lg:` and above, `lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-hidden`. The bounded height at lg+ also restores PdfViewer's existing internal scroll chain (`h-full + min-h-0 + flex-1 + overflow-auto`), so the user pages the PDF inside the sticky pane while the right column scrolls past with the window. Mobile drops sticky entirely — panes stack and flow naturally.

**Numbers.** scrollY=0 → pdf-pane y=143; scrollY=1200 → pdf-pane y=80 (sticking ✓); scrollY=1882 (max) → pdf-pane y=80 (still sticking, no overflow ✓).

### 28.15 — Expose `--z-*` tokens via Tailwind v4 `@utility` directive

**Problem.** Sprint 28.14's sticky PDF created its own stacking context, which exposed that `.z-raised`, `.z-overlay`, `.z-toast`, `.z-dialog` had been **silently emitting no CSS** since Sprint 23a. Tailwind v4 auto-generates utilities from `--color-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--ease-*` token namespaces — but not `--z-*`. So all seven production callsites that used `z-raised` / `z-overlay` / etc. had `z-index: auto` and relied on document-order defaults. The moment a sibling stacking context shifted, the sticky page header lost the stack to red-flag cards scrolling past.

**Fix.** Single-file CSS change in [`globals.css`](../../../src/app/globals.css) — add Tailwind v4 `@utility` declarations:

```css
@utility z-raised { z-index: var(--z-raised); }   /* 10 */
@utility z-overlay { z-index: var(--z-overlay); } /* 20 */
@utility z-toast { z-index: var(--z-toast); }     /* 30 */
@utility z-dialog { z-index: var(--z-dialog); }   /* 50 */
```

**Affects (all silently broken until now, now correct):** page header, cockpit header, AssistantFab placeholder, AssistantFab pill, AssistantFab drawer, MermaidDiagram modal backdrop, PdfViewer sticky callout.

**Verification.** Header `z-index` `auto` → `10` ✓. FAB pill `z-index` `auto` → `20` ✓.

---

## 4. Definition of done

- [x] Bug 1 (blank scroll area + page-scroll past viewport + uneven-column dead zone + stacking-context overlap) cannot be reproduced.
- [x] Window-scroll model active; sticky header + sticky PDF pinned during scroll on lg+; mobile stacks naturally.
- [x] All four gates green: `npm run lint` (0/0/1-info), `npm run typecheck` (clean), `npm test` (1036/1036), `npm run build` (clean).
- [x] No new TODOs / dead code / `xit` / `describe.skip`.
- [x] No fabricated names; every fix verified against actual code.
- [x] Spec drift documented and approved (§1.6 page-must-not-scroll dropped in 28.13).
- [x] Visual regression archive in [`./screenshots/`](./screenshots/).

---

## 5. Out of scope (next-sprint candidates)

- Remove the dead `LeaseLensWorkspaceShell.tsx` and its 543-line colocated test (zero production imports — confirmed in parent plan §8).
- Replace `window.confirm` in the "Reset workspace" flow with a styled inline confirmation. Behavior contract is pinned by tests so the UI swap is decoupled.
- Decide whether `next-env.d.ts` should be `.gitignore`d (it flaps between dev/build paths).
- Visual polish: tone-down the bg-surface-card under the sticky PDF so the visual frame feels intentional at very tall viewports.

---

## 6. Screenshots (visual proof archive)

| File | Story |
|---|---|
| [`01-bug1-fixed-viewport.png`](./screenshots/01-bug1-fixed-viewport.png) | After 28.12 — `<main>` properly clamped to 100vh, no document scroll, header visible. The "broken" before-state had the document at 2782px on a 900px viewport. |
| [`02-sticky-pdf-top.png`](./screenshots/02-sticky-pdf-top.png) | After 28.14 — workspace at scrollY=0, both panes at top, two columns side-by-side. |
| [`03-sticky-pdf-midscroll.png`](./screenshots/03-sticky-pdf-midscroll.png) | After 28.14 — scrolled mid-page, PDF stuck at top-left, right column showing Clauses list. |
| [`04-sticky-pdf-bottom.png`](./screenshots/04-sticky-pdf-bottom.png) | After 28.14 — scrolled to max, PDF still pinned, last clause (§15) ending at viewport bottom on the right. |
| [`05-header-wins-stack.png`](./screenshots/05-header-wins-stack.png) | After 28.15 — N° 07 red-flag card scrolling cleanly **under** the sticky page header; `LIVE · V23.1` fully visible. The pre-fix had the cards painting over the header. |
