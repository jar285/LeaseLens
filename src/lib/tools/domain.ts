// Tool domain types
// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/
// Simplified: no ToolCommand interface (execute on descriptor directly), no execution modes

import type { Role } from '@/lib/auth/types';

export type ToolCategory = 'corpus' | 'system';

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
  /** Execute the tool with validated input */
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<unknown>;
}

export interface ToolExecutionContext {
  role: Role;
  userId: string;
  conversationId: string;
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
