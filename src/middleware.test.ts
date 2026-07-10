import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt, encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { decodeWorkspace } from '@/lib/workspaces/cookie';
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

// Sprint B.14 (#14) — in public-anon mode a cookieless visitor gets a UNIQUE
// anonymous session + their OWN (non-sample) workspace, instead of collapsing
// onto the shared seeded Tenant + sample workspace. Demo/default is unchanged.
describe('Middleware per-visitor anonymous session (Sprint B.14 / #14)', () => {
  let priorMode: string | undefined;
  beforeEach(() => {
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    priorMode = process.env.LEASELENS_PUBLIC_ANON_MODE;
    process.env.LEASELENS_PUBLIC_ANON_MODE = 'true';
  });
  afterEach(() => {
    if (priorMode === undefined) delete process.env.LEASELENS_PUBLIC_ANON_MODE;
    else process.env.LEASELENS_PUBLIC_ANON_MODE = priorMode;
  });

  it('mints a DISTINCT anonymous identity per cookieless visitor', async () => {
    const resA = await middleware(new NextRequest('http://localhost/'));
    const resB = await middleware(new NextRequest('http://localhost/'));
    const a = await decrypt(resA.cookies.get('leaselens_session')?.value ?? '');
    const b = await decrypt(resB.cookies.get('leaselens_session')?.value ?? '');

    expect(a?.anonymous).toBe(true);
    expect(a?.role).toBe('Tenant');
    expect(a?.userId).toBeTruthy();
    // The headline isolation guarantee: two visitors never share an identity.
    expect(a?.userId).not.toBe(b?.userId);
    // And it is NOT the shared seeded demo Tenant.
    const seededTenant = DEMO_USERS.find((u) => u.role === 'Tenant');
    expect(a?.userId).not.toBe(seededTenant?.id);
  });

  it('mints a per-visitor (non-sample) workspace cookie', async () => {
    const res = await middleware(new NextRequest('http://localhost/'));
    const ws = await decodeWorkspace(
      res.cookies.get('leaselens_workspace')?.value ?? '',
    );
    expect(ws?.workspace_id).toBeTruthy();
    expect(ws?.workspace_id).not.toBe(SAMPLE_WORKSPACE.id);
  });

  it('leaves the demo/default path unchanged when public mode is off', async () => {
    process.env.LEASELENS_PUBLIC_ANON_MODE = 'false';
    const res = await middleware(new NextRequest('http://localhost/'));
    const session = await decrypt(
      res.cookies.get('leaselens_session')?.value ?? '',
    );
    // Seeded Tenant, not anonymous.
    expect(session?.anonymous).toBe(false);
    const seededTenant = DEMO_USERS.find((u) => u.role === 'Tenant');
    expect(session?.userId).toBe(seededTenant?.id);
    // Sample workspace.
    const ws = await decodeWorkspace(
      res.cookies.get('leaselens_workspace')?.value ?? '',
    );
    expect(ws?.workspace_id).toBe(SAMPLE_WORKSPACE.id);
  });
});
