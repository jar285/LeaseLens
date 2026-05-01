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
import { writeAuditRow } from './audit-log';
import type {
  AnthropicTool,
  MutationOutcome,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
} from './domain';
import { ToolAccessDeniedError, UnknownToolError } from './errors';

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  private readonly db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
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

    if (descriptor.compensatingAction) {
      if (!this.db) {
        throw new Error(
          `Mutating tool "${name}" registered but ToolRegistry has no db ` +
            `to write the audit row. Construct via new ToolRegistry(db).`,
        );
      }
      const db = this.db;
      const txn = db.transaction((): ToolExecutionResult => {
        const outcome = descriptor.execute(input, context) as MutationOutcome;
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
    const rawResult = await descriptor.execute(input, context);
    return { result: rawResult, audit_id: undefined };
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
