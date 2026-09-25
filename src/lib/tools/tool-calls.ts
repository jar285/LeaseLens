/**
 * Sprint 24.5 — tool-call observability log.
 *
 * Every `ToolRegistry.execute()` writes one row here, whether the
 * descriptor is mutating (compensatingAction) or read-only. This is
 * the broader observability surface that powers:
 *   - `/cockpit` "What has the AI done?" (joined to audit_log for Undo
 *     affordance on mutating rows)
 *   - `/cockpit` per-tool aggregate (counts, success rate, latency)
 *
 * The existing `audit_log` table is unchanged — it stays mutations-only
 * with its compensating-action payload and Undo flow. `tool_calls`
 * never replaces audit_log; it's the parallel "every invocation" log.
 *
 * Writes happen OUTSIDE the mutating-tool transaction so even a failed
 * mutation produces a tool_calls row recording the attempt. The
 * `status` column distinguishes success/error.
 *
 * Sprint 44B — `error_message` now holds a SAFE error NAME (e.g. 'SyntaxError'),
 * never the raw message (a JSON.parse failure on a draft-email body / clause
 * text would embed tenant PII). `error_code` is the enumerated failure code.
 * See `safe-tool-error.ts`.
 *
 * Issue #29 — async: the insert awaits the async `Db` driver. Accepts the
 * `Db` singleton or an open `DbTransaction` (both expose `prepare`).
 */

import { randomUUID } from 'node:crypto';
import { toDbRole } from '@/lib/auth/role-codec';
import type { Role } from '@/lib/auth/types';
import type { Db } from '@/lib/db/client';

/** Accepts the `Db` singleton or an open `DbTransaction` — both expose `prepare`. */
type DbHandle = Pick<Db, 'prepare'>;

export interface ToolCallInput {
  tool_name: string;
  tool_use_id: string | null;
  actor_user_id: string;
  actor_role: Role;
  conversation_id: string | null;
  workspace_id: string;
  status: 'success' | 'error';
  /** Sprint 44B — a SAFE error NAME (never the raw message). */
  error_message: string | null;
  /** Sprint 44B — enumerated failure code (see toSafeToolError). */
  error_code: string | null;
  latency_ms: number;
}

export async function writeToolCall(
  db: DbHandle,
  input: ToolCallInput,
): Promise<string> {
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO tool_calls (
       id, tool_name, tool_use_id, actor_user_id, actor_role,
       conversation_id, workspace_id, status, error_message, error_code,
       latency_ms, created_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?
     )`,
    )
    .run(
      id,
      input.tool_name,
      input.tool_use_id,
      input.actor_user_id,
      toDbRole(input.actor_role),
      input.conversation_id,
      input.workspace_id,
      input.status,
      input.error_message,
      input.error_code,
      input.latency_ms,
      Math.floor(Date.now() / 1000),
    );
  return id;
}
