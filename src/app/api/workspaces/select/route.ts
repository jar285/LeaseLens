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
  const incoming = req.cookies.get(WORKSPACE_COOKIE_NAME);
  const prior = incoming ? await decodeWorkspace(incoming.value) : null;
  if (!prior) {
    return NextResponse.json(
      { error: 'No workspace cookie' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const targetId =
    typeof body === 'object' &&
    body !== null &&
    'workspace_id' in body &&
    typeof (body as { workspace_id: unknown }).workspace_id === 'string'
      ? (body as { workspace_id: string }).workspace_id
      : null;
  if (!targetId) {
    return NextResponse.json(
      { error: 'workspace_id required' },
      { status: 400 },
    );
  }

  if (targetId === SAMPLE_WORKSPACE.id) {
    return NextResponse.json(
      { error: 'Use /api/workspaces/select-sample for the sample workspace' },
      { status: 403 },
    );
  }

  if (!prior.created_workspace_ids.includes(targetId)) {
    return NextResponse.json(
      { error: 'Target workspace is not in your created list' },
      { status: 403 },
    );
  }

  const target = getActiveWorkspace(db, targetId);
  if (!target) {
    return NextResponse.json(
      { error: 'Workspace not found or expired' },
      { status: 404 },
    );
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
