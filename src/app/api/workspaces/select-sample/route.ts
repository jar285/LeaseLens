/**
 * POST /api/workspaces/select-sample — sets the workspace cookie to the
 * sample workspace and returns the new id. The onboarding "Try sample
 * brand" CTA POSTs here.
 *
 * Sprint 11 §4.4.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { SAMPLE_WORKSPACE, WORKSPACE_TTL_SECONDS } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Preserve the visitor's created-brands list when switching to sample;
  // the menu's history of uploaded brands lives in the cookie, not the DB.
  const incoming = req.cookies.get(WORKSPACE_COOKIE_NAME);
  const prior = incoming ? await decodeWorkspace(incoming.value) : null;
  const created_workspace_ids = prior?.created_workspace_ids ?? [];

  const token = await encodeWorkspace({
    workspace_id: SAMPLE_WORKSPACE.id,
    created_workspace_ids,
  });
  const res = NextResponse.json(
    { workspace_id: SAMPLE_WORKSPACE.id },
    { status: 200 },
  );
  res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WORKSPACE_TTL_SECONDS,
  });
  return res;
}
