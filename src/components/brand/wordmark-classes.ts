// Sprint 29.x — shared LeaseLens wordmark typography (hero + masthead).

/** Base serif lockup — matches parser-landing-wordmark / hero headline family. */
export const LEASELENS_WORDMARK_BASE =
  'font-serif font-bold italic tracking-tight text-fg-default';

/** Reserved for future hero surfaces; Mode A uses masthead wordmark only. */
export const LEASELENS_WORDMARK_HERO = `${LEASELENS_WORDMARK_BASE} text-2xl`;

/** Global sticky header brand link (`app/page.tsx`). */
export const LEASELENS_WORDMARK_MASTHEAD = `${LEASELENS_WORDMARK_BASE} text-lg`;
