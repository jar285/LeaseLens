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
 */

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { toDbRole } from '@/lib/auth/role-codec';
import type { Role } from '@/lib/auth/types';

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

export function writeToolCall(
  db: Database.Database,
  input: ToolCallInput,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tool_calls (
       id, tool_name, tool_use_id, actor_user_id, actor_role,
       conversation_id, workspace_id, status, error_message, error_code,
       latency_ms, created_at
     ) VALUES (
       @id, @tool_name, @tool_use_id, @actor_user_id, @actor_role,
       @conversation_id, @workspace_id, @status, @error_message, @error_code,
       @latency_ms, @created_at
     )`,
  ).run({
    id,
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id,
    actor_user_id: input.actor_user_id,
    actor_role: toDbRole(input.actor_role),
    conversation_id: input.conversation_id,
    workspace_id: input.workspace_id,
    status: input.status,
    error_message: input.error_message,
    error_code: input.error_code,
    latency_ms: input.latency_ms,
    created_at: Math.floor(Date.now() / 1000),
  });
  return id;
}
