// Sprint 13 §2.8 invariant — the "not legal advice" disclaimer is a
// compile-time constant rendered identically by the home page, chat
// empty state, system prompt, and README. These assertions guard the
// wording from accidental drift.

import { describe, expect, it } from 'vitest';
import { LEASELENS_DISCLAIMER } from './disclaimer';

describe('LEASELENS_DISCLAIMER', () => {
  it('is a non-empty string', () => {
    expect(typeof LEASELENS_DISCLAIMER).toBe('string');
    expect(LEASELENS_DISCLAIMER.length).toBeGreaterThan(0);
  });

  it('explicitly states this is not legal advice', () => {
    expect(LEASELENS_DISCLAIMER.toLowerCase()).toContain('not legal advice');
  });

  it('points users to a tenant attorney or legal-aid clinic', () => {
    const lower = LEASELENS_DISCLAIMER.toLowerCase();
    expect(lower).toMatch(/attorney|legal[\s-]aid|clinic/);
  });

  it('is jurisdiction-aware (mentions NJ)', () => {
    // The corpus is NJ-only by spec §2.7; the disclaimer reflects that.
    expect(LEASELENS_DISCLAIMER).toMatch(/\bNJ\b|New Jersey/);
  });

  it('is short enough to render inline (≤ 400 chars)', () => {
    // Used in the chat empty state + system prompt + README; long-form
    // language belongs in a Privacy/Terms page, not this constant.
    expect(LEASELENS_DISCLAIMER.length).toBeLessThanOrEqual(400);
  });
});
