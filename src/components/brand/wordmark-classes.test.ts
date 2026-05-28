import { describe, expect, it } from 'vitest';
import {
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
});
