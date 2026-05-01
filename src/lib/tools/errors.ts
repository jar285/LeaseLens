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
