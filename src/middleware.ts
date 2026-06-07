import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt, encrypt } from '@/lib/auth/session';
import { REQUEST_ID_HEADER } from '@/lib/log/request-id';
import {
  SAMPLE_WORKSPACE,
  WORKSPACE_TTL_SECONDS,
} from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

/**
 * Routes that require an authenticated session.
 * The page route (/) is included so a default Creator cookie is issued
 * on first load, preventing role state loss on refresh.
 */
const SESSION_ROUTES = ['/', '/api/admin', '/api/chat', '/api/conversations'];

/** Routes restricted to Admin role only. */
const ADMIN_ONLY_PREFIXES = ['/api/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Sprint 44A.2 — one correlation id per request. Forward it onto the request
  // headers (so Node route handlers read it via headers()/req.headers) and echo
  // it on every response (so client errors + server logs can be joined). Stamped
  // on EVERY matched path, including the early return below. Header-only here —
  // Pino is never imported into this (Edge) file.
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  const forward = { request: { headers: requestHeaders } };

  // 1. Skip routes that don't need session handling
  const needsSession =
    pathname === '/' ||
    SESSION_ROUTES.some(
      (prefix) => prefix !== '/' && pathname.startsWith(prefix),
    );
  if (!needsSession) {
    const passthrough = NextResponse.next(forward);
    passthrough.headers.set(REQUEST_ID_HEADER, requestId);
    return passthrough;
  }

  // 2. Extract and verify existing session
  const cookie = request.cookies.get('leaselens_session');
  let session = cookie ? await decrypt(cookie.value) : null;

  const response = NextResponse.next(forward);
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // 3. Issue a default Creator session when none exists
  if (!session) {
    const creatorUser = DEMO_USERS.find((u) => u.role === 'Tenant');
    if (creatorUser) {
      session = {
        userId: creatorUser.id,
        role: creatorUser.role,
        displayName: creatorUser.display_name,
      };
      const token = await encrypt(session);
      response.cookies.set('leaselens_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  }

  // 4. Issue a default sample-workspace cookie when none exists or the
  // existing one fails signature verification. The chat API still treats
  // an absent/invalid workspace as 401 — this just keeps the home page
  // from looping when a first-time visitor lands at /.
  const workspaceCookie = request.cookies.get(WORKSPACE_COOKIE_NAME);
  const workspacePayload = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  if (!workspacePayload) {
    const token = await encodeWorkspace({
      workspace_id: SAMPLE_WORKSPACE.id,
      created_workspace_ids: [],
    });
    response.cookies.set(WORKSPACE_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: WORKSPACE_TTL_SECONDS,
    });
  }

  // 5. Role-based authorization for API routes
  if (session) {
    if (
      ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) &&
      session.role !== 'Admin'
    ) {
      const forbidden = NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 },
      );
      forbidden.headers.set(REQUEST_ID_HEADER, requestId);
      return forbidden;
    }
  } else if (pathname.startsWith('/api/')) {
    // Only block API routes — page route falls through to the Server Component
    const unauthorized = NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
    unauthorized.headers.set(REQUEST_ID_HEADER, requestId);
    return unauthorized;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
