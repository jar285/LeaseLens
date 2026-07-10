/**
 * Sprint 13 §3c — GET /api/leases/[id]
 *
 * Returns { lease, clauses } for the authenticated caller after the
 * §2.12 ownership check. Tenants see only leases they uploaded;
 * Reviewer + Admin see any lease in the active workspace.
 *
 * Status codes:
 *   200 — lease + clauses returned
 *   401 — public-anon mode with no/invalid session or workspace (fail closed)
 *   403 — Tenant attempting access to another user's lease
 *   404 — lease not found in active workspace
 *
 * Sprint B.15 (#15) — identity + workspace resolve through the shared
 * fail-closed `requireSessionOrAnon`. In public-anon mode a missing/invalid
 * session or workspace → 401; it NEVER falls back to the seeded demo Tenant or
 * the immortal sample workspace (which collapsed every visitor onto one shared
 * identity). Read path → `requireActiveWorkspace: true` (parity with /api/chat).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { requireSessionOrAnon } from '@/lib/auth/resolve-session';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/http/error-response';
import { assertLeaseOwnership } from '@/lib/lease/assert-lease-ownership';
import { getLease, listClauses } from '@/lib/lease/queries';
import { requestIdFrom } from '@/lib/log/request-id';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const requestId = requestIdFrom(req.headers);
  const { id: leaseId } = await params;

  const resolved = await requireSessionOrAnon(req, db, {
    requestId,
    requireActiveWorkspace: true,
  });
  if (!resolved.ok) return resolved.response;
  const { userId, role, workspaceId } = resolved;

  const lease = getLease(db, leaseId, workspaceId);
  if (!lease) {
    return errorResponse('NOT_FOUND', {
      requestId,
      message: 'Lease not found in active workspace',
    });
  }

  try {
    assertLeaseOwnership(lease, { role, userId });
  } catch (_err) {
    return errorResponse('FORBIDDEN', {
      requestId,
      message: 'You do not have access to this lease',
    });
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
