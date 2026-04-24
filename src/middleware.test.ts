import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { middleware } from './middleware';

describe('Middleware RBAC Enforcement', () => {
  beforeEach(() => {
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('should allow Admin to access /api/admin/ping', async () => {
    const adminUser = DEMO_USERS.find((user) => user.role === 'Admin');
    const token = await encrypt({
      userId: adminUser?.id ?? '00000000-0000-0000-0000-000000000003',
      role: 'Admin' as Role,
      displayName: adminUser?.display_name ?? 'Syndicate Admin',
    });
    const req = new NextRequest('http://localhost/api/admin/ping');
    req.cookies.set('contentops_session', token);

    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res?.status).not.toBe(403);
  });

  it('should block Creator from accessing /api/admin/ping', async () => {
    const creatorUser = DEMO_USERS.find((user) => user.role === 'Creator');
    const token = await encrypt({
      userId: creatorUser?.id ?? '00000000-0000-0000-0000-000000000001',
      role: 'Creator' as Role,
      displayName: creatorUser?.display_name ?? 'Syndicate Creator',
    });
    const req = new NextRequest('http://localhost/api/admin/ping');
    req.cookies.set('contentops_session', token);

    const res = await middleware(req);
    expect(res?.status).toBe(403);
  });
});
