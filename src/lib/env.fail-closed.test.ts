// Sprint B.9 (#9) — the env schema fails closed when public anonymous mode is
// enabled without the guardrails a public deploy requires. Tested via the
// extracted envSchema (the module-level `env` singleton throws at import, which
// can't be exercised per-case). Google SRE: refuse an under-provisioned public
// deploy rather than boot it unsafe.
//
// Issue #29 — public-anon mode additionally fails closed without
// LEASELENS_TURSO_URL: a public deploy must not run on the local SQLite file
// (Vercel's filesystem is ephemeral — every redeploy/scale-out would silently
// drop reviews, quotas, and audit rows).

import { describe, expect, it } from 'vitest';
import { envSchema } from './env';

const SECRET = 'x'.repeat(32);

describe('envSchema — public-anon fail-closed refinement (#9)', () => {
  it('rejects public mode without ANTHROPIC_API_KEY', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_PUBLIC_ANON_MODE: 'true',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('ANTHROPIC_API_KEY');
    }
  });

  it('rejects public mode with a non-positive spend ceiling', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_PUBLIC_ANON_MODE: 'true',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      LEASELENS_DAILY_SPEND_CEILING_USD: '0',
      LEASELENS_TURSO_URL: 'libsql://test.turso.io',
      LEASELENS_TURSO_AUTH_TOKEN: 'token',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('LEASELENS_DAILY_SPEND_CEILING_USD');
    }
  });

  it('accepts public mode when the API key + positive ceiling + Turso URL are present', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_PUBLIC_ANON_MODE: 'true',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      // LEASELENS_DAILY_SPEND_CEILING_USD defaults to 2 (> 0).
      LEASELENS_TURSO_URL: 'libsql://test.turso.io',
      LEASELENS_TURSO_AUTH_TOKEN: 'token',
    });
    expect(result.success).toBe(true);
  });

  it('accepts the default profile with no API key (behavior-preserving)', () => {
    // Public mode off → the key stays optional, the refinement is inert.
    const result = envSchema.safeParse({ LEASELENS_SESSION_SECRET: SECRET });
    expect(result.success).toBe(true);
  });

  it('does not require an API key for demo mode (demo ≠ public)', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_DEMO_MODE: 'true',
    });
    expect(result.success).toBe(true);
  });
});

describe('envSchema — public-anon Turso fail-closed (#29)', () => {
  it('rejects public mode without LEASELENS_TURSO_URL', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_PUBLIC_ANON_MODE: 'true',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      // LEASELENS_DAILY_SPEND_CEILING_USD defaults to 2 (> 0); the only
      // missing guardrail is the Turso URL.
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('LEASELENS_TURSO_URL');
    }
  });

  it('accepts public mode with a Turso URL + auth token', () => {
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_PUBLIC_ANON_MODE: 'true',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      LEASELENS_TURSO_URL: 'libsql://test.turso.io',
      LEASELENS_TURSO_AUTH_TOKEN: 'token',
    });
    expect(result.success).toBe(true);
  });

  it('does not require Turso vars when public mode is off', () => {
    // Local dev keeps working with no new config: unset means `file:` mode.
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_DEMO_MODE: 'true',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a Turso URL without a token (local sqld needs none)', () => {
    // The token is optional in the schema because a local `sqld` dev server
    // needs no token — a remote libsql:// URL without one fails loudly at
    // first query instead.
    const result = envSchema.safeParse({
      LEASELENS_SESSION_SECRET: SECRET,
      LEASELENS_TURSO_URL: 'http://127.0.0.1:8080',
    });
    expect(result.success).toBe(true);
  });
});
