/**
 * Sprint 24.3 — POST /api/workspaces/select-clean-sample
 *
 * Sets the workspace cookie to the clean (NJ-compliant) sample
 * workspace and returns the new id. Mirrors /api/workspaces/select-sample
 * but targets SAMPLE_CLEAN_WORKSPACE so the operator can swap between
 * the red-flag-heavy and NJ-compliant sample leases to compare the
 * cockpit's SeverityDistribution / per-tool stats / lease pipeline
 * panels under both states.
 *
 * `created_workspace_ids` from any prior cookie is preserved so the
 * user's history of uploaded brands isn't lost during the switch.
 */

import { type NextRequest, NextResponse } from 'next/server';
import {
  SAMPLE_CLEAN_WORKSPACE,
  WORKSPACE_TTL_SECONDS,
} from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const incoming = req.cookies.get(WORKSPACE_COOKIE_NAME);
  const prior = incoming ? await decodeWorkspace(incoming.value) : null;
  const created_workspace_ids = prior?.created_workspace_ids ?? [];

  const token = await encodeWorkspace({
    workspace_id: SAMPLE_CLEAN_WORKSPACE.id,
    created_workspace_ids,
  });
  const res = NextResponse.json(
    { workspace_id: SAMPLE_CLEAN_WORKSPACE.id },
    { status: 200 },
  );
  res.cookies.delete(WORKSPACE_COOKIE_NAME);
  res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: WORKSPACE_TTL_SECONDS,
  });
  return res;
}
