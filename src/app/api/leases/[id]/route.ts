/**
 * Sprint 13 §3c — GET /api/leases/[id]
 *
 * Returns { lease, clauses } for the authenticated caller after the
 * §2.12 ownership check. Tenants see only leases they uploaded;
 * Reviewer + Admin see any lease in the active workspace.
 *
 * Status codes:
 *   200 — lease + clauses returned
 *   403 — Tenant attempting access to another user's lease
 *   404 — lease not found in active workspace
 */

import { type NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { assertLeaseOwnership } from '@/lib/lease/assert-lease-ownership';
import { getLease, listClauses } from '@/lib/lease/queries';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

interface ResolvedSession {
  userId: string;
  role: Role;
}

async function resolveSession(req: NextRequest): Promise<ResolvedSession> {
  const cookie = req.cookies.get('leaselens_session');
  if (cookie) {
    const claims = await decrypt(cookie.value);
    if (claims) {
      return { userId: claims.userId, role: claims.role };
    }
  }
  const fallback = DEMO_USERS.find((u) => u.role === 'Creator');
  if (!fallback) {
    throw new Error('No Creator demo user seeded; seed.ts must run first');
  }
  return { userId: fallback.id, role: 'Creator' };
}

async function resolveWorkspaceId(req: NextRequest): Promise<string> {
  const cookie = req.cookies.get(WORKSPACE_COOKIE_NAME);
  if (cookie) {
    const decoded = await decodeWorkspace(cookie.value);
    if (decoded?.workspace_id) {
      const exists = db
        .prepare('SELECT id FROM workspaces WHERE id = ?')
        .get(decoded.workspace_id);
      if (exists) return decoded.workspace_id;
    }
  }
  return SAMPLE_WORKSPACE.id;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: leaseId } = await params;
  const session = await resolveSession(req);
  const workspaceId = await resolveWorkspaceId(req);

  const lease = getLease(db, leaseId, workspaceId);
  if (!lease) {
    return NextResponse.json(
      { error: 'Lease not found in active workspace' },
      { status: 404 },
    );
  }

  try {
    assertLeaseOwnership(lease, {
      role: session.role,
      userId: session.userId,
    });
  } catch (_err) {
    return NextResponse.json(
      { error: 'You do not have access to this lease' },
      { status: 403 },
    );
  }

  const clauses = listClauses(db, leaseId, workspaceId);

  return NextResponse.json(
    {
      lease: {
        id: lease.id,
        workspace_id: lease.workspace_id,
        filename: lease.filename,
        page_count: lease.page_count,
        uploaded_by: lease.uploaded_by,
        created_at: lease.created_at,
      },
      clauses: clauses.map((c) => ({
        clause_id: c.id,
        clause_index: c.clause_index,
        clause_type: c.clause_type,
        text: c.text,
        page_number: c.page_number,
      })),
    },
    { status: 200 },
  );
}
