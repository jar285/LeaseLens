# Sprint 28 — Implementation Notes & QA Reports

**Companion to:** [`spec.md`](./spec.md).
**Branch:** `feature/cockpit`.

Per-sub-sprint TDD record + cross-suite verification matrix + diminishing-returns assessment, in the order the work landed.

---

## 28.11 — `scroll-padding-bottom` for FAB clearance

**TDD red:** Flipped the Sprint 28.10 sentinel assertion in [`ParserResultsShell.test.tsx`](../../../src/components/lease/ParserResultsShell.test.tsx). New assertion: `results-stack` className matches `\bscroll-pb-28\b` and `queryByTestId('results-stack-fab-safe-area')` returns null. Used a negative lookbehind regex (`(?<!scroll-)\bpb-2[4-9]\b`) so `scroll-pb-28` does not falsely satisfy the "no flow padding" check.

**TDD green:** [`ParserResultsShell.tsx:179-194`](../../../src/components/lease/ParserResultsShell.tsx) — appended `scroll-pb-28` to the scroll container's className; deleted the `<div data-testid="results-stack-fab-safe-area" className="h-28 shrink-0" />` sentinel.

**Insight.** The Sprint 28.10 reasoning ("no visible blank zone because clientHeight ≥ sentinel") only held when content + sentinel fit within `clientHeight`. As soon as content exceeded the viewport — which is the common case once 5+ red flags + the clauses list render — the sentinel became 112px of dead scrollable space below the last card. `scroll-padding-bottom` is the platform-native primitive that solves the original goal (keep scrollIntoView targets above the FAB) without inflating scrollHeight.

**Verification.** `npm test`: 1037/1037 across 122 files (+0 net; the rewritten test consolidated one old assertion).

---

## 28.12 — Repair viewport clamp

**Red.** Sprint 28.11's fix was correct for its scope but the user still saw the workspace scrolling like a long page. Investigation in a live browser (Playwright Chromium 1440×900):

| Metric | Before |
|---|---|
| `<main>` computed `height` | **2782.23px** (declared `h-dvh`) |
| `documentElement.scrollHeight` | **2782** |
| `window.scrollTo(0,5000)` lands at | **1882** (page scrollable) |

Probed Tailwind's `.h-dvh` emission directly: `.h-dvh { }` (empty rule body). An empty `<div className="h-dvh">` appended to body computed to `0px` instead of `900px`. Confirmed `h-screen` works (`height: 100vh`) and emits a proper rule.

