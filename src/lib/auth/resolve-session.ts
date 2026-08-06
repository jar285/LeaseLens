// Sprint B.15 (#15) — the single fail-closed session+workspace resolver for the
// lease routes. Replaces the duplicated route-local resolveSession/
// resolveWorkspaceId in leases/route.ts + leases/[id]/route.ts, which silently
// fell back to the seeded demo Tenant + immortal sample workspace on a missing
// cookie. In public-anon mode that fallback is a data-isolation hole (every
// cookieless visitor collapses onto one shared identity), so here we fail CLOSED
// (Robert C. Martin: authz at the boundary; Google SRE: fail closed at trust
// boundaries). The demo/default profile keeps the legacy seeded fallback so the
// portfolio deploy is behavior-preserving.
//
// NODE-ONLY: imports auth/mode.ts (validated env) + better-sqlite3. Never import
// from middleware (Edge) — mint anon identities there via anon-identity.ts.

import type Database from 'better-sqlite3';
import type { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/http/error-response';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
} from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';
import { DEMO_USERS } from './constants';
import { isPublicAnonMode } from './mode';
import { decrypt } from './session';
import type { Role } from './types';

export type RequireSessionResult =
  | { ok: true; userId: string; role: Role; workspaceId: string }
  | { ok: false; response: NextResponse };

export interface RequireSessionOptions {
  /** Correlation id threaded into the 401 envelope for log-joining. */
  requestId?: string;
  /**
   * Read paths (GET) set this so an expired/missing workspace 401s — parity
   * with /api/chat. Write paths (POST/upload) leave it false so the route can
   * materialize the visitor's per-visitor workspace row after the TTL purge.
   */
  requireActiveWorkspace?: boolean;
}

/**
 * Resolve the caller's identity + active workspace, failing closed in
 * public-anon mode. On failure returns a ready-to-send NextResponse (401) so
 * route handlers stay flat: `if (!r.ok) return r.response;`.
 */
export async function requireSessionOrAnon(
  req: NextRequest,
  db: Database.Database,
  opts: RequireSessionOptions = {},
): Promise<RequireSessionResult> {
  const { requestId, requireActiveWorkspace = false } = opts;
  const publicMode = isPublicAnonMode();

  // --- Session ---------------------------------------------------------------
  let userId: string | undefined;
  let role: Role = 'Tenant';

  const sessionCookie = req.cookies.get('leaselens_session');
  if (sessionCookie) {
    const claims = await decrypt(sessionCookie.value);
    if (claims?.userId) {
      userId = claims.userId;
      role = claims.role;
    }
  }

  if (!userId) {
    if (publicMode) {
      // Fail closed — NEVER the seeded demo Tenant.
      return {
        ok: false,
        response: errorResponse('UNAUTHENTICATED', { requestId }),
      };
    }
    // Demo/default: seeded-Tenant fallback (behavior-preserving).
    const seeded = DEMO_USERS.find((u) => u.role === 'Tenant');
    if (!seeded) {
      throw new Error('No Tenant demo user seeded; seed.ts must run first');
    }
    userId = seeded.id;
    role = 'Tenant';
  }

  // --- Workspace -------------------------------------------------------------
  const workspaceCookie = req.cookies.get(WORKSPACE_COOKIE_NAME);
  const decoded = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  const wsId = decoded?.workspace_id;

  let workspaceId: string;
  if (publicMode) {
    if (!wsId) {
      return {
        ok: false,
        response: errorResponse('UNAUTHENTICATED', { requestId }),
      };
    }
    // Never resolve a public visitor onto a shared immortal (is_sample=1)
    // workspace — anon lease data must land only in the visitor's own
    // expiring workspace. Runs BEFORE the active-row check below, since
    // getActiveWorkspace returns sample rows.
    if (wsId === SAMPLE_WORKSPACE.id || wsId === SAMPLE_CLEAN_WORKSPACE.id) {
      return {
        ok: false,
        response: errorResponse('UNAUTHENTICATED', { requestId }),
      };
    }
    if (requireActiveWorkspace) {
      // Sprint D.20 (#20) — purge-before-resolve: without this, an expired
      // workspace's children (tenant PII) linger until someone happens to hit
      // a write route. Cheap when idle (one indexed SELECT, early return).
      purgeExpiredWorkspaces(db);
      if (!getActiveWorkspace(db, wsId)) {
        return {
          ok: false,
          response: errorResponse('UNAUTHENTICATED', { requestId }),
        };
      }
    }
    workspaceId = wsId;
  } else {
    // Demo/default: use the cookie workspace when it resolves to an active row,
    // else fall back to the sample (preserved).
    workspaceId =
      wsId && getActiveWorkspace(db, wsId) ? wsId : SAMPLE_WORKSPACE.id;
  }

  return { ok: true, userId, role, workspaceId };
}
