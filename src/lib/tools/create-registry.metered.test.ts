// Sprint A.5a (#5a) — createToolRegistry must route the tool Anthropic client
// through the metered gateway, so grade_clause_severity / draft_negotiation_email
// calls are recorded to spend. Mock the gateway with a passthrough spy to prove
// the wiring without exercising a full grading flow.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import type { AnthropicLike } from './lease-tools';

// vi.hoisted so the spy exists before vi.mock's hoisted factory runs.
const { meterSpy } = vi.hoisted(() => ({
  meterSpy: vi.fn((base: AnthropicLike) => base),
}));

vi.mock('@/lib/anthropic/metered-client', () => ({
  meterAnthropicClient: meterSpy,
}));

import { createToolRegistry } from './create-registry';

describe('createToolRegistry — metered Anthropic client (Sprint A.5a / #5a)', () => {
  beforeEach(() => {
    meterSpy.mockClear();
  });

  it('routes an injected Anthropic client through meterAnthropicClient', () => {
    const db = createTestDb();
    const injected: AnthropicLike = { messages: { create: vi.fn() } };

    createToolRegistry(db, injected);

    expect(meterSpy).toHaveBeenCalledTimes(1);
    expect(meterSpy).toHaveBeenCalledWith(injected);
  });

  it('meters even when no client is injected (lazy production path)', () => {
    const db = createTestDb();

    createToolRegistry(db);

    // The lazy client is resolved and still passed through the meter.
    expect(meterSpy).toHaveBeenCalledTimes(1);
  });
});
