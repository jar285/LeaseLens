# Sprint 30.1 — Implementation Notes & QA Report

## What was completed

`flipTheme(next: Theme)` in [src/components/auth/ThemeToggle.tsx](../../../src/components/auth/ThemeToggle.tsx) is now a three-branch function:

1. **Reduced motion** → instant `applyTheme(next)`. No transition class. No View Transitions call.
2. **View Transitions API available** → `document.startViewTransition(() => applyTheme(next))`. The browser snapshots the page, applies the DOM mutation, and natively crossfades via `::view-transition-old(root)` / `::view-transition-new(root)`. Compositor work — number of DOM nodes stops mattering.
3. **Fallback (no VT API)** → class-window approach with **double rAF** for correctness. `.theme-transition` added on `documentElement`, then `requestAnimationFrame → requestAnimationFrame → applyTheme(next)`, then `setTimeout(THEME_TRANSITION_MS)` removes the class.

No visual changes to the toggle button (per user scope decision: "Neither — only animation smoothness").

## Tests added/updated

All in [src/components/auth/ThemeToggle.test.tsx](../../../src/components/auth/ThemeToggle.test.tsx):

| Test | Status | What it pins |
|---|---|---|
| `flipTheme uses document.startViewTransition when available (Sprint 30.1)` | NEW | VT API called once with a callback; callback flips `.dark`; `.theme-transition` class NOT added |
| `flipTheme falls back to double-rAF + class-window when View Transitions API absent (Sprint 30.1)` | UPDATED | `requestAnimationFrame` called exactly **twice** before `.dark` mutates; `.theme-transition` added and removed after `THEME_TRANSITION_MS` |
| `flipTheme skips theme-transition when prefers-reduced-motion (Sprint 29.x)` | HARDENED | Added negative assertion: even with VT API stubbed, `startViewTransition` is NOT called when reduced-motion is set |

Plus defensive `delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;` in both `describe` blocks' `beforeEach` and `afterEach` — `vi.restoreAllMocks()` does not clean up direct property assignments on `document`, so explicit deletion is required to prevent cross-test pollution.

## Gates (final run)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors / 0 warnings / 1 info (pre-existing, unrelated to this sprint) |
| `npm run typecheck` | **PASS** — clean |
| `npm test` | **PASS** — 1082/1082 passed across 123 files (29.57s) |
| `npm run build` | **PASS** — Compiled successfully in 11.9s |

## Playwright re-verify

Empirical verification in HeadlessChrome 124 on the live dev server (`npm run dev`):

| Scenario | What was measured | Result |
|---|---|---|
| Mode A landing — system→light click | `vtCalls` counter on spy + `data-theme-state` | `vtCalls: 1`, state `light`, `theme-transition` class NOT added → VT path used |
| Mode A landing — light→dark click | Same | `vtCalls: 2`, state `dark`, `isDark: true` → VT path used |
| Mode A landing — fallback forced (`startViewTransition = undefined`) | `__rafCount` counter | `rafCount: 2`, state `light`, ends correctly → **double-rAF fallback confirmed** |
| Reduced-motion (`emulateMedia: 'reduce'`) | `rafCount` after click | `rafCount: 0`, `theme-transition` class NOT added, state flipped instantly → **short-circuit confirmed** |
| Mode B workspace (lease loaded, scanning active) — dark→system click | `vtCalls` + state | `vtCalls: 1`, state `system`, `isDark: false` → VT path used in high-paint surface |

Visual comparison screenshots captured:

- `screenshots/01-before-flip-system-light.png` — Mode A in system mode (resolves to light).
- `screenshots/02-after-flip-light.png` — Mode A after first VT flip.
- `screenshots/03-after-flip-dark.png` — Mode A in dark via VT.
- `screenshots/04-fallback-light.png` — Mode A after forced-fallback double-rAF flip.
- `screenshots/05-modeB-dark-before.png` — Mode B (lease + scan running) in dark, pre-flip.
- `screenshots/06-modeB-after-flip.png` — Mode B after VT flip to system.

## Spec alignment

- **Reduced-motion contract preserved** ([ThemeToggle.tsx:14-16](../../../src/components/auth/ThemeToggle.tsx#L14-L16)) ✅
- **Three-state cycle order unchanged** ✅
- **`applyTheme(theme)` is still the sole writer of `.dark` and `data-theme`** ✅
- **No visual changes to the button** (corner hint dot, mode chip, icon stack all unchanged) ✅
- **No new dependencies, no CSS changes** ✅

## Drift observed

None. The implementation matches §2.2 of the spec exactly.

## Carry into next sprint

- Sprint 30.2 (optional): narrow the `[data-theme-surface] *` descendant selector in [globals.css:344-347](../../../src/app/globals.css#L344-L347) to a token-driven set if Firefox / fallback-path users report residual jankiness. The VT API path makes this less urgent — defer until needed.
- Sprint 30.3 (optional): custom `::view-transition-old(root)` / `::view-transition-new(root)` CSS to tune the default 250ms crossfade duration or add a directional slide. Only if requested.
- Sprint 28 carries still standing: styled `window.confirm` replacement for Replace lease, `next-env.d.ts` gitignore.
- Sprint 29 carries: commit of Sprint 29.1-29.13 work, optional Sprint 29.14 process plate (placement question still open).

## Diminishing returns assessment

For Sprint 30.1: **N** (done is done). Further work on the theme flip would be a different concern (selector scope, custom VT durations) and was explicitly deferred. The smoothness gain on Mode A (the painful surface) comes from the VT API path which is now in place on all current Chromium/Safari browsers. Firefox users still get the existing class-window path, only with the timing-correctness double-rAF fix.

## How to re-verify locally

```bash
npm test src/components/auth/ThemeToggle.test.tsx   # 9/9 green
npm run lint && npm run typecheck && npm run build  # all green
npm run dev                                         # then click toggle at /
```

For an interactive A/B feel comparison, open DevTools and run:

```js
// Force the fallback path:
Object.defineProperty(document, 'startViewTransition', { value: undefined, configurable: true });
// Then click the toggle. Compare to a tab without the override (default VT path).
```
