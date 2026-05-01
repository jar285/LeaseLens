// Unit tests for ToolRegistry
// Adapted pattern from docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.test.ts

import { describe, expect, it } from 'vitest';
import type { Role } from '@/lib/auth/types';
import type { ToolDescriptor } from './domain';
import { ToolAccessDeniedError, UnknownToolError } from './errors';
import { ToolRegistry } from './registry';

describe('ToolRegistry', () => {
  const createMockTool = (
    name: string,
    roles: Role[] | 'ALL' = 'ALL',
  ): ToolDescriptor => ({
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    roles,
    category: 'system',
    execute: async () => ({ result: name }),
  });

  describe('register', () => {
    it('should register and retrieve a tool', () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('test_tool');

      registry.register(tool);

      expect(registry.getDescriptor('test_tool')).toBe(tool);
      expect(registry.getToolNames()).toContain('test_tool');
    });

    it('should throw on duplicate registration', () => {
      const registry = new ToolRegistry();
      const tool = createMockTool('test_tool');

      registry.register(tool);

      expect(() => registry.register(tool)).toThrow(
        'Tool "test_tool" is already registered',
      );
    });
  });

  describe('getToolsForRole', () => {
    it('should return all tools for ALL role', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('tool_a', 'ALL'));
      registry.register(createMockTool('tool_b', 'ALL'));

      const tools = registry.getToolsForRole('Creator');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('tool_a');
      expect(tools.map((t) => t.name)).toContain('tool_b');
    });

    it('should filter tools by role', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('creator_tool', ['Creator']));
      registry.register(createMockTool('editor_tool', ['Editor', 'Admin']));
      registry.register(createMockTool('admin_tool', ['Admin']));
      registry.register(createMockTool('all_tool', 'ALL'));

      const creatorTools = registry.getToolsForRole('Creator');
      const editorTools = registry.getToolsForRole('Editor');
      const adminTools = registry.getToolsForRole('Admin');

      expect(creatorTools.map((t) => t.name)).toEqual([
        'all_tool',
        'creator_tool',
      ]);
      expect(editorTools.map((t) => t.name)).toEqual([
        'all_tool',
        'editor_tool',
      ]);
      expect(adminTools.map((t) => t.name)).toEqual([
        'admin_tool',
        'all_tool',
        'editor_tool',
      ]);
    });

    it('should sort tools alphabetically', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('zebra_tool', 'ALL'));
      registry.register(createMockTool('alpha_tool', 'ALL'));
      registry.register(createMockTool('beta_tool', 'ALL'));

      const tools = registry.getToolsForRole('Creator');

      expect(tools.map((t) => t.name)).toEqual([
        'alpha_tool',
        'beta_tool',
        'zebra_tool',
      ]);
    });
  });

  describe('execute', () => {
    it('should execute a tool and return result', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('adder', 'ALL'));

      const result = await registry.execute(
        'adder',
        { a: 1, b: 2 },
        {
          role: 'Creator',
          userId: 'user-1',
          conversationId: 'conv-1',
        },
      );

      expect(result).toEqual({ result: 'adder' });
    });

    it('should throw UnknownToolError for unregistered tools', async () => {
      const registry = new ToolRegistry();

      await expect(
        registry.execute(
          'missing',
          {},
          {
            role: 'Creator',
            userId: 'user-1',
            conversationId: 'conv-1',
          },
        ),
      ).rejects.toThrow(UnknownToolError);
    });

    it('should throw ToolAccessDeniedError for wrong role', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('admin_only', ['Admin']));

      await expect(
        registry.execute(
          'admin_only',
          {},
          {
            role: 'Creator',
            userId: 'user-1',
            conversationId: 'conv-1',
          },
        ),
      ).rejects.toThrow(ToolAccessDeniedError);
    });

    it('should allow access with correct role', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('admin_only', ['Admin']));

      const result = await registry.execute(
        'admin_only',
        {},
        {
          role: 'Admin',
          userId: 'user-1',
          conversationId: 'conv-1',
        },
      );

      expect(result).toEqual({ result: 'admin_only' });
    });
  });

  describe('canExecute', () => {
    it('should return true for allowed roles', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('tool', ['Creator', 'Editor']));

      expect(registry.canExecute('tool', 'Creator')).toBe(true);
      expect(registry.canExecute('tool', 'Editor')).toBe(true);
      expect(registry.canExecute('tool', 'Admin')).toBe(false);
    });

    it('should return false for unregistered tools', () => {
      const registry = new ToolRegistry();
      expect(registry.canExecute('missing', 'Creator')).toBe(false);
    });
  });
});
