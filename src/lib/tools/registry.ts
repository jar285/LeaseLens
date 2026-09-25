// ToolRegistry - simplified from Ordo
// Source: docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.ts
// Simplified: no bundles, no policy pipeline, no result formatter, no deferred execution.
//
// Sprint 8: extended with the mutating-tool path. Async execute + audit-row insert
// share a single async DB transaction. External return type is a
// ToolExecutionResult envelope so audit_id never leaks into the LLM-visible
// tool result. See spec sections 4.1, 4.3.
//
// Issue #29 — async: the transaction body awaits each statement and reads/writes
// through the `tx` handle (statements issued on the module-level `db` inside the
// callback would NOT join the transaction and throw TRANSACTION_ACTIVE on
// single-connection clients).

import type { Role } from '@/lib/auth/types';
import type { Db } from '@/lib/db/client';
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

// Sprint A.8 (#8) — bound an async tool step (prepare / execute) to a
// wall-clock budget. A bulkhead so a slow/hung dependency (e.g. a stuck
// Anthropic call inside a tool) can't stall the whole turn (Michael Nygard:
// timeouts). The timer is cleared once the real promise settles so it never
// leaks or fires late. The mutating execute inside db.transaction is
// deliberately NOT wrapped — its work is local DB writes (the LLM call
// happens in `prepare`, which IS bounded above), and timing out the
// transaction body mid-flight could commit/roll back unpredictably.
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
  private readonly db?: Db;
  private readonly toolTimeoutMs: number;

  constructor(db?: Db, opts?: ToolRegistryOptions) {
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
   * For mutating tools: the descriptor's execute is awaited inside
   * `db.transaction(...)` together with the audit-row insert — every
   * statement goes through the `tx` handle so both land atomically. If
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

        const txnResult = await db.transaction(
          async (tx): Promise<ToolExecutionResult> => {
            // Issue #29 — the mutating execute receives the open `tx` via
            // the context so its writes join this transaction; writeAuditRow
            // takes the same handle. Nothing here may touch the outer `db`.
            const outcome = (await descriptor.execute(
              input,
              { ...context, tx },
              prepared,
            )) as MutationOutcome;
            const audit_id = await writeAuditRow(tx, {
              tool_name: name,
              tool_use_id: context.toolUseId ?? null,
              context,
              input,
              output: outcome.result,
              compensatingActionPayload: outcome.compensatingActionPayload,
            });
            return { result: outcome.result, audit_id };
          },
        );
        return txnResult;
      }

      // Read-only path. `await` on the execute promise resolves to the
      // tool's raw result.
      // Sprint A.8 (#8) — bound the read-only async work too (e.g.
      // grade_clause_severity makes its Anthropic call inside execute).
      const rawResult = await withTimeout(
        descriptor.execute(input, context),
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
      // Runs after the transaction above has committed or rolled back,
      // so the outer `db` handle is safe to use here.
      if (this.db) {
        try {
          await writeToolCall(this.db, {
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
