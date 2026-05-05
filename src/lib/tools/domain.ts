// Tool domain types
// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/
// Simplified: no ToolCommand interface (execute on descriptor directly), no execution modes

import type { Role } from '@/lib/auth/types';

export type ToolCategory = 'corpus' | 'system' | 'visualization';

export interface ToolDescriptor {
  /** Unique tool name — must match the Anthropic tool name exactly */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Which roles can execute this tool. 'ALL' = unrestricted. */
  roles: Role[] | 'ALL';
  /** Organizational category */
  category: ToolCategory;
  /**
   * Execute the tool with validated input.
   * Read-only tools: async, returns the raw result.
   * Mutating tools: sync, returns MutationOutcome.
   * Mutating tools MUST throw on validation failures (Sprint 8 spec 4.3).
   */
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<unknown> | MutationOutcome;
  /**
   * When set, this tool is mutating. The registry runs `execute` inside
   * a sync better-sqlite3 transaction with an audit-row insert. The
   * function below is the rollback path — receives the serialized
   * compensating-action payload that the original execute returned.
   */
  compensatingAction?: (
    payload: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => void;
}

export interface ToolExecutionContext {
  role: Role;
  userId: string;
  conversationId: string;
  /**
   * Sprint 11: required — every tool execution is workspace-scoped.
   * Set by the chat route from the workspace cookie; the MCP server
   * hardcodes SAMPLE_WORKSPACE.id (per-caller MCP workspace selection
   * is Sprint 13+).
   */
  workspaceId: string;
  /**
   * LLM-issued tool_use id from the Anthropic response, when applicable.
   * The chat route sets this; MCP-originated calls leave it undefined.
   * Persisted as audit_log.tool_use_id when set.
   */
  toolUseId?: string;
}

/** What a mutating tool's execute returns synchronously. */
export interface MutationOutcome {
  result: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

/**
 * Uniform envelope returned by ToolRegistry.execute() for ALL tools.
 * Read-only paths set audit_id to undefined; mutating paths set it
 * to the freshly-written audit_log row id. Keeps audit_id out of
 * `result` so it cannot leak into LLM-visible content or persisted messages.
 */
export interface ToolExecutionResult {
  result: unknown;
  audit_id: string | undefined;
}

export interface AuditLogEntry {
  id: string;
  tool_name: string;
  tool_use_id: string | null;
  actor_user_id: string;
  actor_role: Role;
  conversation_id: string | null;
  workspace_id: string;
  input_json: string;
  output_json: string;
  compensating_action_json: string;
  status: 'executed' | 'rolled_back';
  created_at: number;
  rolled_back_at: number | null;
}

/** Anthropic SDK tool format */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** NDJSON stream events for tool execution */
export interface ToolUseEvent {
  tool_use: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface ToolResultEvent {
  tool_result: {
    id: string;
    name: string;
    result: unknown;
    error?: string;
  };
}
