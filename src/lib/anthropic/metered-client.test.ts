// Sprint A.5a (#5a) — the metered Anthropic gateway records every tool-issued
// create() call's usage (closing the nested-tool spend bypass), including cache
// tokens, and passes the response through untouched.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Sprint B.5b (#18) — fixed ceiling + guardrail toggle so budgetedAnthropicClient's
// reserve/commit/release + fail-closed path is exercised deterministically.
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
import { BudgetExhaustedError } from '@/lib/db/budget-ledger';
import type { AnthropicLike } from '@/lib/tools/lease-tools';
import {
  budgetedAnthropicClient,
  meterAnthropicClient,
  normalizeUsage,
} from './metered-client';

function todaySpend(): { tokens_in: number; tokens_out: number } | undefined {
  return db
    .prepare(
      "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
    )
    .get() as { tokens_in: number; tokens_out: number } | undefined;
}

describe('normalizeUsage', () => {
  it('sums base input + cache-creation + cache-read into one input total', () => {
    expect(
      normalizeUsage({
        input_tokens: 100,
        output_tokens: 200,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 50,
      }),
    ).toEqual({ input: 160, output: 200 });
  });

  it('treats a missing usage block as zero', () => {
    expect(normalizeUsage(undefined)).toEqual({ input: 0, output: 0 });
    expect(normalizeUsage(null)).toEqual({ input: 0, output: 0 });
  });
});

describe('meterAnthropicClient', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM spend_log').run();
  });

  it('records usage via an injected sink and returns the response unchanged', async () => {
    const sink = vi.fn();
    const response = {
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 100,
        output_tokens: 200,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 10,
      },
    };
    const base: AnthropicLike = {
      messages: { create: vi.fn().mockResolvedValue(response) },
    };

    const metered = meterAnthropicClient(base, sink);
    const result = await metered.messages.create({ probe: 1 });

    // Cache tokens are folded into the input total (160 = 100 + 10 + 50).
    expect(sink).toHaveBeenCalledWith({ input: 160, output: 200 });
    // Drop-in: args forwarded, response passed through untouched.
    expect(base.messages.create).toHaveBeenCalledWith({ probe: 1 });
    expect(result).toBe(response);
  });

  it('default sink records the (cache-inclusive) usage to spend_log', async () => {
    const base: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 20,
          },
        }),
      },
    };

    const metered = meterAnthropicClient(base); // default sink = recordSpend
    await metered.messages.create({});

    expect(todaySpend()).toEqual({ tokens_in: 120, tokens_out: 50 });
  });

  it('does not write a spend row when the response carries no usage', async () => {
    const base: AnthropicLike = {
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) },
    };

    const metered = meterAnthropicClient(base);
    await metered.messages.create({});

    expect(todaySpend()).toBeUndefined();
  });
});

describe('budgetedAnthropicClient (#18)', () => {
  let prior: string | undefined;

  beforeEach(() => {
    prior = process.env._TEST_PUBLIC_ANON_MODE;
    db.prepare('DELETE FROM provider_call').run();
    db.prepare("DELETE FROM spend_log WHERE date = date('now')").run();
  });

  afterEach(() => {
    if (prior === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = prior;
    db.prepare('DELETE FROM provider_call').run();
    db.prepare("DELETE FROM spend_log WHERE date = date('now')").run();
  });

  function reservedCount() {
    return (
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM provider_call WHERE status = 'reserved'",
        )
        .get() as { n: number }
    ).n;
  }

  it('records a completed call exactly once (reserve → commit, no double-count)', async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    const base: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 20,
          },
        }),
      },
    };

    const client = budgetedAnthropicClient(base);
    await client.messages.create({ max_tokens: 1024, messages: [] });

    // spend_log incremented once with cache-inclusive input (120 = 100+20).
    expect(todaySpend()).toEqual({ tokens_in: 120, tokens_out: 50 });
    const committed = db
      .prepare(
        "SELECT COUNT(*) AS n FROM provider_call WHERE status = 'committed'",
      )
      .get() as { n: number };
    expect(committed.n).toBe(1);
    expect(reservedCount()).toBe(0); // released/committed, none left dangling
  });

  it('fails closed: reserve throws before the call when the budget is exhausted', async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    // Pre-load committed spend past the $1 ceiling.
    db.prepare(
      `INSERT INTO spend_log (date, tokens_in, tokens_out) VALUES (date('now'), 0, 300000)
       ON CONFLICT(date) DO UPDATE SET tokens_out = 300000`,
    ).run();
    const create = vi.fn().mockResolvedValue({ content: [], usage: {} });
    const client = budgetedAnthropicClient({ messages: { create } });

    await expect(
      client.messages.create({ max_tokens: 1024, messages: [] }),
    ).rejects.toBeInstanceOf(BudgetExhaustedError);
    expect(create).not.toHaveBeenCalled(); // never hit the provider
    expect(reservedCount()).toBe(0); // nothing reserved (rolled back)
  });

  it('releases the reservation when the underlying call throws (no leak)', async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    const base: AnthropicLike = {
      messages: { create: vi.fn().mockRejectedValue(new Error('aborted')) },
    };
    const client = budgetedAnthropicClient(base);

    await expect(
      client.messages.create({ max_tokens: 1024, messages: [] }),
    ).rejects.toThrow('aborted');
    expect(reservedCount()).toBe(0); // finally-release cleared it
  });
});
