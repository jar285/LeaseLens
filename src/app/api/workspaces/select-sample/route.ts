/**
 * POST /api/workspaces/select-sample — sets the workspace cookie to the
 * sample workspace and returns the new id. The onboarding "Try sample
 * brand" CTA POSTs here.
 *
 * Sprint 11 §4.4.
 */

import { NextResponse } from 'next/server';
import { SAMPLE_WORKSPACE, WORKSPACE_TTL_SECONDS } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const token = await encodeWorkspace({ workspace_id: SAMPLE_WORKSPACE.id });
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
