// Sprint B.14 (#14) — the Edge-safe public-anon flag reader mirrors env.ts's
// Zod transform ('true'/'1' → true). Restore process.env after each case so it
// can't leak into sibling suites (vitest shares process.env).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPublicAnonModeFromProcessEnv } from './mode-edge';

describe('isPublicAnonModeFromProcessEnv', () => {
  let prior: string | undefined;
  beforeEach(() => {
    prior = process.env.LEASELENS_PUBLIC_ANON_MODE;
  });
  afterEach(() => {
    if (prior === undefined) delete process.env.LEASELENS_PUBLIC_ANON_MODE;
    else process.env.LEASELENS_PUBLIC_ANON_MODE = prior;
  });

  it('is true for "true" and "1"', () => {
    process.env.LEASELENS_PUBLIC_ANON_MODE = 'true';
    expect(isPublicAnonModeFromProcessEnv()).toBe(true);
    process.env.LEASELENS_PUBLIC_ANON_MODE = '1';
    expect(isPublicAnonModeFromProcessEnv()).toBe(true);
  });

  it('is false for "false", other values, and unset', () => {
    process.env.LEASELENS_PUBLIC_ANON_MODE = 'false';
    expect(isPublicAnonModeFromProcessEnv()).toBe(false);
    process.env.LEASELENS_PUBLIC_ANON_MODE = 'yes';
    expect(isPublicAnonModeFromProcessEnv()).toBe(false);
    delete process.env.LEASELENS_PUBLIC_ANON_MODE;
    expect(isPublicAnonModeFromProcessEnv()).toBe(false);
  });
});
