import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { estimateCost, isSpendCeilingExceeded, recordSpend } from './spend';

describe('spend tracking', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM spend_log').run();
  });

  it('isSpendCeilingExceeded returns false when no row exists', () => {
    expect(isSpendCeilingExceeded()).toBe(false);
  });

  it('recordSpend accumulates across multiple calls (not resets)', () => {
    recordSpend(1_000, 500);
    recordSpend(1_000, 500);

    const row = db
      .prepare(
        "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
      )
      .get() as { tokens_in: number; tokens_out: number };

    expect(row.tokens_in).toBe(2_000);
    expect(row.tokens_out).toBe(1_000);
  });

  it('isSpendCeilingExceeded returns true when cost exceeds ceiling', () => {
    // 2_000_000 in + 500_000 out → ($1.60 + $2.00) = $3.60 > $2.00 default ceiling
    recordSpend(2_000_000, 500_000);
    expect(isSpendCeilingExceeded()).toBe(true);
  });

  it('isSpendCeilingExceeded returns false when cost is below ceiling', () => {
    // 100 in + 100 out → negligible cost
    recordSpend(100, 100);
    expect(isSpendCeilingExceeded()).toBe(false);
  });

  describe('estimateCost', () => {
    it('computes cost using Haiku pricing constants', () => {
      // 1_000_000 input tokens @ $0.80/MTok = $0.80
      // 1_000_000 output tokens @ $4.00/MTok = $4.00
      // total = $4.80
      expect(estimateCost(1_000_000, 1_000_000)).toBeCloseTo(4.8);
    });

    it('returns 0 for zero tokens', () => {
      expect(estimateCost(0, 0)).toBe(0);
    });
  });
});
