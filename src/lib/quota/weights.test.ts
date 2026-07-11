// Sprint C.17 (#17) — weighted quota actions. Heavier operations cost more of
// the per-window budget (GoF Strategy: the weight is the per-action policy).

import { describe, expect, it } from 'vitest';
import { QUOTA_WEIGHTS, type QuotaAction, weightFor } from './weights';

describe('quota weights (#17)', () => {
  it('prices actions by cost: upload/scan heavier than a plain chat turn', () => {
    expect(QUOTA_WEIGHTS.chat).toBe(1);
    expect(QUOTA_WEIGHTS.upload).toBe(3);
    expect(QUOTA_WEIGHTS.scan).toBe(5);
    expect(QUOTA_WEIGHTS.draft).toBe(2);
  });

  it('weightFor returns the weight for a known action', () => {
    const actions: QuotaAction[] = ['chat', 'upload', 'scan', 'draft'];
    for (const a of actions) {
      expect(weightFor(a)).toBe(QUOTA_WEIGHTS[a]);
      expect(weightFor(a)).toBeGreaterThan(0);
    }
  });
});
