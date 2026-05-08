// Sprint 13 §3h — three-step lease-id resolution.
//
// The chat route always has a `conversationId` and can resolve the
// active lease implicitly. The MCP server (mcp/leaselens-server.ts)
// uses a synthetic `mcp-session` conversationId that has no row in
// the conversations table, so MCP callers must pass `lease_id`
// explicitly. This single helper enforces the contract for both
// transports.
//
// Resolution order:
//   1. Explicit input.lease_id (workspace-checked)
//   2. conversations.active_lease_id (workspace-checked)
//   3. Phase 10 hotfix F — opt-in recent-upload fallback. Only the
//      chat route opts in via `enableRecentLeaseFallback: true`. We
//      look up the most recent lease in the workspace uploaded by
//      `ctx.userId` within the last 30 minutes, then promote that
//      binding by writing it onto conversations.active_lease_id so
//      subsequent calls in the same conversation hit step 2 instead.
//      MCP path (spec H5) leaves the flag off — explicit lease_id
//      remains required there.
//   4. Throw with a message naming the ways to provide it.

import type Database from 'better-sqlite3';

const RECENT_UPLOAD_WINDOW_SECONDS = 30 * 60;

export interface ResolveLeaseIdContext {
  workspaceId: string;
  conversationId?: string | null;
  /**
   * Required to activate step 3 (recent-upload fallback). Used to
   * scope the recent-lease query to a single user. The chat route
   * always has it; MCP synthetic sessions also pass `'mcp-server'`
   * but leave `enableRecentLeaseFallback` false.
   */
  userId?: string | null;
  /**
   * Opt-in flag for step 3. Default false (explicit + active_lease
   * only). Charter §4 / spec H5 keeps MCP behavior deterministic
   * by leaving this off there.
   */
  enableRecentLeaseFallback?: boolean;
  /**
   * Override "now" for deterministic tests. Defaults to wall clock
   * in epoch seconds.
   */
  now?: number;
}

interface LeaseRow {
  id: string;
  workspace_id: string;
}

interface ConversationRow {
  active_lease_id: string | null;
}

const NO_LEASE_MESSAGE =
  'No lease specified. Provide `lease_id` in the tool input, or upload a lease so the conversation has an active_lease_id.';

function loadLease(
  db: Database.Database,
  leaseId: string,
): LeaseRow | undefined {
  return db
    .prepare('SELECT id, workspace_id FROM leases WHERE id = ?')
    .get(leaseId) as LeaseRow | undefined;
}

function assertLeaseInWorkspace(
  lease: LeaseRow | undefined,
  leaseId: string,
  workspaceId: string,
): asserts lease is LeaseRow {
  if (!lease) {
    throw new Error(`Unknown lease_id: ${leaseId}`);
  }
  if (lease.workspace_id !== workspaceId) {
    throw new Error(`Lease ${leaseId} does not belong to the active workspace`);
  }
}

function findRecentUserLease(
  db: Database.Database,
  workspaceId: string,
  userId: string,
  cutoff: number,
): { id: string } | undefined {
  return db
    .prepare(
      `SELECT id FROM leases
       WHERE workspace_id = ? AND uploaded_by = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(workspaceId, userId, cutoff) as { id: string } | undefined;
}

export function resolveLeaseId(
  db: Database.Database,
  input: { lease_id?: unknown },
  ctx: ResolveLeaseIdContext,
): string {
  // 1. Explicit lease_id from the tool input wins.
  if (typeof input.lease_id === 'string' && input.lease_id.length > 0) {
    const lease = loadLease(db, input.lease_id);
    assertLeaseInWorkspace(lease, input.lease_id, ctx.workspaceId);
    return lease.id;
  }

  // 2. Conversation-scoped fallback. Skipped when conversationId is
  //    empty (MCP synthetic session) or absent.
  if (ctx.conversationId) {
    const conv = db
      .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
      .get(ctx.conversationId) as ConversationRow | undefined;
    if (conv?.active_lease_id) {
      const lease = loadLease(db, conv.active_lease_id);
      assertLeaseInWorkspace(lease, conv.active_lease_id, ctx.workspaceId);
      return lease.id;
    }
  }

  // 3. Opt-in recent-upload fallback. The chat route enables this so
  //    a fresh-page user who just uploaded a PDF can immediately ask
  //    "scan my lease" without the conversation having been bound at
  //    upload time. Promotes the binding to explicit so subsequent
  //    calls hit step 2.
  if (ctx.enableRecentLeaseFallback && ctx.conversationId && ctx.userId) {
    const now = ctx.now ?? Math.floor(Date.now() / 1000);
    const cutoff = now - RECENT_UPLOAD_WINDOW_SECONDS;
    const recent = findRecentUserLease(db, ctx.workspaceId, ctx.userId, cutoff);
    if (recent) {
      db.prepare(
        'UPDATE conversations SET active_lease_id = ? WHERE id = ?',
      ).run(recent.id, ctx.conversationId);
      return recent.id;
    }
  }

  // 4. Neither path produced an id. Surface a single message that
  //    names both ways the caller can fix it.
  throw new Error(NO_LEASE_MESSAGE);
}
