import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { estimateCost, isSpendCeilingExceeded, recordSpend } from './spend';

describe('spend tracking', () => {
  beforeEach(async () => {
    await db.prepare('DELETE FROM spend_log').run();
  });

  it('isSpendCeilingExceeded returns false when no row exists', async () => {
    expect(await isSpendCeilingExceeded()).toBe(false);
  });

  it('recordSpend accumulates across multiple calls (not resets)', async () => {
    await recordSpend(1_000, 500);
    await recordSpend(1_000, 500);

    const row = await db
      .prepare(
        "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
      )
      .get<{ tokens_in: number; tokens_out: number }>();

    expect(row?.tokens_in).toBe(2_000);
    expect(row?.tokens_out).toBe(1_000);
  });

  it('isSpendCeilingExceeded returns true when cost exceeds ceiling', async () => {
    // 2_000_000 in + 500_000 out → ($1.60 + $2.00) = $3.60 > $2.00 default ceiling
    await recordSpend(2_000_000, 500_000);
    expect(await isSpendCeilingExceeded()).toBe(true);
  });

  it('isSpendCeilingExceeded returns false when cost is below ceiling', async () => {
    // 100 in + 100 out → negligible cost
    await recordSpend(100, 100);
    expect(await isSpendCeilingExceeded()).toBe(false);
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
