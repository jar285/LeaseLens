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
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
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

      const tools = registry.getToolsForRole('Tenant');

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toContain('tool_a');
      expect(tools.map((t) => t.name)).toContain('tool_b');
    });

    it('should filter tools by role', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('creator_tool', ['Tenant']));
      registry.register(createMockTool('editor_tool', ['Reviewer', 'Admin']));
      registry.register(createMockTool('admin_tool', ['Admin']));
      registry.register(createMockTool('all_tool', 'ALL'));

      const creatorTools = registry.getToolsForRole('Tenant');
      const editorTools = registry.getToolsForRole('Reviewer');
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

      const tools = registry.getToolsForRole('Tenant');

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
        {
          role: 'Tenant',
          userId: 'user-1',
          conversationId: 'conv-1',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
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
          {
            role: 'Tenant',
            userId: 'user-1',
            conversationId: 'conv-1',
            workspaceId: SAMPLE_WORKSPACE.id,
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
            role: 'Tenant',
            userId: 'user-1',
            conversationId: 'conv-1',
            workspaceId: SAMPLE_WORKSPACE.id,
          },
        ),
      ).rejects.toThrow(ToolAccessDeniedError);
    });

    it('should allow access with correct role', async () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('admin_only', ['Admin']));

      const { result } = await registry.execute(
        'admin_only',
        {},
        {
          role: 'Admin',
          userId: 'user-1',
          conversationId: 'conv-1',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
      );

      expect(result).toEqual({ result: 'admin_only' });
    });
  });

  describe('canExecute', () => {
    it('should return true for allowed roles', () => {
      const registry = new ToolRegistry();
      registry.register(createMockTool('tool', ['Tenant', 'Reviewer']));

      expect(registry.canExecute('tool', 'Tenant')).toBe(true);
      expect(registry.canExecute('tool', 'Reviewer')).toBe(true);
      expect(registry.canExecute('tool', 'Admin')).toBe(false);
    });

    it('should return false for unregistered tools', () => {
      const registry = new ToolRegistry();
      expect(registry.canExecute('missing', 'Tenant')).toBe(false);
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
        'INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        'doc-1',
        'doc-slug',
        SAMPLE_WORKSPACE.id,
        'Doc',
        'content',
        'hash',
        Date.now(),
      );
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
              'INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ).run('halfway', 'doc-slug', SAMPLE_WORKSPACE.id, 0, 'x', 'u', 0);
            throw new Error('mutation failed');
          }
          db.prepare(
            'INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run('row-1', 'doc-slug', SAMPLE_WORKSPACE.id, 0, 'x', 'u', 0);
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
          workspaceId: SAMPLE_WORKSPACE.id,
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
          {
            role: 'Admin',
            userId: 'u',
            conversationId: 'c',
            workspaceId: SAMPLE_WORKSPACE.id,
          },
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
        {
          role: 'Admin',
          userId: 'u',
          conversationId: 'c',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
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
          {
            role: 'Admin',
            userId: 'u',
            conversationId: 'c',
            workspaceId: SAMPLE_WORKSPACE.id,
          },
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
          {
            role: 'Admin',
            userId: 'u',
            conversationId: 'c',
            workspaceId: SAMPLE_WORKSPACE.id,
          },
        ),
      ).rejects.toThrow('missing required_field');

      const aud = db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as {
        n: number;
      };
      expect(aud.n).toBe(0);
    });
  });

  describe('createToolRegistry factory', () => {
    it('registers render_workflow_diagram for all roles', async () => {
      const { createToolRegistry } = await import('./create-registry');
      const db = createTestDb();
      const registry = createToolRegistry(db);
      for (const role of ['Tenant', 'Reviewer', 'Admin'] as const) {
        const names = registry.getToolsForRole(role).map((t) => t.name);
        expect(names).toContain('render_workflow_diagram');
      }
    });

    it('Sprint 13: registers the three lease tools', async () => {
      const { createToolRegistry } = await import('./create-registry');
      const db = createTestDb();
      const registry = createToolRegistry(db);
      const names = registry.getToolNames();

      expect(names).toContain('extract_clauses');
      expect(names).toContain('grade_clause_severity');
      expect(names).toContain('draft_negotiation_email');
    });

    it('Sprint 13: drops the ContentOps mutating tools', async () => {
      const { createToolRegistry } = await import('./create-registry');
      const db = createTestDb();
      const registry = createToolRegistry(db);
      const names = registry.getToolNames();

      expect(names).not.toContain('schedule_content_item');
      expect(names).not.toContain('approve_draft');
    });

    it('Sprint 13: extract_clauses + grade_clause_severity are ALL roles; draft_negotiation_email is Tenant+Reviewer+Admin', async () => {
      const { createToolRegistry } = await import('./create-registry');
      const db = createTestDb();
      const registry = createToolRegistry(db);

      for (const role of ['Tenant', 'Reviewer', 'Admin'] as const) {
        const names = registry.getToolsForRole(role).map((t) => t.name);
        expect(names).toContain('extract_clauses');
        expect(names).toContain('grade_clause_severity');
        expect(names).toContain('draft_negotiation_email');
      }
    });

    it('Sprint 13 + 45: total tool count is 8 (4 retained + 3 new + get_lease_findings)', async () => {
      const { createToolRegistry } = await import('./create-registry');
      const db = createTestDb();
      const registry = createToolRegistry(db);

      // 4 retained: search_corpus, get_document_summary, list_documents, render_workflow_diagram
      // 3 new:      extract_clauses, grade_clause_severity, draft_negotiation_email
      // Sprint 45:  get_lease_findings (read-only findings reader)
      // 2 removed:  schedule_content_item, approve_draft
      expect(registry.getToolNames()).toContain('get_lease_findings');
      expect(registry.getToolNames()).toHaveLength(8);
    });
  });

  // ==========================================================================
  // Sprint 44B — tool-failure redaction. A failed tool persists a SAFE record
  // (error name + code), NEVER the raw message (which can embed lease PII).
  // ==========================================================================
  describe('execute (tool-failure redaction — Sprint 44B)', () => {
    it('persists a safe { name, code } error record, never the raw PII message', async () => {
      const db = createTestDb();
      const registry = new ToolRegistry(db);
      registry.register({
        name: 'parse_tool',
        description: 'mirrors a JSON.parse failure on raw model output',
        inputSchema: { type: 'object', properties: {} },
        roles: 'ALL',
        category: 'system',
        execute: async () => {
          // Like draft_negotiation_email parsing the model's reply: the
          // SyntaxError message embeds the (PII-bearing) draft body.
          throw new SyntaxError(
            'Unexpected token in JSON: DRAFT-BODY-PII-xyz tenant Jane Doe $2200',
          );
        },
      });

      await expect(
        registry.execute(
          'parse_tool',
          {},
          {
            role: 'Tenant',
            userId: 'user-1',
            conversationId: 'conv-1',
            workspaceId: SAMPLE_WORKSPACE.id,
          },
        ),
      ).rejects.toThrow(SyntaxError);

      const row = db
        .prepare('SELECT status, error_message, error_code FROM tool_calls')
        .get() as {
        status: string;
        error_message: string | null;
        error_code: string | null;
      };
      expect(row.status).toBe('error');
      expect(row.error_message).toBe('SyntaxError'); // the safe NAME, not the message
      expect(row.error_code).toBe('parse_error');

      // The gating assertion: no substring of the model output is persisted.
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('DRAFT-BODY-PII-xyz');
      expect(serialized).not.toContain('Jane Doe');
      expect(serialized).not.toContain('2200');

      // audit_log stays mutations-only — no failure rows written there.
      const aud = db.prepare('SELECT COUNT(*) as n FROM audit_log').get() as {
        n: number;
      };
      expect(aud.n).toBe(0);
    });
  });
});
