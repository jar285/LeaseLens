// POST /api/audit/[id]/rollback — atomic compensating-action + status-update.
//
// Sprint 8 spec section 4.4. Audit-ownership policy (P1): Admin can roll
// back any row; Editor/Creator only their own. The descriptor's current
// `roles` array is NOT consulted — rollback runs a pre-recorded compensating
// action whose authorization was already gated at the original mutation site.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/http/error-response';
import { logger } from '@/lib/log/logger';
import { requestIdFrom } from '@/lib/log/request-id';
import { getAuditRow, markRolledBack } from '@/lib/tools/audit-log';
import { createToolRegistry } from '@/lib/tools/create-registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Sprint D.12a (#12) — correlation id for the normalized error envelope.
  const requestId = requestIdFrom(request.headers);

  // 1. Resolve session (no-cookie → Creator default, mirrors chat route).
  const sessionCookie = request.cookies.get('leaselens_session');
  let userId: string | undefined = DEMO_USERS.find(
    (u) => u.role === 'Tenant',
  )?.id;
  let role: Role = 'Tenant';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      userId = payload.userId;
      role = payload.role;
    }
  }
  if (!userId) {
    return errorResponse('UNAUTHENTICATED', { requestId });
  }

  // 2. Load audit row.
  const row = getAuditRow(db, id);
  if (!row) {
    return errorResponse('NOT_FOUND', { requestId });
  }

  // 3. RBAC — audit-ownership policy (P1).
  if (role !== 'Admin' && row.actor_user_id !== userId) {
    return errorResponse('FORBIDDEN', { requestId });
  }

  // 4. Idempotent.
  if (row.status === 'rolled_back') {
    return NextResponse.json({ already_rolled_back: true, audit_id: id });
  }

  // 5. Look up descriptor.
  const registry = createToolRegistry(db);
  const descriptor = registry.getDescriptor(row.tool_name);
  if (!descriptor?.compensatingAction) {
    return errorResponse('GONE', {
      requestId,
      message: 'Tool no longer registered',
    });
  }
  const compensatingAction = descriptor.compensatingAction;

  // 6. Run inside a sync transaction. If compensatingAction throws, the
  //    UPDATE doesn't run and the audit row stays 'executed'.
  try {
    db.transaction(() => {
      compensatingAction(JSON.parse(row.compensating_action_json), {
        role: row.actor_role,
        userId: row.actor_user_id,
        conversationId: row.conversation_id ?? '',
        // Sprint 11: rebuild ctx from the audit row itself so the
        // compensating action operates against the same workspace it
        // mutated. workspace_id is stored on the audit row at write time.
        workspaceId: row.workspace_id,
      });
      markRolledBack(db, id);
    })();
  } catch (err) {
    // Sprint D.12a (#12) — PII fix: a compensating-action error can embed
    // draft-email/clause content in err.message (e.g. a JSON.parse
    // SyntaxError). Log the detail server-side (the err serializer scrubs);
    // the client gets only the safe canned envelope.
    logger.error({ err, requestId, auditId: id }, 'audit.rollback_failed');
    return errorResponse('INTERNAL', {
      requestId,
      message: 'Rollback failed',
    });
  }

  return NextResponse.json({ rolled_back: true, audit_id: id });
}
