# Implementation + QA — Sprint 53 Self-host fonts

**Status:** Shipped. **Branch:** `frontend/technical-debt`.

## What changed
- Vendored four latin **variable** `.woff2` files into `src/app/fonts/`: `Geist-Variable` (100–900),
  `GeistMono-Variable` (100–900), `SourceSerif4-Variable` (200–900 upright), `SourceSerif4-Italic-Variable`
  (200–900 italic). Fetched once from Google's CDN at implementation time; verified `wOF2` magic header.
- Added `src/app/fonts.ts` — `next/font/local` definitions preserving the exact variable contract
  (`--font-geist-sans`, `--font-geist-mono`, `--font-source-serif`) + `display: 'swap'`. Source Serif uses the
  `src: [{normal},{italic}]` array form so italic stays a **real** face (Sprint 23i intent), not synthesised.
- `layout.tsx` now imports the three exports from `./fonts`; the `next/font/google` import is removed. The
  `<html>` className string and `globals.css` `@theme` block are **unchanged**.

## Root cause addressed
`next build` fetched Geist / Geist Mono / Source Serif 4 from Google's CDN via `next/font/google`, making the
production build non-deterministic and prone to failure in restricted CI / offline (Google SRE; Addy Osmani).
The CDN-fetch path is now fully removed.

## Verification
- `npm run lint` clean · `npm run typecheck` clean · `npm test` **1384 passed / 154 files** (no behavior
  change; suite unaffected, as expected since the CSS-variable contract is identical).
- **Offline build:** `grep -rn "next/font/google" src/` returns only a comment in `fonts.ts` (no import). `npm
  run build` succeeded with all outbound HTTP forced through a dead proxy
  (`HTTP(S)_PROXY=http://127.0.0.1:1`) — deterministic, no network dependency for fonts.
- **Visual equivalence (Playwright):** `screenshots/s53-desktop-1440-landing-typography.png` and
  `s53-mobile-390-typography.png` — serif headline + wordmark (Source Serif), sans body (Geist), mono filename
  (Geist Mono) all render identically to the prior Google-hosted version; no FOUC, no fallback flash.

## Notes
- True airgap can't be enforced in this environment, but the only network font dependency
  (`next/font/google`) is gone and the build is green under a dead proxy — the determinism goal is met.
- Variable files cover the discrete weights the design uses (400/600/700), interpolated exactly.
- Font-strategy documentation will be folded into the recreated architecture doc in Sprint 56.
