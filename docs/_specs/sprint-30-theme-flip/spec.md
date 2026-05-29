# Sprint 30.1 — Smoother Theme Flip

## Context

The dark↔light toggle click is functionally correct (Sprint 15.1 + 15.2 + the rAF-separated flip added in Sprint 29.x) but feels less smooth than the rest of the product. On Mode A the ambient blobs, paper grain, and dozens of cards all crossfade `background-color` / `border-color` / `color` simultaneously, producing a perceptible paint storm.

User explicitly scoped this sprint to **animation smoothness only** — no visual changes to the toggle button (corner resolved-hint dot, mode chip text, icon stack all stay).

## Root causes (after fresh read of the code)

1. **Paint storm scope.** The `.theme-transition` rule in [globals.css:338-353](../../../src/app/globals.css#L338-L353) already scopes to `html, body, [data-theme-surface]` shells, but the `[data-theme-surface] *` descendant selector still hits every node inside those shells.
2. **Single-rAF before property flip.** [ThemeToggle.tsx:69-75](../../../src/components/auth/ThemeToggle.tsx#L69-L75) uses one `requestAnimationFrame` before calling `applyTheme`. Single rAF can miss the style-commit on some browsers — canonical pattern is double-rAF.

Two user-claimed root causes turned out to be stale:
- The unmounted placeholder ([ThemeToggle.tsx:185-198](../../../src/components/auth/ThemeToggle.tsx#L185-L198)) renders a **visible** Monitor + "SYS" — no `opacity-0` flash.
- The icon layer ([ThemeToggle.tsx:101](../../../src/components/auth/ThemeToggle.tsx#L101)) already crossfades via `transition-opacity duration-200 motion-reduce:transition-none`.

## Spec

### Invariants (carried)

- `prefers-reduced-motion: reduce` short-circuits to instant `applyTheme(next)`.
- Three-state cycle order unchanged: system → light → dark → system.
- `localStorage` write + `data-theme-state` attribute unchanged.
- `applyTheme(theme)` is the sole writer of `.dark` + `data-theme` on `documentElement`.
- Aria-label, mode chip, system resolved-hint behaviour all unchanged.
- No `!important` outside the existing `.theme-transition` block.

### New behaviour

`flipTheme(next: Theme)` becomes a three-branch function:

1. **Reduced motion:** instant `applyTheme(next)`. No transition class. No View Transitions call.
2. **View Transitions API available:** `document.startViewTransition(() => applyTheme(next))`. Browser handles crossfade natively via `::view-transition-old(root)` / `::view-transition-new(root)`.
3. **Fallback (no VT API):** existing class-window approach upgraded to **double rAF** for correctness.

### Definition of done

- All 3 branches behave correctly under tests.
- `npm run lint`, `npm run typecheck`, `npm test` (≥ 1073/1073), `npm run build` all green.
- Manual Playwright re-verify on Mode A + Mode B.
- No visual changes to the toggle button.

## Spec QA

- happy-dom does not expose `document.startViewTransition` — tests must define and `delete` the property to keep isolation.
- `vi.restoreAllMocks()` does NOT clean up direct property assignments on `document` — explicit `delete (document as any).startViewTransition` required in `afterEach`.
- Feature detect guard: `typeof doc.startViewTransition === 'function'`, not `'startViewTransition' in doc`.
- No interaction with React 19 batching or the no-FOUC script — `flipTheme` mutates DOM directly, no-FOUC runs once pre-hydration.

## Out of scope

- Visual changes to the toggle button.
- Narrowing `[data-theme-surface] *` selector (VT API path makes this less urgent).
- Custom `::view-transition-old(root)` CSS to tune the default 250ms crossfade.
- `color-scheme` token coordination.
