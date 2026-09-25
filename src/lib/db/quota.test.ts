// Sprint C.17 (#17) — composite-key quota. enforceQuota checks + increments
// every tier for a request in ONE transaction, all-or-nothing: if any tier
// would exceed its window limit, nothing is charged and the limiting tier +
// retry-after are reported. Mirrors the rate-limit.ts rolling-window shape but
// generalized to N keyed tiers (GoF Strategy + Google SRE: global budget).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { enforceQuota, type QuotaTier } from './quota';

const HOUR = 3600;

function tier(key: string, limit: number): QuotaTier {
  return { key, limit, windowSeconds: HOUR };
}

async function countOf(key: string): Promise<number | undefined> {
  const row = await db
    .prepare('SELECT count FROM quota_counter WHERE quota_key = ?')
    .get<{ count: number }>(key);
  return row?.count;
}

describe('enforceQuota (#17)', () => {
  beforeEach(async () => {
    await db.prepare('DELETE FROM quota_counter').run();
  });
  afterEach(async () => {
    await db.prepare('DELETE FROM quota_counter').run();
  });

  it('allows under the limit and charges the weighted cost', async () => {
    const r = await enforceQuota(db, [tier('q:session', 10)], 1);
    expect(r.allowed).toBe(true);
    expect(r.limitingKey).toBeNull();
    expect(r.remainingByKey['q:session']).toBe(9);
    expect(await countOf('q:session')).toBe(1);

    const r2 = await enforceQuota(db, [tier('q:session', 10)], 5); // weighted (e.g. scan)
    expect(r2.allowed).toBe(true);
    expect(await countOf('q:session')).toBe(6);
    expect(r2.remainingByKey['q:session']).toBe(4);
  });

  it('blocks when a tier would exceed, reports it + a positive retryAfter, charges nothing', async () => {
    const r = await enforceQuota(db, [tier('q:s', 3)], 3); // exactly fills to the limit
    expect(r.allowed).toBe(true);
    expect(await countOf('q:s')).toBe(3);

    const blocked = await enforceQuota(db, [tier('q:s', 3)], 1); // 3 + 1 > 3
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('q:s');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(HOUR);
    // All-or-nothing: the blocked request did NOT increment.
    expect(await countOf('q:s')).toBe(3);
  });

  it('is all-or-nothing across tiers: one exhausted tier blocks + leaves the others untouched', async () => {
    const tiers = () => [tier('q:a', 10), tier('q:b', 1)];
    expect((await enforceQuota(db, tiers(), 1)).allowed).toBe(true); // a=1, b=1
    const blocked = await enforceQuota(db, tiers(), 1); // a→2 ok, b→2 > 1 blocks
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('q:b');
    expect(await countOf('q:a')).toBe(1); // NOT incremented (rolled back)
    expect(await countOf('q:b')).toBe(1);
  });

  it('reports the global tier when it is the one exhausted', async () => {
    await enforceQuota(
      db,
      [tier('q:session', 100), tier('global:daily', 2)],
      2,
    );
    const blocked = await enforceQuota(
      db,
      [tier('q:session', 100), tier('global:daily', 2)],
      1,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('global:daily');
  });

  it('resets after the rolling window elapses', async () => {
    await enforceQuota(db, [tier('q:s', 1)], 1); // fills
    expect((await enforceQuota(db, [tier('q:s', 1)], 1)).allowed).toBe(false);
    // Backdate the window past its end (mirrors rate-limit.test).
    await db
      .prepare(
        'UPDATE quota_counter SET window_start = window_start - ? WHERE quota_key = ?',
      )
      .run(HOUR + 1, 'q:s');
    const afterReset = await enforceQuota(db, [tier('q:s', 1)], 1);
    expect(afterReset.allowed).toBe(true);
    expect(await countOf('q:s')).toBe(1); // window reset, recounts from the new charge
  });
});
