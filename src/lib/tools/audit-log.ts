/**
 * Audit-log helpers — owns audit_log row writes and reads.
 *
 * Used by:
 *   - ToolRegistry.execute() for the mutating-tool transaction (writeAuditRow)
 *   - GET  /api/audit                                          (listAuditRows)
 *   - POST /api/audit/[id]/rollback                           (getAuditRow, markRolledBack)
 *
 * Sprint 8 spec sections 4.2 / 4.3 / 4.4 / 4.5.
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuditLogEntry, ToolExecutionContext } from './domain';

export interface AuditWriteInput {
  tool_name: string;
  tool_use_id?: string | null;
  context: ToolExecutionContext;
  input: Record<string, unknown>;
  output: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

export function writeAuditRow(
  db: Database.Database,
  input: AuditWriteInput,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO audit_log (
       id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
       input_json, output_json, compensating_action_json, created_at
     ) VALUES (
       @id, @tool_name, @tool_use_id, @actor_user_id, @actor_role, @conversation_id,
       @input_json, @output_json, @compensating_action_json, @created_at
     )`,
  ).run({
    id,
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id ?? null,
    actor_user_id: input.context.userId,
    actor_role: input.context.role,
    conversation_id: input.context.conversationId,
    input_json: JSON.stringify(input.input),
    output_json: JSON.stringify(input.output),
    compensating_action_json: JSON.stringify(input.compensatingActionPayload),
    created_at: Math.floor(Date.now() / 1000),
  });
  return id;
}

export function getAuditRow(
  db: Database.Database,
  id: string,
): AuditLogEntry | null {
  return (
    (db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as
      | AuditLogEntry
      | undefined) ?? null
  );
}

export function listAuditRows(
  db: Database.Database,
  opts: { actorUserId?: string; limit: number; since?: number },
): AuditLogEntry[] {
  const whereClauses: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.actorUserId !== undefined) {
    whereClauses.push('actor_user_id = @actor_user_id');
    params.actor_user_id = opts.actorUserId;
  }
  if (opts.since !== undefined) {
    whereClauses.push('created_at < @since');
    params.since = opts.since;
  }
  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';
  return db
    .prepare(
      `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT @limit`,
    )
    .all(params) as AuditLogEntry[];
}

/**
 * Marks an audit row as rolled-back. The WHERE status='executed' clause
 * makes the call a true no-op on already-rolled-back rows — second call
 * updates 0 rows, leaving rolled_back_at frozen at the original timestamp
 * (sprint-qa H5).
 */
export function markRolledBack(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE audit_log SET status = 'rolled_back', rolled_back_at = ?
     WHERE id = ? AND status = 'executed'`,
  ).run(Math.floor(Date.now() / 1000), id);
}
