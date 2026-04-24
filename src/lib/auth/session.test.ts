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
});
