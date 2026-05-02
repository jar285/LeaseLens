// Unit tests for ToolRegistry
// Adapted pattern from docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.test.ts
//
// Sprint 8: existing 6 tests updated to read `result` from the envelope.
// 5 new tests cover the audit hook + invariants (sprint plan Task 8).

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@/lib/auth/types';
import { createTestDb } from '@/lib/test/db';
import { seedUser } from '@/lib/test/seed';
import type { MutationOutcome, ToolDescriptor } from './domain';
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

  describe('execute (read-only path)', () => {
    it('should execute a tool and return envelope with raw result + undefined audit_id', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('adder', 'ALL'));

      const { result, audit_id } = await registry.execute(
        'adder',
        { a: 1, b: 2 },
        { role: 'Creator', userId: 'user-1', conversationId: 'conv-1' },
      );

      expect(result).toEqual({ result: 'adder' });
      expect(audit_id).toBeUndefined();
    });

    it('should throw UnknownToolError for unregistered tools', async () => {
      const registry = new ToolRegistry();

      await expect(
        registry.execute(
          'missing',
          {},
          { role: 'Creator', userId: 'user-1', conversationId: 'conv-1' },
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
          { role: 'Creator', userId: 'user-1', conversationId: 'conv-1' },
        ),
      ).rejects.toThrow(ToolAccessDeniedError);
    });

    it('should allow access with correct role', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('admin_only', ['Admin']));

      const { result } = await registry.execute(
        'admin_only',
        {},
        { role: 'Admin', userId: 'user-1', conversationId: 'conv-1' },
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

  // ==========================================================================
  // Sprint 8 — mutating-tool path tests
  // ==========================================================================
  describe('execute (mutating path — Sprint 8)', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = createTestDb();
      // Seed an Admin and a content_calendar-able document so the mutating
      // mock tool can write through. The mutating tools real-world tests live
      // in mutating-tools.test.ts; here we exercise the registry's audit hook
      // with a synthetic descriptor so the test is independent of those tools.
      seedUser(db, 'Admin');
      db.prepare(
        'INSERT INTO documents (id, slug, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run('doc-1', 'doc-slug', 'Doc', 'content', 'hash', Date.now());
    });

    function buildMutatingTool(opts?: {
      throwInExecute?: boolean;
    }): ToolDescriptor {
      return {
        name: 'mut_tool',
        description: 'mutating mock',
        inputSchema: { type: 'object', properties: {} },
        roles: 'ALL',
        category: 'system',
        execute: (): MutationOutcome => {
          if (opts?.throwInExecute) {
            db.prepare(
              'INSERT INTO content_calendar (id, document_slug, scheduled_for, channel, scheduled_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            ).run('halfway', 'doc-slug', 0, 'x', 'u', 0);
            throw new Error('mutation failed');
          }
          db.prepare(
            'INSERT INTO content_calendar (id, document_slug, scheduled_for, channel, scheduled_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          ).run('row-1', 'doc-slug', 0, 'x', 'u', 0);
          return {
            result: { schedule_id: 'row-1' },
            compensatingActionPayload: { schedule_id: 'row-1' },
          };
        },
        compensatingAction: () => {
          db.prepare('DELETE FROM content_calendar WHERE id = ?').run('row-1');
        },
      };
    }

    it('Mutating tool: audit row written + envelope carries audit_id', async () => {
      const registry = new ToolRegistry(db);
      registry.register(buildMutatingTool());

      const { result, audit_id } = await registry.execute(
        'mut_tool',
        { foo: 'bar' },
        {
          role: 'Admin',
          userId: 'admin-id',
          conversationId: 'conv-1',
          toolUseId: 'toolu_1',
        },
      );

      expect(result).toEqual({ schedule_id: 'row-1' });
      expect(audit_id).toBeTruthy();

      const auditRow = db
        .prepare('SELECT * FROM audit_log WHERE id = ?')
        .get(audit_id) as {
        tool_name: string;
        tool_use_id: string | null;
        actor_user_id: string;
        input_json: string;
      };
      expect(auditRow.tool_name).toBe('mut_tool');
      expect(auditRow.tool_use_id).toBe('toolu_1');
      expect(auditRow.actor_user_id).toBe('admin-id');
      expect(JSON.parse(auditRow.input_json)).toEqual({ foo: 'bar' });
    });

    it('Mutation throws → both rows absent (transaction rollback)', async () => {
      const registry = new ToolRegistry(db);
      registry.register(buildMutatingTool({ throwInExecute: true }));

      await expect(
        registry.execute(
          'mut_tool',
          {},
          { role: 'Admin', userId: 'u', conversationId: 'c' },
        ),
      ).rejects.toThrow('mutation failed');

      const cal = db
        .prepare('SELECT COUNT(*) as n FROM content_calendar')
        .get() as { n: number };
      const aud = db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as {
        n: number;
      };
      expect(cal.n).toBe(0);
      expect(aud.n).toBe(0);
    });

    it('Read-only tool: no audit row written (existing async path unchanged)', async () => {
      const registry = new ToolRegistry(db);
      registry.register(createMockTool('readonly', 'ALL'));

      await registry.execute(
        'readonly',
        {},
        { role: 'Admin', userId: 'u', conversationId: 'c' },
      );

      const aud = db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as {
        n: number;
      };
      expect(aud.n).toBe(0);
    });

    it('Mutating tool registered against a no-db registry → diagnostic throw', async () => {
      const registry = new ToolRegistry(); // no db
      registry.register(buildMutatingTool());

      await expect(
        registry.execute(
          'mut_tool',
          {},
          { role: 'Admin', userId: 'u', conversationId: 'c' },
        ),
      ).rejects.toThrow(/has no db to write the audit row/);
    });

    it('Validation-throw contract: mutating execute throws → no audit row', async () => {
      const registry = new ToolRegistry(db);
      const tool: ToolDescriptor = {
        name: 'validating_tool',
        description: 'validates',
        inputSchema: { type: 'object', properties: {} },
        roles: 'ALL',
        category: 'system',
        execute: (input): MutationOutcome => {
          if (!input.required_field) throw new Error('missing required_field');
          return { result: {}, compensatingActionPayload: {} };
        },
        compensatingAction: () => {},
      };
      registry.register(tool);

      await expect(
        registry.execute(
          'validating_tool',
          {},
          { role: 'Admin', userId: 'u', conversationId: 'c' },
        ),
      ).rejects.toThrow('missing required_field');

      const aud = db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as {
        n: number;
      };
      expect(aud.n).toBe(0);
    });
  });
});
