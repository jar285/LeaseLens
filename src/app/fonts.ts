// Sprint 53 — self-hosted fonts (deterministic offline build).
//
// Previously these three families were loaded via `next/font/google`, which
// fetches from Google's CDN at build time and fails `next build` in restricted
// CI / offline environments (Google SRE reliability; Addy Osmani production web
// quality). They are now vendored as latin variable `.woff2` files under
// `./fonts/` and loaded with `next/font/local`, so the build never touches the
// network.
//
// The CSS-variable contract is IDENTICAL to the old Google config
// (`--font-geist-sans` / `--font-geist-mono` / `--font-source-serif`) so the
// `@theme` block in `globals.css` and every `font-sans/serif/mono` consumer
// keep working with no change. `display: 'swap'` is preserved.
//
// The variable files cover the full weight axes, so the discrete weights the
// design uses (400/600/700) interpolate exactly — Source Serif keeps a REAL
// italic face (separate file), never a synthesised slant (Sprint 23i).

import localFont from 'next/font/local';

export const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-sans',
  display: 'swap',
});

export const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
});

export const sourceSerif = localFont({
  src: [
    {
      path: './fonts/SourceSerif4-Variable.woff2',
      weight: '200 900',
      style: 'normal',
    },
    {
      path: './fonts/SourceSerif4-Italic-Variable.woff2',
      weight: '200 900',
      style: 'italic',
    },
  ],
  variable: '--font-source-serif',
  display: 'swap',
});
