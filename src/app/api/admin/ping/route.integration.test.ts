import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { encrypt } from '@/lib/auth/session';
import { middleware } from '@/middleware';
import { GET } from './route';

describe('Admin Ping Endpoint Integration', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    // Ensure the secret is set for real jose operations
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  async function executeRequestFlow(role: 'Admin' | 'Creator' | 'Editor') {
    const request = new NextRequest(new URL('/api/admin/ping', baseUrl));

    // Generate real encrypted cookie
    const token = await encrypt({
      userId: `test-${role.toLowerCase()}`,
      role: role,
      displayName: `Test ${role}`,
    });

    request.cookies.set('leaselens_session', token);

    // 1. Run through middleware
    const mwResponse = await middleware(request);

    // If middleware blocks it, return its response
    if (mwResponse?.status !== 200) {
      return mwResponse;
    }

    // 2. If middleware passes (returns NextResponse.next() which has status 200),
    // execute the route handler
    return await GET();
  }

  it('should return 200 OK for Admin role', async () => {
    const response = await executeRequestFlow('Admin');
    expect(response?.status).toBe(200);

    const body = await response?.json();
    expect(body).toEqual({ message: 'Admin verified' });
  });

  it('should return 403 Forbidden for Creator role', async () => {
    const response = await executeRequestFlow('Creator');
    expect(response?.status).toBe(403);

    const body = await response?.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('should return 403 Forbidden for Editor role', async () => {
    const response = await executeRequestFlow('Editor');
    expect(response?.status).toBe(403);

    const body = await response?.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });
});
