// Sprint 29.x — shared LeaseLens wordmark typography (hero + masthead).

/** Base serif lockup — matches parser-landing-wordmark / hero headline family. */
export const LEASELENS_WORDMARK_BASE =
  'font-serif font-bold italic tracking-tight text-fg-default';

/** Reserved for future hero surfaces; Mode A uses masthead wordmark only. */
export const LEASELENS_WORDMARK_HERO = `${LEASELENS_WORDMARK_BASE} text-2xl`;

/** Global sticky header brand link (`app/page.tsx`). */
export const LEASELENS_WORDMARK_MASTHEAD = `${LEASELENS_WORDMARK_BASE} text-lg`;

/*
 * Sprint 49 — masthead brand badge: the rounded accent tile the LeaseLensMark
 * glyph sits in (app/page.tsx + ContentPageShell). A premium lift over the
 * old flat `bg-accent-600`: a diagonal terracotta gradient (light→deep) for
 * dimension, a soft `shadow-lift`, and a faint white inset ring as an edge
 * catch-light. The glyph stays SOLID white (text-white) — only the container
 * gains depth, keeping the mark crisp and legible (Wathan/Schoger depth,
 * Dieter Rams restraint). The height/width utilities are set per call site so
 * the same recipe serves the h-10 home masthead and the h-9 content header.
 */
export const LEASELENS_BADGE_MASTHEAD =
  'relative flex items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white shadow-lift ring-1 ring-inset ring-white/15';
