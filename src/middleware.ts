import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt, encrypt } from '@/lib/auth/session';

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

  // 1. Skip routes that don't need session handling
  const needsSession =
    pathname === '/' ||
    SESSION_ROUTES.some(
      (prefix) => prefix !== '/' && pathname.startsWith(prefix),
    );
  if (!needsSession) {
    return NextResponse.next();
  }

  // 2. Extract and verify existing session
  const cookie = request.cookies.get('contentops_session');
  let session = cookie ? await decrypt(cookie.value) : null;

  const response = NextResponse.next();

  // 3. Issue a default Creator session when none exists
  if (!session) {
    const creatorUser = DEMO_USERS.find((u) => u.role === 'Creator');
    if (creatorUser) {
      session = {
        userId: creatorUser.id,
        role: creatorUser.role,
        displayName: creatorUser.display_name,
      };
      const token = await encrypt(session);
      response.cookies.set('contentops_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });
    }
  }

  // 4. Role-based authorization for API routes
  if (session) {
    if (
      ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) &&
      session.role !== 'Admin'
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (pathname.startsWith('/api/')) {
    // Only block API routes — page route falls through to the Server Component
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
