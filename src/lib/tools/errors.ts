// Tool registry errors
// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/errors.ts

export class ToolAccessDeniedError extends Error {
  readonly toolName: string;
  readonly role: string;

  constructor(toolName: string, role: string) {
    super(`Access denied: role "${role}" cannot execute tool "${toolName}"`);
    this.toolName = toolName;
    this.role = role;
    this.name = 'ToolAccessDeniedError';
  }
}

export class UnknownToolError extends Error {
  readonly toolName: string;

  constructor(toolName: string) {
    super(`Unknown tool: "${toolName}"`);
    this.toolName = toolName;
    this.name = 'UnknownToolError';
  }
}

// Sprint A.8 (#8) — raised when a tool's async work (prepare / read-only
// execute) exceeds the per-tool wall-clock budget. A bulkhead so a slow or
// hung dependency (e.g. a stuck Anthropic call inside a tool) can't stall the
// whole turn (Michael Nygard: timeouts). The message carries no PII (just the
// tool name + budget), so it is safe to surface.
export class ToolTimeoutError extends Error {
  readonly toolName: string;
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
    this.name = 'ToolTimeoutError';
  }
}
