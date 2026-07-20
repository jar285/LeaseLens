/**
 * POST /api/workspaces/select — switch the active workspace to a brand
 * the visitor previously uploaded. The target id must be in the visitor's
 * cookie-list of created brands (defense in depth — prevents arbitrary
 * impersonation of someone else's workspace) AND the underlying row must
 * still be alive (not TTL-expired).
 *
 * Sample workspace switching goes through /api/workspaces/select-sample,
 * not here. The is-sample check below 403s an attempt to use this route
 * for the sample.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/http/error-response';
import { requestIdFrom } from '@/lib/log/request-id';
import {
  SAMPLE_WORKSPACE,
  WORKSPACE_TTL_SECONDS,
} from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Sprint D.12a (#12) — normalized error envelope throughout; original
  // messages preserved as developer-authored overrides.
  const requestId = requestIdFrom(req.headers);
  const incoming = req.cookies.get(WORKSPACE_COOKIE_NAME);
  const prior = incoming ? await decodeWorkspace(incoming.value) : null;
  if (!prior) {
    return errorResponse('UNAUTHENTICATED', {
      requestId,
      message: 'No workspace cookie',
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('VALIDATION', { requestId, message: 'Invalid JSON' });
  }
  const targetId =
    typeof body === 'object' &&
    body !== null &&
    'workspace_id' in body &&
    typeof (body as { workspace_id: unknown }).workspace_id === 'string'
      ? (body as { workspace_id: string }).workspace_id
      : null;
  if (!targetId) {
    return errorResponse('VALIDATION', {
      requestId,
      message: 'workspace_id required',
    });
  }

  if (targetId === SAMPLE_WORKSPACE.id) {
    return errorResponse('FORBIDDEN', {
      requestId,
      message: 'Use /api/workspaces/select-sample for the sample workspace',
    });
  }

  if (!prior.created_workspace_ids.includes(targetId)) {
    return errorResponse('FORBIDDEN', {
      requestId,
      message: 'Target workspace is not in your created list',
    });
  }

  const target = getActiveWorkspace(db, targetId);
  if (!target) {
    return errorResponse('NOT_FOUND', {
      requestId,
      message: 'Workspace not found or expired',
    });
  }

  const token = await encodeWorkspace({
    workspace_id: targetId,
    created_workspace_ids: prior.created_workspace_ids,
  });

  const res = NextResponse.json({ workspace_id: targetId }, { status: 200 });
  res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WORKSPACE_TTL_SECONDS,
  });
  return res;
}
