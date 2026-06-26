// ToolRegistry - simplified from Ordo
// Source: docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.ts
// Simplified: no bundles, no policy pipeline, no result formatter, no deferred execution.
//
// Sprint 8: extended with the mutating-tool path. Sync execute + audit-row insert
// share a single better-sqlite3 transaction. External return type is a
// ToolExecutionResult envelope so audit_id never leaks into the LLM-visible
// tool result. See spec sections 4.1, 4.3.

import type Database from 'better-sqlite3';
import type { Role } from '@/lib/auth/types';
import { env } from '@/lib/env';
import { logger } from '@/lib/log/logger';
import { writeAuditRow } from './audit-log';
import type {
  AnthropicTool,
  MutationOutcome,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
} from './domain';
import {
  ToolAccessDeniedError,
  ToolTimeoutError,
  UnknownToolError,
} from './errors';
import { toSafeToolError } from './safe-tool-error';
import { writeToolCall } from './tool-calls';

// Sprint A.8 (#8) — bound an async tool step (prepare / read-only execute) to a
// wall-clock budget. A bulkhead so a slow/hung dependency (e.g. a stuck
// Anthropic call inside a tool) can't stall the whole turn (Michael Nygard:
// timeouts). The timer is cleared once the real promise settles so it never
// leaks or fires late. The sync mutating execute (inside db.transaction) is
// deliberately NOT wrapped — a synchronous better-sqlite3 call can't be aborted
// mid-flight, and its work is local, not a remote dependency.
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ToolTimeoutError(toolName, timeoutMs)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export interface ToolRegistryOptions {
  /**
   * Per-tool wall-clock timeout (ms) for the async tool path. Defaults to
   * LEASELENS_TOOL_TIMEOUT_MS; tests inject a small value to exercise the
   * bulkhead without waiting.
   */
  toolTimeoutMs?: number;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  private readonly db?: Database.Database;
  private readonly toolTimeoutMs: number;

  constructor(db?: Database.Database, opts?: ToolRegistryOptions) {
    this.db = db;
    this.toolTimeoutMs = opts?.toolTimeoutMs ?? env.LEASELENS_TOOL_TIMEOUT_MS;
  }

  register(descriptor: ToolDescriptor): void {
    if (this.tools.has(descriptor.name)) {
      throw new Error(`Tool "${descriptor.name}" is already registered`);
    }
    this.tools.set(descriptor.name, descriptor);
  }

  /**
   * Get Anthropic-formatted tools for a role.
   * Sorted alphabetically by name.
   */
  getToolsForRole(role: Role): AnthropicTool[] {
    return Array.from(this.tools.values())
      .filter(
        (descriptor) =>
          descriptor.roles === 'ALL' ||
          (Array.isArray(descriptor.roles) && descriptor.roles.includes(role)),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((descriptor) => ({
        name: descriptor.name,
        description: descriptor.description,
        input_schema: {
          type: 'object' as const,
          properties: (descriptor.inputSchema.properties || {}) as Record<
            string,
            unknown
          >,
          required: descriptor.inputSchema.required as string[] | undefined,
        },
      }));
  }

  /**
   * Execute a tool with RBAC check. Returns a ToolExecutionResult envelope
   * — `result` carries the tool's logical output, `audit_id` is set only
   * for mutating tools (i.e., descriptors with a compensatingAction).
   *
   * For mutating tools: the descriptor's execute is called synchronously
   * inside `db.transaction(...)` together with the audit-row insert. If
   * either throws, the transaction rolls back atomically.
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const descriptor = this.tools.get(name);
    if (!descriptor) {
      throw new UnknownToolError(name);
    }

    if (!this.canExecute(name, context.role)) {
      throw new ToolAccessDeniedError(name, context.role);
    }

    // Sprint 24.5 — observability instrumentation. EVERY execute() —
    // read-only AND mutating — records a `tool_calls` row in the
    // `finally` block below, with success/error status and latency.
    // The audit_log write for mutating tools is unchanged (inside the
    // txn); tool_calls writes happen OUTSIDE so a failed mutation
    // still produces a record of the attempt.
    const startMs = Date.now();
    let toolCallStatus: 'success' | 'error' = 'success';
    // Sprint 44B — persist a SAFE error record, NOT the raw message. A
    // JSON.parse SyntaxError from a tool embeds model output (draft body /
    // clause text = tenant PII) in its message; we keep only the error NAME +
    // an enumerated code.
    let toolCallErrorName: string | null = null;
    let toolCallErrorCode: string | null = null;

    try {
      if (descriptor.compensatingAction) {
        if (!this.db) {
          throw new Error(
            `Mutating tool "${name}" registered but ToolRegistry has no db ` +
              `to write the audit row. Construct via new ToolRegistry(db).`,
          );
        }
        const db = this.db;

        // Sprint 13: optional async preparation step (e.g., LLM call) runs
        // BEFORE the transaction. Throws here propagate out without any DB
        // write. The resolved value is passed to execute as `prepared`.
        // Sprint A.8 (#8) — the prepare step is where mutating tools make their
        // Anthropic call (e.g. draft_negotiation_email); bound it so a hung
        // provider call can't stall the turn.
        const prepared = descriptor.prepare
          ? await withTimeout(
              descriptor.prepare(input, context),
              this.toolTimeoutMs,
              name,
            )
          : undefined;

        const txn = db.transaction((): ToolExecutionResult => {
          const outcome = descriptor.execute(
            input,
            context,
            prepared,
          ) as MutationOutcome;
          const audit_id = writeAuditRow(db, {
            tool_name: name,
            tool_use_id: context.toolUseId ?? null,
            context,
            input,
            output: outcome.result,
            compensatingActionPayload: outcome.compensatingActionPayload,
          });
          return { result: outcome.result, audit_id };
        });
        return txn();
      }

      // Read-only path. Descriptor's execute return type is the union
      // `Promise<unknown> | MutationOutcome`; for read-only tools it's
      // always a Promise. `await` on a non-Promise resolves to the value,
      // so the union is harmless at runtime.
      // Sprint A.8 (#8) — bound the read-only async work too (e.g.
      // grade_clause_severity makes its Anthropic call inside execute).
      const rawResult = await withTimeout(
        Promise.resolve(descriptor.execute(input, context)),
        this.toolTimeoutMs,
        name,
      );
      return { result: rawResult, audit_id: undefined };
    } catch (err) {
      toolCallStatus = 'error';
      const safe = toSafeToolError(err);
      toolCallErrorName = safe.name;
      toolCallErrorCode = safe.code;
      // Sprint 44B — structured failure event; allowlist fields only (no raw
      // message/stack). Joinable to the originating request via conversation_id.
      logger.error(
        {
          toolName: name,
          status: 'error',
          code: safe.code,
          errName: safe.name,
          conversationId: context.conversationId ?? null,
          workspaceId: context.workspaceId,
        },
        'tool.execute_failed',
      );
      throw err;
    } finally {
      // Sprint 24.5 — best-effort tool_calls write. Wrapped in its own
      // try/catch so an observability-log failure never breaks the
      // tool-call return path. The audit_log invariants are unchanged.
      if (this.db) {
        try {
          writeToolCall(this.db, {
            tool_name: name,
            tool_use_id: context.toolUseId ?? null,
            actor_user_id: context.userId,
            actor_role: context.role,
            conversation_id: context.conversationId ?? null,
            workspace_id: context.workspaceId,
            status: toolCallStatus,
            error_message: toolCallErrorName,
            error_code: toolCallErrorCode,
            latency_ms: Date.now() - startMs,
          });
        } catch {
          /* swallow observability-log failures */
        }
      }
    }
  }

  /**
   * Get a tool descriptor by name.
   */
  getDescriptor(name: string): ToolDescriptor | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names.
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a role can execute a tool.
   */
  canExecute(name: string, role: Role): boolean {
    const descriptor = this.tools.get(name);
    if (!descriptor) return false;
    return (
      descriptor.roles === 'ALL' ||
      (Array.isArray(descriptor.roles) && descriptor.roles.includes(role))
    );
  }
}
