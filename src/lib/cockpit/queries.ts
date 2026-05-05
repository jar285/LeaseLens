import type Database from 'better-sqlite3';
import { estimateCost } from '@/lib/db/spend';
import type {
  ApprovalRecord,
  CockpitAuditRow,
  ScheduledItem,
  SpendSnapshot,
} from './types';

interface ListAuditOpts {
  /** Sprint 11: required — every cockpit read filters by workspace. */
  workspaceId: string;
  actorUserId?: string;
  limit: number;
}

/**
 * Audit-log feed for the cockpit. LEFT JOINs users so the panel can render
 * actor display name; the join yields NULL for actor_user_id values not
 * present in users (notably 'mcp-server' for MCP-originated rows). The
 * panel falls back to rendering the literal actor_user_id (Spec §6.2).
 *
 * Sprint 11: workspace-scoped — `WHERE a.workspace_id = ?`.
 */
export function listRecentAuditRows(
  db: Database.Database,
  opts: ListAuditOpts,
): CockpitAuditRow[] {
  const whereClauses: string[] = ['a.workspace_id = @workspace_id'];
  const params: Record<string, unknown> = {
    limit: opts.limit,
    workspace_id: opts.workspaceId,
  };
  if (opts.actorUserId !== undefined) {
    whereClauses.push('a.actor_user_id = @actor_user_id');
    params.actor_user_id = opts.actorUserId;
  }
  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
  return db
    .prepare(
      `SELECT a.*, u.display_name AS actor_display_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ${whereSql}
         ORDER BY a.created_at DESC
         LIMIT @limit`,
    )
    .all(params) as CockpitAuditRow[];
}

interface ListScheduledOpts {
  workspaceId: string;
  scheduledBy?: string;
  limit: number;
}

export function listScheduledItems(
  db: Database.Database,
  opts: ListScheduledOpts,
): ScheduledItem[] {
  const whereClauses: string[] = ['workspace_id = @workspace_id'];
  const params: Record<string, unknown> = {
    limit: opts.limit,
    workspace_id: opts.workspaceId,
  };
  if (opts.scheduledBy !== undefined) {
    whereClauses.push('scheduled_by = @scheduled_by');
    params.scheduled_by = opts.scheduledBy;
  }
  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
  return db
    .prepare(
      `SELECT * FROM content_calendar ${whereSql}
       ORDER BY scheduled_for ASC LIMIT @limit`,
    )
    .all(params) as ScheduledItem[];
}

interface ListApprovalsOpts {
  workspaceId: string;
  approvedBy?: string;
  limit: number;
}

export function listRecentApprovals(
  db: Database.Database,
  opts: ListApprovalsOpts,
): ApprovalRecord[] {
  const whereClauses: string[] = ['workspace_id = @workspace_id'];
  const params: Record<string, unknown> = {
    limit: opts.limit,
    workspace_id: opts.workspaceId,
  };
  if (opts.approvedBy !== undefined) {
    whereClauses.push('approved_by = @approved_by');
    params.approved_by = opts.approvedBy;
  }
  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
  return db
    .prepare(
      `SELECT * FROM approvals ${whereSql}
       ORDER BY created_at DESC LIMIT @limit`,
    )
    .all(params) as ApprovalRecord[];
}

/**
 * Reads today's row from spend_log. The WHERE date = date('now') clause is
 * non-negotiable: the writer at src/lib/db/spend.ts:32 uses the same SQLite
 * function (UTC), so reader and writer agree on what "today" means
 * regardless of host timezone (Spec §4.3 / sprint-QA H2).
 *
 * Returns zeros when no row exists. estimated_dollars is computed via
 * estimateCost from src/lib/db/spend.ts — the same function the
 * daily-spend ceiling check uses, single source of truth.
 */
export function getTodaySpend(db: Database.Database): SpendSnapshot {
  const row = db
    .prepare(
      "SELECT date, tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
    )
    .get() as
    | { date: string; tokens_in: number; tokens_out: number }
    | undefined;

  const today = (db.prepare("SELECT date('now') AS d").get() as { d: string })
    .d;

  if (!row) {
    return { date: today, tokens_in: 0, tokens_out: 0, estimated_dollars: 0 };
  }

  return {
    date: row.date,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    estimated_dollars: estimateCost(row.tokens_in, row.tokens_out),
  };
}
