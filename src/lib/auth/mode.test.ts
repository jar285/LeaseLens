// Sprint B.9 (#9) — deployment-mode policy. guardrailsEnforced() must be true
// whenever the app is exposed (public-anon OR demo), demoAffordancesEnabled()
// tracks the demo flag alone, and isPublicAnonMode() the public flag alone.
// The headline of #9: the demo flag is no longer the SOLE gate on guardrails —
// public mode enforces them too (fixing the inversion where production had
// none).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock env with getters keyed off process.env test vars so each predicate is
// toggleable (the real env is a cached singleton). mode.ts reads this module.
vi.mock('@/lib/env', () => ({
  env: {
    get LEASELENS_PUBLIC_ANON_MODE() {
      return process.env._TEST_PUBLIC_ANON_MODE === 'true';
    },
    get LEASELENS_DEMO_MODE() {
      return process.env._TEST_DEMO_MODE === 'true';
    },
  },
}));

import {
  demoAffordancesEnabled,
  guardrailsEnforced,
  isPublicAnonMode,
} from './mode';

describe('deployment-mode policy (#9)', () => {
  beforeEach(() => {
    delete process.env._TEST_PUBLIC_ANON_MODE;
    delete process.env._TEST_DEMO_MODE;
  });
  afterEach(() => {
    delete process.env._TEST_PUBLIC_ANON_MODE;
    delete process.env._TEST_DEMO_MODE;
  });

  it('isPublicAnonMode / demoAffordancesEnabled track their own flag only', () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    expect(isPublicAnonMode()).toBe(true);
    expect(demoAffordancesEnabled()).toBe(false);

    delete process.env._TEST_PUBLIC_ANON_MODE;
    process.env._TEST_DEMO_MODE = 'true';
    expect(isPublicAnonMode()).toBe(false);
    expect(demoAffordancesEnabled()).toBe(true);
  });

  it('guardrailsEnforced is true under public-anon mode (the inversion fix)', () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    process.env._TEST_DEMO_MODE = 'false';
    expect(guardrailsEnforced()).toBe(true);
  });

  it('guardrailsEnforced is true under demo mode (portfolio stays protected)', () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'false';
    process.env._TEST_DEMO_MODE = 'true';
    expect(guardrailsEnforced()).toBe(true);
  });

  it('guardrailsEnforced is false only when neither flag is set (local dev)', () => {
    expect(guardrailsEnforced()).toBe(false);
  });
});
