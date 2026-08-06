// Sprint B.5b (#18) — hard budget ledger. reserve() checks committed spend +
// outstanding reservations in ONE transaction and fails closed BEFORE the
// Anthropic call (closing the check-then-spend TOCTOU); commit() records the
// actual usage to spend_log (the pricing source of truth); release() frees a
// reservation. Recording is unconditional (dev/cockpit keep tracking); only the
// throw is gated on guardrailsEnforced().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixed ceiling ($1) for deterministic cost math; guardrail flag toggled via
// process.env. estimateCost uses the real $0.8/$4 Haiku constants (not mocked).
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      LEASELENS_DAILY_SPEND_CEILING_USD: 1,
      get LEASELENS_PUBLIC_ANON_MODE() {
        return process.env._TEST_PUBLIC_ANON_MODE === 'true';
      },
      get LEASELENS_DEMO_MODE() {
        return process.env._TEST_DEMO_MODE === 'true';
      },
    },
  };
});

import { db } from '@/lib/db';
import {
  BudgetExhaustedError,
  commit,
  release,
  reserve,
} from './budget-ledger';
import { estimateCost, isSpendCeilingExceeded, recordSpend } from './spend';

// estimateCost(0, out) = out * 4 / 1e6, so out=250_000 → exactly $1.00.
const OUT_040 = 100_000; // $0.40
const OUT_060 = 150_000; // $0.60
const OUT_120 = 300_000; // $1.20

function todaySpend(): { tokens_in: number; tokens_out: number } {
  return (
    (db
      .prepare(
        "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
      )
      .get() as { tokens_in: number; tokens_out: number } | undefined) ?? {
      tokens_in: 0,
      tokens_out: 0,
    }
  );
}

function rowOf(id: string) {
  return db.prepare('SELECT * FROM provider_call WHERE id = ?').get(id) as
    | {
        status: string;
        estimated_out: number;
        estimated_cost: number;
        actual_out: number | null;
        committed_at: number | null;
      }
    | undefined;
}

describe('budget-ledger (#18)', () => {
  let priorPublic: string | undefined;
  let priorDemo: string | undefined;

  beforeEach(() => {
    priorPublic = process.env._TEST_PUBLIC_ANON_MODE;
    priorDemo = process.env._TEST_DEMO_MODE;
    db.prepare('DELETE FROM provider_call').run();
    db.prepare("DELETE FROM spend_log WHERE date = date('now')").run();
  });

  afterEach(() => {
    if (priorPublic === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = priorPublic;
    if (priorDemo === undefined) delete process.env._TEST_DEMO_MODE;
    else process.env._TEST_DEMO_MODE = priorDemo;
    db.prepare('DELETE FROM provider_call').run();
    db.prepare("DELETE FROM spend_log WHERE date = date('now')").run();
  });

  describe('guardrails enforced (public-anon mode)', () => {
    beforeEach(() => {
      process.env._TEST_PUBLIC_ANON_MODE = 'true';
    });

    it('reserves under the ceiling → returns an id + inserts one reserved row', () => {
      const id = reserve({ estIn: 0, maxOut: OUT_040 });
      expect(typeof id).toBe('string');
      const row = rowOf(id);
      expect(row?.status).toBe('reserved');
      expect(row?.estimated_out).toBe(OUT_040);
      expect(row?.estimated_cost).toBeCloseTo(0.4, 5);
    });

    it('throws BudgetExhaustedError when committed spend already meets the ceiling', () => {
      recordSpend(0, OUT_120); // $1.20 committed ≥ $1 ceiling
      expect(() => reserve({ estIn: 0, maxOut: OUT_040 })).toThrow(
        BudgetExhaustedError,
      );
    });

    it('closes the TOCTOU: two reserves without a commit between → the second throws', () => {
      reserve({ estIn: 0, maxOut: OUT_060 }); // $0.60 reserved
      expect(() => reserve({ estIn: 0, maxOut: OUT_060 })).toThrow(
        BudgetExhaustedError,
      ); // $0.60 + $0.60 = $1.20 > $1
    });

    it('commit → committed status, spend_log incremented, isSpendCeilingExceeded reflects it', () => {
      const id = reserve({ estIn: 0, maxOut: OUT_040 });
      commit(id, 0, 250_000); // actual = $1.00
      const row = rowOf(id);
      expect(row?.status).toBe('committed');
      expect(row?.actual_out).toBe(250_000);
      expect(row?.committed_at).toBeTypeOf('number');
      expect(todaySpend().tokens_out).toBe(250_000);
      expect(isSpendCeilingExceeded()).toBe(true);
    });

    it('release: reserved→released, excluded from the reserved-sum, idempotent, no-op on committed', () => {
      const id = reserve({ estIn: 0, maxOut: OUT_060 }); // $0.60 reserved
      release(id);
      expect(rowOf(id)?.status).toBe('released');
      // Released reservation is excluded from the sum → a fresh $0.60 fits.
      const id2 = reserve({ estIn: 0, maxOut: OUT_060 });
      expect(typeof id2).toBe('string');
      // Idempotent second release; no throw.
      expect(() => release(id)).not.toThrow();
      // Releasing a committed reservation is a no-op (does not un-commit).
      const id3 = reserve({ estIn: 0, maxOut: OUT_040 });
      commit(id3, 0, OUT_040);
      release(id3);
      expect(rowOf(id3)?.status).toBe('committed');
    });

    it('sweeps stale reserved rows so a crashed request cannot poison the daily budget', () => {
      // A reserved row older than the TTL (never committed/released — e.g. a
      // SIGKILLed request) worth $3.60 would otherwise exhaust the ceiling.
      const staleId = 'stale-reservation-15b';
      const old = Math.floor(Date.now() / 1000) - 999_999;
      db.prepare(
        `INSERT INTO provider_call (id, status, estimated_in, estimated_out, estimated_cost, date, created_at)
         VALUES (?, 'reserved', 0, 900000, ?, date('now'), ?)`,
      ).run(staleId, estimateCost(0, 900_000), old);

      const id = reserve({ estIn: 0, maxOut: OUT_040 });
      expect(typeof id).toBe('string'); // stale swept → sum excludes it
      expect(rowOf(staleId)?.status).toBe('released');
    });
  });

  describe('guardrails NOT enforced (plain local dev)', () => {
    it('never throws even over the ceiling, but still records (always-track invariant)', () => {
      recordSpend(0, OUT_120); // $1.20 committed
      // Over-ceiling reservation would throw under guardrails, but must not here.
      const id = reserve({ estIn: 0, maxOut: OUT_120 });
      expect(typeof id).toBe('string');
      commit(id, 0, 50_000);
      // Recording is unconditional so the cockpit/spend_log stay accurate.
      expect(todaySpend().tokens_out).toBe(OUT_120 + 50_000);
    });
  });
});
