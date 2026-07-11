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

function countOf(key: string): number | undefined {
  const row = db
    .prepare('SELECT count FROM quota_counter WHERE quota_key = ?')
    .get(key) as { count: number } | undefined;
  return row?.count;
}

describe('enforceQuota (#17)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM quota_counter').run();
  });
  afterEach(() => {
    db.prepare('DELETE FROM quota_counter').run();
  });

  it('allows under the limit and charges the weighted cost', () => {
    const r = enforceQuota(db, [tier('q:session', 10)], 1);
    expect(r.allowed).toBe(true);
    expect(r.limitingKey).toBeNull();
    expect(r.remainingByKey['q:session']).toBe(9);
    expect(countOf('q:session')).toBe(1);

    const r2 = enforceQuota(db, [tier('q:session', 10)], 5); // weighted (e.g. scan)
    expect(r2.allowed).toBe(true);
    expect(countOf('q:session')).toBe(6);
    expect(r2.remainingByKey['q:session']).toBe(4);
  });

  it('blocks when a tier would exceed, reports it + a positive retryAfter, charges nothing', () => {
    const r = enforceQuota(db, [tier('q:s', 3)], 3); // exactly fills to the limit
    expect(r.allowed).toBe(true);
    expect(countOf('q:s')).toBe(3);

    const blocked = enforceQuota(db, [tier('q:s', 3)], 1); // 3 + 1 > 3
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('q:s');
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(HOUR);
    // All-or-nothing: the blocked request did NOT increment.
    expect(countOf('q:s')).toBe(3);
  });

  it('is all-or-nothing across tiers: one exhausted tier blocks + leaves the others untouched', () => {
    const tiers = () => [tier('q:a', 10), tier('q:b', 1)];
    expect(enforceQuota(db, tiers(), 1).allowed).toBe(true); // a=1, b=1
    const blocked = enforceQuota(db, tiers(), 1); // a→2 ok, b→2 > 1 blocks
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('q:b');
    expect(countOf('q:a')).toBe(1); // NOT incremented (rolled back)
    expect(countOf('q:b')).toBe(1);
  });

  it('reports the global tier when it is the one exhausted', () => {
    enforceQuota(db, [tier('q:session', 100), tier('global:daily', 2)], 2);
    const blocked = enforceQuota(
      db,
      [tier('q:session', 100), tier('global:daily', 2)],
      1,
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.limitingKey).toBe('global:daily');
  });

  it('resets after the rolling window elapses', () => {
    enforceQuota(db, [tier('q:s', 1)], 1); // fills
    expect(enforceQuota(db, [tier('q:s', 1)], 1).allowed).toBe(false);
    // Backdate the window past its end (mirrors rate-limit.test).
    db.prepare(
      'UPDATE quota_counter SET window_start = window_start - ? WHERE quota_key = ?',
    ).run(HOUR + 1, 'q:s');
    const afterReset = enforceQuota(db, [tier('q:s', 1)], 1);
    expect(afterReset.allowed).toBe(true);
    expect(countOf('q:s')).toBe(1); // window reset, recounts from the new charge
  });
});
