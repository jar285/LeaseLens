import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { middleware } from './middleware';

describe('Middleware RBAC Enforcement', () => {
  beforeEach(() => {
    process.env.LEASELENS_SESSION_SECRET =
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
    req.cookies.set('leaselens_session', token);

    const res = await middleware(req);
    expect(res).toBeDefined();
    expect(res?.status).not.toBe(403);
  });

  it('should block Creator from accessing /api/admin/ping', async () => {
    const creatorUser = DEMO_USERS.find((user) => user.role === 'Tenant');
    const token = await encrypt({
      userId: creatorUser?.id ?? '00000000-0000-0000-0000-000000000001',
      role: 'Tenant' as Role,
      displayName: creatorUser?.display_name ?? 'Syndicate Creator',
    });
    const req = new NextRequest('http://localhost/api/admin/ping');
    req.cookies.set('leaselens_session', token);

    const res = await middleware(req);
    expect(res?.status).toBe(403);
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Middleware x-request-id correlation (Sprint 44A.2)', () => {
  beforeEach(() => {
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('stamps x-request-id on a non-session path (early return)', async () => {
    const res = await middleware(
      new NextRequest('http://localhost/api/leases'),
    );
    expect(res.headers.get('x-request-id')).toMatch(UUID);
  });

  it('stamps it on the home path and still issues the session cookie', async () => {
    const res = await middleware(new NextRequest('http://localhost/'));
    expect(res.headers.get('x-request-id')).toMatch(UUID);
    expect(res.cookies.get('leaselens_session')).toBeTruthy();
  });

  it('still stamps the id on an RBAC 403 (auth preserved)', async () => {
    const tenant = DEMO_USERS.find((u) => u.role === 'Tenant');
    const token = await encrypt({
      userId: tenant?.id ?? '00000000-0000-0000-0000-000000000001',
      role: 'Tenant' as Role,
      displayName: tenant?.display_name ?? 'Tenant',
    });
    const req = new NextRequest('http://localhost/api/admin/ping');
    req.cookies.set('leaselens_session', token);
    const res = await middleware(req);
    expect(res.status).toBe(403);
    expect(res.headers.get('x-request-id')).toMatch(UUID);
  });

  it('issues a fresh id per request', async () => {
    const a = await middleware(new NextRequest('http://localhost/api/leases'));
    const b = await middleware(new NextRequest('http://localhost/api/leases'));
    expect(a.headers.get('x-request-id')).not.toBe(
      b.headers.get('x-request-id'),
    );
  });
});
