// ToolRegistry - simplified from Ordo
// Source: docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.ts
// Simplified: no bundles, no policy pipeline, no result formatter, no deferred execution

import type { Role } from '@/lib/auth/types';
import type {
  AnthropicTool,
  ToolDescriptor,
  ToolExecutionContext,
} from './domain';
import { ToolAccessDeniedError, UnknownToolError } from './errors';

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();

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
   * Execute a tool with RBAC check.
   */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<unknown> {
    const descriptor = this.tools.get(name);
    if (!descriptor) {
      throw new UnknownToolError(name);
    }

    if (!this.canExecute(name, context.role)) {
      throw new ToolAccessDeniedError(name, context.role);
    }

    return await descriptor.execute(input, context);
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
