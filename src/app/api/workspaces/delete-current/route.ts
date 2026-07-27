/**
 * Sprint D.19 (#19) — POST /api/workspaces/delete-current.
 *
 * "Delete my review now": permanently deletes the CALLER'S OWN cookie
 * workspace — lease, clauses, red flags, chat, tool logs — on demand, instead
 * of waiting out the 24h TTL (Dieter Rams: honest temporary storage means the
 * user can end the storage, not just outlive it).
 *
 * Deliberately takes NO body: the target is always the caller's own cookie
 * workspace, so there is no id to spoof (a stronger stance than a membership
 * check). Samples are never deletable (403) — the shared demo data is not a
 * visitor's to destroy; purgeWorkspaceNow enforces the same invariant again
 * at the data layer (defense in depth).
 *
 * Sprint D.19b — in public-anon mode the 200 response ROTATES the workspace
 * cookie to a fresh, empty, non-sample workspace id (middleware parity)
 * instead of just clearing it. The original "clear and let middleware re-mint
 * on the next navigation" design assumed a navigation would happen — but the
 * client's Mode B→A flip after delete is pure React state, /api/leases is not
 * a middleware minting route, and requireSessionOrAnon fails closed, so the
 * visitor's very next upload 401'd until a reload. Demo/default keeps the
 * plain clear: its resolver falls back to the sample workspace, so no
 * replacement is needed.
 *
 * Status codes: 200 { deleted: true } · 401 (no/invalid identity or cookie,
 * fail-closed in public mode) · 403 (sample workspace).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { isPublicAnonMode } from '@/lib/auth/mode';
import { requireSessionOrAnon } from '@/lib/auth/resolve-session';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/http/error-response';
import { requestIdFrom } from '@/lib/log/request-id';
import { purgeWorkspaceNow } from '@/lib/workspaces/cleanup';
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
  WORKSPACE_TTL_SECONDS,
} from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(req.headers);

  const resolved = await requireSessionOrAnon(req, db, {
    requestId,
    requireActiveWorkspace: false,
  });
  if (!resolved.ok) return resolved.response;
  const { workspaceId } = resolved;

  // Demo/default mode resolves a cookieless caller to the sample — refuse
  // both immortal samples explicitly (public mode already 401s them upstream).
  if (
    workspaceId === SAMPLE_WORKSPACE.id ||
    workspaceId === SAMPLE_CLEAN_WORKSPACE.id
  ) {
    return errorResponse('FORBIDDEN', {
      requestId,
      message: 'The sample workspace cannot be deleted.',
    });
  }

  purgeWorkspaceNow(db, workspaceId);

  const res = NextResponse.json({ deleted: true }, { status: 200 });
  if (isPublicAnonMode()) {
    // Sprint D.19b — rotate, don't clear (see the header comment). Options
    // mirror middleware.ts's workspace-cookie mint exactly; the workspace ROW
    // is materialized later by the upload route (ensureAnonWorkspaceExists),
    // same as a middleware-minted id.
    const token = await encodeWorkspace({
      workspace_id: crypto.randomUUID(),
      created_workspace_ids: [],
    });
    res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: WORKSPACE_TTL_SECONDS,
    });
  } else {
    res.cookies.delete(WORKSPACE_COOKIE_NAME);
  }
  return res;
}
