import type Database from 'better-sqlite3';
import { fromDbRole } from '@/lib/auth/role-codec';
import { estimateCost } from '@/lib/db/spend';
import type {
  ApprovalRecord,
  CockpitAuditRow,
  CockpitToolCallRow,
  LeasePipelineStats,
  PerToolStat,
  ScheduledItem,
  SeverityDistribution,
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

/**
 * Sprint 24.5 — unified tool-call feed for the cockpit AuditFeedPanel.
 *
 * Reads from `tool_calls` (every invocation, read-only AND mutating)
 * with a LEFT JOIN to `audit_log` via `tool_use_id` so the panel can
 * decide whether to render an Undo button on each row. The original
 * `listRecentAuditRows` query (above) still exists for callsites that
 * specifically want audit-log-only data; new cockpit code reaches for
 * `listRecentToolCalls` instead.
 *
 * Workspace-scoped (Sprint 11 invariant). RBAC filtering by
 * `actorUserId` mirrors the audit-log shape — Admin sees all rows,
 * Reviewer sees only their own. Sorted DESC by tool_calls.created_at
 * so the most recent activity sits at the top.
 */
interface ListToolCallsOpts {
  workspaceId: string;
  actorUserId?: string;
  limit: number;
}

interface ToolCallRowWire {
  id: string;
  tool_name: string;
  tool_use_id: string | null;
  actor_user_id: string;
  actor_role: string;
  conversation_id: string | null;
  workspace_id: string;
  tool_call_status: 'success' | 'error';
  error_message: string | null;
  latency_ms: number | null;
  created_at: number;
  actor_display_name: string | null;
  audit_id: string | null;
  audit_status: 'executed' | 'rolled_back' | null;
  audit_input_json: string | null;
  rolled_back_at: number | null;
}

export function listRecentToolCalls(
  db: Database.Database,
  opts: ListToolCallsOpts,
): CockpitToolCallRow[] {
  const whereClauses: string[] = ['tc.workspace_id = @workspace_id'];
  const params: Record<string, unknown> = {
    limit: opts.limit,
    workspace_id: opts.workspaceId,
  };
  if (opts.actorUserId !== undefined) {
    whereClauses.push('tc.actor_user_id = @actor_user_id');
    params.actor_user_id = opts.actorUserId;
  }
  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  const rows = db
    .prepare(
      `SELECT
         tc.id                            AS id,
         tc.tool_name                     AS tool_name,
         tc.tool_use_id                   AS tool_use_id,
         tc.actor_user_id                 AS actor_user_id,
         tc.actor_role                    AS actor_role,
         tc.conversation_id               AS conversation_id,
         tc.workspace_id                  AS workspace_id,
         tc.status                        AS tool_call_status,
         tc.error_message                 AS error_message,
         tc.latency_ms                    AS latency_ms,
         tc.created_at                    AS created_at,
         u.display_name                   AS actor_display_name,
         al.id                            AS audit_id,
         al.status                        AS audit_status,
         al.input_json                    AS audit_input_json,
         al.rolled_back_at                AS rolled_back_at
       FROM tool_calls tc
       LEFT JOIN users u
         ON u.id = tc.actor_user_id
       LEFT JOIN audit_log al
         ON tc.tool_use_id IS NOT NULL AND al.tool_use_id = tc.tool_use_id
       ${whereSql}
       ORDER BY tc.created_at DESC
       LIMIT @limit`,
    )
    .all(params) as ToolCallRowWire[];

  return rows.map((r) => ({
    ...r,
    actor_role: fromDbRole(r.actor_role),
  }));
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

/*
 * Sprint 24 — per-tool activity aggregator for the cockpit "Per-tool
 * activity" panel. GROUP BY tool_name across the last-24h invocations.
 *
 * Sprint 24.5 — switched the data source from `audit_log` (which
 * only carried mutating rows) to `tool_calls` (every invocation,
 * read-only AND mutating). `success_rate` now reflects the
 * tool_calls.status column; `rollback_rate` is derived via a
 * correlated subquery against audit_log so it still counts rolled-
 * back mutations, just expressed as a fraction of ALL invocations of
 * the tool. For read-only tools (search_corpus, extract_clauses,
 * grade_clause_severity, …), rollback_rate is always 0.
 *
 * Ordered by invocations DESC so the most-used tool sits at the top.
 * Workspace-scoped per Sprint 11.
 */
interface ListPerToolStatsOpts {
  workspaceId: string;
  /** Window start in Unix seconds. Typically now - 24h at the call site. */
  since: number;
  /** Maximum rows returned. */
  limit: number;
}

interface PerToolStatRow {
  tool_name: string;
  invocations: number;
  success_count: number;
  rolled_back_count: number;
  last_invoked_at: number;
}

export function listPerToolStats(
  db: Database.Database,
  opts: ListPerToolStatsOpts,
): PerToolStat[] {
  const rows = db
    .prepare(
      `SELECT
         tc.tool_name                                                   AS tool_name,
         COUNT(*)                                                       AS invocations,
         SUM(CASE WHEN tc.status = 'success' THEN 1 ELSE 0 END)         AS success_count,
         SUM(
           CASE WHEN tc.tool_use_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM audit_log al
              WHERE al.tool_use_id = tc.tool_use_id
                AND al.status = 'rolled_back'
           ) THEN 1 ELSE 0 END
         )                                                              AS rolled_back_count,
         MAX(tc.created_at)                                             AS last_invoked_at
       FROM tool_calls tc
       WHERE tc.workspace_id = @workspace_id
         AND tc.created_at   >= @since
       GROUP BY tc.tool_name
       ORDER BY invocations DESC
       LIMIT @limit`,
    )
    .all({
      workspace_id: opts.workspaceId,
      since: opts.since,
      limit: opts.limit,
    }) as PerToolStatRow[];

  return rows.map((r) => ({
    tool_name: r.tool_name,
    invocations: r.invocations,
    success_rate: r.invocations > 0 ? r.success_count / r.invocations : 0,
    rollback_rate: r.invocations > 0 ? r.rolled_back_count / r.invocations : 0,
    last_invoked_at: r.last_invoked_at,
  }));
}

/*
 * Sprint 24 — lease-pipeline KPIs. Two queries combined:
 *   (a) last-24h uploads + sum of clauses across those leases
 *   (b) lifetime upload count for the workspace
 *
 * Returns zeros (not nulls) when the workspace has no leases yet, so
 * the panel can render "0 uploads · 0 clauses · 0 avg" without
 * branching on null.
 */
interface GetLeasePipelineStatsOpts {
  workspaceId: string;
  /** Window start in Unix seconds. */
  since: number;
}

export function getLeasePipelineStats(
  db: Database.Database,
  opts: GetLeasePipelineStatsOpts,
): LeasePipelineStats {
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS uploads_24h
         FROM leases
        WHERE workspace_id = @workspace_id
          AND created_at  >= @since`,
    )
    .get({
      workspace_id: opts.workspaceId,
      since: opts.since,
    }) as { uploads_24h: number };

  const clauses = db
    .prepare(
      `SELECT COUNT(*) AS total_clauses_24h
         FROM clauses c
         JOIN leases l ON l.id = c.lease_id
        WHERE c.workspace_id = @workspace_id
          AND l.created_at  >= @since`,
    )
    .get({
      workspace_id: opts.workspaceId,
      since: opts.since,
    }) as { total_clauses_24h: number };

  const lifetime = db
    .prepare(
      `SELECT COUNT(*) AS lifetime_uploads
         FROM leases
        WHERE workspace_id = @workspace_id`,
    )
    .get({ workspace_id: opts.workspaceId }) as { lifetime_uploads: number };

  const uploads = recent.uploads_24h;
  const totalClauses = clauses.total_clauses_24h;
  const avg = uploads > 0 ? totalClauses / uploads : 0;

  return {
    uploads_24h: uploads,
    total_clauses_24h: totalClauses,
    avg_clauses_per_lease: avg,
    lifetime_uploads: lifetime.lifetime_uploads,
  };
}

/*
 * Sprint 24.1 — severity distribution across all graded clauses in the
 * workspace. Reads from the `clauses.severity` column directly
 * (populated by grade_clause_severity at write-time, post-validation).
 *
 * Previous (Sprint 24) implementation tried to derive this from
 * `audit_log.output_json` but grade_clause_severity is a read-only tool
 * and never writes to audit_log, so the panel always rendered zero.
 * The fix is the migration in src/lib/db/schema.ts + the UPDATE in
 * src/lib/tools/lease-tools.ts that persists severity to the clause row.
 *
 * Workspace-scoped. No time window — this is an all-time view of
 * "the shape of risk this workspace has surfaced."
 */
interface GetSeverityDistributionOpts {
  workspaceId: string;
}

interface SeverityCountRow {
  severity: string;
  count: number;
}

export function getSeverityDistribution(
  db: Database.Database,
  opts: GetSeverityDistributionOpts,
): SeverityDistribution {
  const rows = db
    .prepare(
      `SELECT severity, COUNT(*) AS count
         FROM clauses
        WHERE workspace_id = @workspace_id
          AND severity IS NOT NULL
        GROUP BY severity`,
    )
    .all({ workspace_id: opts.workspaceId }) as SeverityCountRow[];

  const counts: SeverityDistribution = {
    high: 0,
    medium: 0,
    low: 0,
    ok: 0,
    total: 0,
  };

  for (const r of rows) {
    const sev = r.severity.toLowerCase();
    if (sev === 'high') counts.high = r.count;
    else if (sev === 'medium' || sev === 'med') counts.medium = r.count;
    else if (sev === 'low') counts.low = r.count;
    else if (sev === 'ok') counts.ok = r.count;
    else continue;
    counts.total += r.count;
  }

  return counts;
}
