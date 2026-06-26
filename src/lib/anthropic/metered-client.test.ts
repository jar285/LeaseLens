// Sprint A.5a (#5a) — the metered Anthropic gateway records every tool-issued
// create() call's usage (closing the nested-tool spend bypass), including cache
// tokens, and passes the response through untouched.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import type { AnthropicLike } from '@/lib/tools/lease-tools';
import { meterAnthropicClient, normalizeUsage } from './metered-client';

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
