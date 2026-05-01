// GET /api/audit — RBAC-filtered audit log read API.
//
// Sprint 8 spec sections 4.5, 8.1.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { listAuditRows } from '@/lib/tools/audit-log';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  // Resolve session (mirrors the chat route fallback at route.ts:111-124)
  const sessionCookie = request.cookies.get('contentops_session');
  let userId: string | undefined = DEMO_USERS.find(
    (u) => u.role === 'Creator',
  )?.id;
  let role: Role = 'Creator';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      userId = payload.userId;
      role = payload.role;
    }
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.min(
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw ? Number(sinceRaw) : undefined;

  // Admin sees all; non-admins only their own audit rows.
  const entries = listAuditRows(db, {
    actorUserId: role === 'Admin' ? undefined : userId,
    limit,
    since: Number.isFinite(since) ? since : undefined,
  });

  const next_since =
    entries.length === limit ? entries[entries.length - 1].created_at : null;

  return NextResponse.json({ entries, next_since });
}
