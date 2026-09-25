/**
 * Audit-log helpers — owns audit_log row writes and reads.
 *
 * Used by:
 *   - ToolRegistry.execute() for the mutating-tool transaction (writeAuditRow)
 *   - GET  /api/audit                                          (listAuditRows)
 *   - POST /api/audit/[id]/rollback                           (getAuditRow, markRolledBack)
 *
 * Sprint 8 spec sections 4.2 / 4.3 / 4.4 / 4.5.
 *
 * Issue #29 — async: every helper awaits its statement against the async
 * `Db` driver. The registry's mutating path calls these with the open
 * `DbTransaction` handle (both shapes expose `prepare`); issuing the
 * statements on the outer `db` inside a transaction would throw
 * TRANSACTION_ACTIVE on single-connection clients. SQL text is unchanged
 * apart from the mechanical `@name` → `?` positional conversion the new
 * statement interface requires.
 */

import { randomUUID } from 'node:crypto';
import { fromDbRole, toDbRole } from '@/lib/auth/role-codec';
import type { Db } from '@/lib/db/client';
import type { AuditLogEntry, ToolExecutionContext } from './domain';

/** Accepts the `Db` singleton or an open `DbTransaction` — both expose `prepare`. */
type DbHandle = Pick<Db, 'prepare'>;

export interface AuditWriteInput {
  tool_name: string;
  tool_use_id?: string | null;
  context: ToolExecutionContext;
  input: Record<string, unknown>;
  output: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

export async function writeAuditRow(
  db: DbHandle,
  input: AuditWriteInput,
): Promise<string> {
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO audit_log (
       id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
       workspace_id,
       input_json, output_json, compensating_action_json, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?,
       ?, ?, ?, ?
     )`,
    )
    .run(
      id,
      input.tool_name,
      input.tool_use_id ?? null,
      input.context.userId,
      // DB persists wire literals (Creator/Editor/Admin); translate at write.
      toDbRole(input.context.role),
      input.context.conversationId,
      input.context.workspaceId,
      JSON.stringify(input.input),
      JSON.stringify(input.output),
      JSON.stringify(input.compensatingActionPayload),
      Math.floor(Date.now() / 1000),
    );
  return id;
}

// DB rows arrive with the wire literal in actor_role; this helper
// reshapes them into the AuditLogEntry contract (Role-typed) so the
// rest of the codebase stays in the domain language.
interface AuditRowWire extends Omit<AuditLogEntry, 'actor_role'> {
  actor_role: string;
}

function hydrateAuditRow(row: AuditRowWire): AuditLogEntry {
  return { ...row, actor_role: fromDbRole(row.actor_role) };
}

export async function getAuditRow(
  db: DbHandle,
  id: string,
): Promise<AuditLogEntry | null> {
  const row = await db
    .prepare('SELECT * FROM audit_log WHERE id = ?')
    .get<AuditRowWire>(id);
  return row ? hydrateAuditRow(row) : null;
}

export async function listAuditRows(
  db: DbHandle,
  opts: { actorUserId?: string; limit: number; since?: number },
): Promise<AuditLogEntry[]> {
  const whereClauses: string[] = [];
  const params: unknown[] = [];
  if (opts.actorUserId !== undefined) {
    whereClauses.push('actor_user_id = ?');
    params.push(opts.actorUserId);
  }
  if (opts.since !== undefined) {
    whereClauses.push('created_at < ?');
    params.push(opts.since);
  }
  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';
  params.push(opts.limit);
  const rows = await db
    .prepare(
      `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT ?`,
    )
    .all<AuditRowWire>(...params);
  return rows.map(hydrateAuditRow);
}

/**
 * Marks an audit row as rolled-back. The WHERE status='executed' clause
 * makes the call a true no-op on already-rolled-back rows — second call
 * updates 0 rows, leaving rolled_back_at frozen at the original timestamp
 * (sprint-qa H5).
 */
export async function markRolledBack(db: DbHandle, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE audit_log SET status = 'rolled_back', rolled_back_at = ?
     WHERE id = ? AND status = 'executed'`,
    )
    .run(Math.floor(Date.now() / 1000), id);
}
