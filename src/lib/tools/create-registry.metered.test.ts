// Sprint A.5a (#5a) → B.5b (#18) — createToolRegistry must route the tool
// Anthropic client through the BUDGETED gateway (which superseded the plain
// metered gateway): grade_clause_severity / draft_negotiation_email calls
// reserve budget before the call and record actual spend on commit. Mock the
// gateway with a passthrough spy to prove the wiring without a full grading flow.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import type { AnthropicLike } from './lease-tools';

// vi.hoisted so the spy exists before vi.mock's hoisted factory runs.
const { budgetSpy } = vi.hoisted(() => ({
  budgetSpy: vi.fn((base: AnthropicLike) => base),
}));

vi.mock('@/lib/anthropic/metered-client', () => ({
  budgetedAnthropicClient: budgetSpy,
}));

import { createToolRegistry } from './create-registry';

describe('createToolRegistry — budgeted Anthropic client (#5a → #18)', () => {
  beforeEach(() => {
    budgetSpy.mockClear();
  });

  it('routes an injected Anthropic client through budgetedAnthropicClient', () => {
    const db = createTestDb();
    const injected: AnthropicLike = { messages: { create: vi.fn() } };

    createToolRegistry(db, injected);

    expect(budgetSpy).toHaveBeenCalledTimes(1);
    expect(budgetSpy).toHaveBeenCalledWith(injected);
  });

  it('budgets even when no client is injected (lazy production path)', () => {
    const db = createTestDb();

    createToolRegistry(db);

    // The lazy client is resolved and still passed through the budgeted gateway.
    expect(budgetSpy).toHaveBeenCalledTimes(1);
  });
});
