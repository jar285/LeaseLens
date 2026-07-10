import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Role, SessionClaims } from '@/lib/auth/types';
import { decrypt, encrypt } from './session';

describe('Session Utilities (Edge-safe)', () => {
  it('should encrypt and decrypt a payload correctly', async () => {
    const payload = {
      userId: 'test-user',
      role: 'Admin' as Role,
      displayName: 'Test User',
    };
    const token = await encrypt(payload);
    const decrypted = await decrypt(token);

    expect(decrypted?.userId).toBe('test-user');
    expect(decrypted?.role).toBe('Admin');
  });

  it('should have a 24-hour expiration (86400 seconds)', async () => {
    const payload = {
      userId: 'test-user',
      role: 'Admin' as Role,
      displayName: 'Test Admin',
    };
    const token = await encrypt(payload);
    const decrypted = await decrypt(token);

    // JWT exp is in seconds
    const now = Math.floor(Date.now() / 1000);
    const exp = (decrypted as SessionClaims | null)?.exp as number;

    // Allow for a small processing delay (10s)
    const diff = exp - now;
    expect(diff).toBeGreaterThan(86300);
    expect(diff).toBeLessThanOrEqual(86400);
  });

  // S19.1 — boundary translation. The TS domain enum is
  // Tenant/Reviewer/Admin; the wire format (JWT) carries the
  // original DB literals (Creator/Editor/Admin) so existing browser
  // cookies keep decoding cleanly.
  it('encrypts Tenant payloads as Creator on the wire (backward compat)', async () => {
    const token = await encrypt({
      userId: 'test-user',
      role: 'Tenant' as Role,
      displayName: 'Test Tenant',
    });

    // Decode the JWT payload directly (no verify needed — we wrote it).
    const base64Payload = token.split('.')[1];
    const json = JSON.parse(
      Buffer.from(base64Payload, 'base64url').toString('utf8'),
    );
    expect(json.role).toBe('Creator');
  });

  it('encrypts Reviewer payloads as Editor on the wire (backward compat)', async () => {
    const token = await encrypt({
      userId: 'test-user',
      role: 'Reviewer' as Role,
      displayName: 'Test Reviewer',
    });
    const base64Payload = token.split('.')[1];
    const json = JSON.parse(
      Buffer.from(base64Payload, 'base64url').toString('utf8'),
    );
    expect(json.role).toBe('Editor');
  });

  it('decrypts a legacy Creator JWT as Tenant in the TS domain', async () => {
    // Hand-rolled JWT with the legacy literal, signed by the same secret
    // path the production decrypt uses.
    const secret = new TextEncoder().encode(
      process.env.LEASELENS_SESSION_SECRET,
    );
    const legacy = await new SignJWT({
      userId: 'legacy-user',
      role: 'Creator',
      displayName: 'Legacy User',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const decrypted = await decrypt(legacy);
    expect(decrypted?.role).toBe('Tenant');
  });

  it('decrypts a legacy Editor JWT as Reviewer in the TS domain', async () => {
    const secret = new TextEncoder().encode(
      process.env.LEASELENS_SESSION_SECRET,
    );
    const legacy = await new SignJWT({
      userId: 'legacy-user',
      role: 'Editor',
      displayName: 'Legacy User',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    const decrypted = await decrypt(legacy);
    expect(decrypted?.role).toBe('Reviewer');
  });

  // Sprint B.14 (#14) — the per-visitor anonymous claim round-trips, and legacy
  // cookies (no `anonymous` field) decode as anonymous:false (backward compat).
  it('round-trips the anonymous claim and defaults legacy cookies to false', async () => {
    const anonToken = await encrypt({
      userId: 'anon-1',
      role: 'Tenant' as Role,
      displayName: 'Anonymous Tenant',
      anonymous: true,
    });
    expect((await decrypt(anonToken))?.anonymous).toBe(true);

    // A demo/seeded session omits the claim → decodes as anonymous:false.
    const demoToken = await encrypt({
      userId: 'demo-1',
      role: 'Tenant' as Role,
      displayName: 'Demo Tenant',
    });
    expect((await decrypt(demoToken))?.anonymous).toBe(false);
    // And the claim is absent from the wire for non-anon sessions.
    const wire = JSON.parse(
      Buffer.from(demoToken.split('.')[1], 'base64url').toString('utf8'),
    );
    expect(wire.anonymous).toBeUndefined();
  });
});
