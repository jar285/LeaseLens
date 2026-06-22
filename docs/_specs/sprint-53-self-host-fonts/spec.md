# Sprint 53 — Self-host fonts (deterministic offline build)

> Branch: `frontend/technical-debt` · commits `feat(s53.x): …`
> Plan: `~/.claude/plans/sounds-good-use-plan-sharded-lynx.md` (P0).

## Problem / root cause

`src/app/layout.tsx:3-29` loads Geist, Geist Mono, and Source Serif 4 via `next/font/google`. `next build`
fetches these from Google's CDN at build time, so the production build is **non-deterministic** and fails in
restricted CI / offline environments (Google SRE reliability; Addy Osmani production web quality).

## Goal

Serve the three families from **vendored local `.woff2`** via `next/font/local`, so `npm run build` succeeds
with no network. Preserve the typography exactly — same CSS-variable contract, so nothing else changes.

## Approach (no new dependency)

1. Vendor the latin `.woff2` files into `src/app/fonts/`:
   - `Geist[wght].woff2` (variable, 100–900)
   - `GeistMono[wght].woff2` (variable, 100–900)
   - `SourceSerif4[wght].woff2` (variable upright, 200–900)
   - `SourceSerif4-Italic[wght].woff2` (variable italic, 200–900)
   Variable files cover the current discrete weights (400/600/700) and render identically or better.
2. Add `src/app/fonts.ts` with `next/font/local` definitions, **preserving the exact `variable` names**
   `--font-geist-sans`, `--font-geist-mono`, `--font-source-serif` and `display: 'swap'`. Source Serif uses the
   `src: [{normal}, {italic}]` array form.
3. `layout.tsx` imports the three exports from `fonts.ts`; the `<html>` className string is unchanged.
4. `globals.css` `@theme` (`--font-sans/-serif/-mono` referencing the above) is **untouched**.

## Invariants

- CSS variable names + fallback chains unchanged → `globals.css` and every `font-sans/serif/mono` consumer
  keeps working with no edit.
- `display: 'swap'` retained. Italic stays a real face (not synthesised) — Source Serif italic file required.
- No new runtime dependency.

## Tests / verification

- Existing suite unaffected (no behavior change) — full 4-gate sweep stays green.
- **Offline build:** run `npm run build` with network disabled → must succeed.
- Playwright typography screenshots at desktop 1440×1000 + mobile 390×844, compared to current rendering;
  visual equivalence is the acceptance bar. Flag any metric drift (line-height/weight).

## Out of scope

The `geist` npm package route (rejected — no new dep). Variable-axis tuning beyond matching current weights.