Even after `h-dvh` → `h-screen`, `documentElement.scrollHeight` still reported 2667px. Hunt found `position: absolute .sr-only` spans (Tailwind's standard accessible-text utility) at y=2666 in document coords. Their containing block walked up to the viewport because **no positioned ancestor between them and `<html>`** existed — all of `<main>`, `parser-results-shell`, the grid body, and `results-stack` were `position: static`. The sr-only spans escaped `<main>`'s `overflow: hidden` and inflated document scrollHeight.

**Green.** Two changes in [`src/app/page.tsx`](../../../src/app/page.tsx): `h-dvh` → `h-screen`, and add `relative` to `<main>`. Setting `<main>` `position: relative` collapsed `scrollHeight` from 2667 → **900** and made the document unscrollable.

Also propagated `h-dvh` → `h-screen` in the shared [`PageShell.tsx`](../../../src/components/layout/PageShell.tsx) primitive and its [unit test](../../../src/components/layout/PageShell.test.tsx). PageShell isn't used by `/` (the workspace renders its own `<main>` directly) but the same broken-utility hazard applies to any future page that uses the shared shell.

**Verification.**

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors / 0 warnings / 1 non-blocking info |
| `npm run typecheck` | clean |
| `npm test` | 1037/1037 |
| `npm run build` | clean |
| Live Playwright | `<main>` 900px, document not scrollable, `window.scrollTo(0,5000)` → 0 ✓ |

**Insight.** The Sprint 26c.10 commit message celebrated `h-dvh` as "more constraint-rigid than `flex h-dvh`" — but the class had been silently producing no CSS the whole time. The workspace only "looked correct" before Sprint 28.14 because the prior sentinel mask happened to align with the broken clamp. Anti-pattern caught: **a passing lint + typecheck + test sweep proves nothing about whether a Tailwind utility actually emits a CSS rule.**

---

## 28.13 — Drop viewport clamp; restore window scroll (spec change)

**Spec drift.** After Sprint 28.12 made the viewport clamp actually work, the user re-tested and said they preferred a window-scroll workspace. Escalated via `AskUserQuestion` with three options (sticky-header + back-to-top button; full window scroll one long page; window scroll with sticky PDF). User picked **full window scroll (one long page)**.

This drops the §1.6 invariant "the page itself must not scroll; scroll must live inside named scroll containers." Per methodology, spec changes go through explicit user approval — that approval was captured in-conversation.

**Green.** Changes:

| File | Change |
|---|---|
| [`src/app/page.tsx`](../../../src/app/page.tsx) | `<main>`: `grid h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden` → `min-h-screen`. Keep `relative` (still needed for sr-only). `<header>`: add `sticky top-0`. |
| [`src/app/globals.css`](../../../src/app/globals.css) | Add `html { scroll-padding-top: 5rem }` so `scrollIntoView` lands targets below the sticky header. |
| [`src/components/lease/ParserResultsShell.tsx`](../../../src/components/lease/ParserResultsShell.tsx) | Drop all height/overflow constraints from outer shell, grid body, and both panes. Right pane becomes `flex flex-col gap-4` (no internal scroll, no scroll-pb-28). |
| [`src/components/lease/ParserResultsShell.test.tsx`](../../../src/components/lease/ParserResultsShell.test.tsx) | Sprint 28.11 layout-invariants block → Sprint 28.13 invariants: no outer overflow clip, no h-full chain, right pane is *not* a scroll container, grid no longer owns height containment. |
| [`tests/e2e/parser-results.spec.ts`](../../../tests/e2e/parser-results.spec.ts) | Invert the Sprint 26c.10 regression: assert `scrollHeight > innerHeight + 200`, `window.scrollTo(0,500)` actually moves, and the sticky header stays at viewport top during scroll. |

**Verification.** Lint / typecheck / `npm test` (1036/1036) / build all clean.

---

## 28.14 — Sticky-on-desktop PDF column

**Red.** User reported "scroll for PDF and red clauses are going out of bounds" with three screenshots showing cream-colored empty space on the left as the right column continued scrolling. Playwright measurement on 1440×900:

| Element | Height | Notes |
|---|---|---|
| `<main>` | 2782px | doc scrolls, as designed |
| `pdf-pane` | **2624px** | stretched (CSS Grid `align-items: stretch` default) |
| `results-stack` | 2624px | natural height of cards + clauses list |
| PDF actual content | ~1500px (estimated from user's screenshots) | leaves ~1100px of empty `bg-surface-card` below |

Root cause: CSS Grid stretches grid items to row height. The PDF cell extended into a tall empty card-surface while the right column scrolled past.

**Pivot to option C.** Asked via `AskUserQuestion` with three options (sticky PDF + internal scroll; shrink columns to content with cream below; keep current behavior). User picked **sticky PDF + internal scroll**.

**Green.** Single className change on the `pdf-pane` `<section>` in [`ParserResultsShell.tsx:171-194`](../../../src/components/lease/ParserResultsShell.tsx):

```diff
- className="rounded-lg border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900"
+ className="self-start rounded-lg border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-hidden"
```

- `self-start` (all breakpoints) — don't stretch with the row.
- `lg:sticky lg:top-20` — pin 5rem below viewport top (under the sticky header).
- `lg:h-[calc(100vh-6rem)]` — explicit bounded height at lg+ so PdfViewer's existing `h-full + min-h-0 + flex-1 + overflow-auto` chain works (PDF internal scroll restored).
- `lg:overflow-hidden` — clip PdfViewer overflow.
- Mobile (`<lg`): no sticky, no height cap, panes stack naturally.

Matching invariant rewrite in [`ParserResultsShell.test.tsx`](../../../src/components/lease/ParserResultsShell.test.tsx) (the "left pane does NOT have overflow-hidden" test became "left pane sticky and viewport-bounded at lg+").

**Verification matrix.**

| Scroll position | pdf-pane y | stack y | Behavior |
|---|---|---|---|
| scrollY = 0 | y=143 | y=143 | both at top |
| scrollY = 1200 (mid) | **y=80 (sticky ✓)** | y=-1057 (scrolling past ✓) | PDF stuck below header |
| scrollY = 1882 (max) | **y=80 (still sticky ✓)** | y=-1739, bottom=884 | last clause ends at viewport bottom |

All four CI gates green.

---

## 28.15 — Expose `--z-*` tokens via `@utility`

**Red.** User saw red-flag cards painting over the sticky page header where they overlapped. Playwright probe:

| Element | computed `z-index` |
|---|---|
| `<header>` (class `z-raised`) | **`auto`** |
| AssistantFab pill (class `z-overlay`) | `auto` |
| any element with explicit z-index | none found |

Probed Tailwind output: `.z-raised`, `.z-overlay`, `.z-toast`, `.z-dialog` were **not in the stylesheet at all**. A `<div className="z-raised" style="position: relative">` computed to `z-index: auto`. Meanwhile `--z-raised: 10` did resolve correctly as a CSS variable on `<html>` — the tokens existed, just no utility wrapped them.

Tailwind v4 auto-generates utilities only from its known token namespaces (`--color-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--ease-*`). `--z-*` is not on that list. Result: the entire z-index scale defined in Sprint 23a had been silently no-op for ~14 sprints. Seven production sites (page header, cockpit header, FAB pill/drawer/placeholder, mermaid modal, PDF sticky callout) "worked" only because document order + default sticky behavior happened to align. Sprint 28.14's sticky PDF created a new stacking context that shifted the default alignment and exposed the latent bug.

**Green.** One file changed — [`src/app/globals.css`](../../../src/app/globals.css):

```css
@utility z-raised { z-index: var(--z-raised); }
@utility z-overlay { z-index: var(--z-overlay); }
@utility z-toast { z-index: var(--z-toast); }
@utility z-dialog { z-index: var(--z-dialog); }
```

Tailwind v4's `@utility` directive is the canonical way to declare custom utilities mapped to theme tokens. All seven existing callsites picked up correct z-index without further code changes.

**Verification.**

| Element | z-index (before) | z-index (after) |
|---|---|---|
| Page header | `auto` | **`10`** ✓ |
| AssistantFab pill | `auto` | **`20`** ✓ |

Visual: N° 07 red-flag card now scrolls cleanly **under** the sticky page header at scrollY=600; full header visible with `LIVE · V23.1` + theme toggle.

All four CI gates green.

**Insight.** Same anti-pattern as Sprint 28.12: **passing tests don't prove a Tailwind utility actually emits CSS**. Both `h-dvh` and `z-raised` were syntactically valid Tailwind classnames that produced empty (or absent) rules. Future audits should include a Playwright probe of each token-derived utility to confirm it's in the stylesheet AND applies the expected declaration.

---

## Cross-sprint final verification (2026-05-26)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors, 0 warnings, 1 non-blocking info (pre-existing `useTemplate` suggestion in `AssistantFab.integration.test.tsx`) |
| `npm run typecheck` | **PASS** — no diagnostics |
| `npm test` | **PASS** — 1036/1036 across 122 files; 0 skipped |
| `npm run build` | **PASS** — Next.js 16.2.4 Turbopack |
| Live Playwright (1440×900) | sticky header at y=0 throughout scroll; sticky PDF at y=80 (lg+); document grows past viewport; no overlap, no blank cream zones |

---

## Diminishing-returns assessment

Each sub-sprint resolved a distinct root cause discovered only after the previous fix exposed it:

1. 28.10 sentinel → 28.11 scroll-padding → revealed empty `.h-dvh` rule
2. → 28.12 `h-screen` + `relative` → revealed user preference for window scroll
3. → 28.13 spec change to window scroll → revealed uneven-column dead zone
4. → 28.14 sticky PDF → revealed broken `z-raised` utility
5. → 28.15 `@utility` declarations → all visible bugs closed

The layering is real and the work is done at each layer. Sprint 7 (closeout) housekeeping items remain available in the parent plan §8 (`LeaseLensWorkspaceShell` dead code, `next-env.d.ts` gitignore, styled Reset workspace confirmation) but are out of scope for the Bug 1 fix arc.
