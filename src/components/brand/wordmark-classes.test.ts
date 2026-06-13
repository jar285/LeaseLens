import { describe, expect, it } from 'vitest';
import {
  LEASELENS_BADGE_MASTHEAD,
  LEASELENS_WORDMARK_BASE,
  LEASELENS_WORDMARK_HERO,
  LEASELENS_WORDMARK_MASTHEAD,
} from './wordmark-classes';

describe('wordmark-classes', () => {
  it('shares serif italic typography between hero and masthead', () => {
    expect(LEASELENS_WORDMARK_HERO).toContain(LEASELENS_WORDMARK_BASE);
    expect(LEASELENS_WORDMARK_MASTHEAD).toContain(LEASELENS_WORDMARK_BASE);
    expect(LEASELENS_WORDMARK_HERO).toMatch(/\btext-2xl\b/);
    expect(LEASELENS_WORDMARK_MASTHEAD).toMatch(/\btext-lg\b/);
  });

  // Sprint 49 — premium lift on the brand badge: the glyph tile gets a
  // subtle terracotta gradient + soft lift + inset catch-light. Glyph stays
  // solid (text-white). Size (h-/w-) is applied per call site, so the shared
  // recipe must NOT bake in a fixed size.
  it('exposes a masthead badge recipe with gradient depth, lift, and no fixed size', () => {
    expect(LEASELENS_BADGE_MASTHEAD).toMatch(/\bbg-gradient-to-br\b/);
    expect(LEASELENS_BADGE_MASTHEAD).toMatch(/\brounded-lg\b/);
    expect(LEASELENS_BADGE_MASTHEAD).toMatch(/\bshadow-lift\b/);
    expect(LEASELENS_BADGE_MASTHEAD).toMatch(/\btext-white\b/);
    expect(LEASELENS_BADGE_MASTHEAD).not.toMatch(/\b[hw]-\d/);
  });
});
