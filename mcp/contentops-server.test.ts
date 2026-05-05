// MCP Contract Tests
// Verifies parity between MCP server and direct registry calls
// Adapted pattern from docs/_references/ai_mcp_chat_ordo/tests/mcp/calculator-mcp-contract.test.ts

import Database from 'better-sqlite3';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../src/lib/tools/create-registry';
import { SAMPLE_WORKSPACE } from '../src/lib/workspaces/constants';

const DB_PATH = join(process.cwd(), 'data', 'contentops.db');

describe('MCP Server Contract', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  });

  describe('Tool Parity', () => {
    it('should expose the read-only, mutating, and visualization tools', () => {
      const registry = createToolRegistry(db);
      const toolNames = registry.getToolNames();

      expect(toolNames).toContain('search_corpus');
      expect(toolNames).toContain('get_document_summary');
      expect(toolNames).toContain('list_documents');
      expect(toolNames).toContain('schedule_content_item');
      expect(toolNames).toContain('approve_draft');
      // Sprint 12: visualization tool added.
      expect(toolNames).toContain('render_workflow_diagram');
      expect(toolNames).toHaveLength(6);
    });

    it('should return envelope-shaped results from registry.execute', async () => {
      const registry = createToolRegistry(db);

      // Read-only path: audit_id is undefined.
      const search = await registry.execute(
        'search_corpus',
        { query: 'brand voice', max_results: 3 },
        { role: 'Admin', userId: 'test', conversationId: 'test', workspaceId: SAMPLE_WORKSPACE.id },
      );
      expect(search.audit_id).toBeUndefined();
      expect(search.result).toHaveProperty('results');
      expect(search.result).toHaveProperty('query', 'brand voice');
      expect(
        Array.isArray((search.result as { results: unknown[] }).results),
      ).toBe(true);

      const summary = await registry.execute(
        'get_document_summary',
        { slug: 'brand-identity' },
        { role: 'Admin', userId: 'test', conversationId: 'test', workspaceId: SAMPLE_WORKSPACE.id },
      );
      expect(summary.audit_id).toBeUndefined();
      expect(summary.result).toHaveProperty('slug', 'brand-identity');
      expect(summary.result).toHaveProperty('title');

      const list = await registry.execute(
        'list_documents',
        {},
        { role: 'Admin', userId: 'test', conversationId: 'test', workspaceId: SAMPLE_WORKSPACE.id },
      );
      expect(list.audit_id).toBeUndefined();
      expect(list.result).toHaveProperty('document_count', 5);
      expect(list.result).toHaveProperty('documents');
      expect(
        Array.isArray((list.result as { documents: unknown[] }).documents),
      ).toBe(true);
    });
  });

  describe('RBAC via MCP Context', () => {
    it('should allow Admin to execute all tools', async () => {
      const registry = createToolRegistry(db);
      const adminTools = registry.getToolsForRole('Admin');

      expect(adminTools.map((t) => t.name)).toContain('search_corpus');
      expect(adminTools.map((t) => t.name)).toContain('get_document_summary');
      expect(adminTools.map((t) => t.name)).toContain('list_documents');
    });

    it('should allow Editor to execute search_corpus and get_document_summary', async () => {
      const registry = createToolRegistry(db);
      const editorTools = registry.getToolsForRole('Editor');

      expect(editorTools.map((t) => t.name)).toContain('search_corpus');
      expect(editorTools.map((t) => t.name)).toContain('get_document_summary');
      expect(editorTools.map((t) => t.name)).not.toContain('list_documents');
    });

    it('should allow Creator to execute only search_corpus', async () => {
      const registry = createToolRegistry(db);
      const creatorTools = registry.getToolsForRole('Creator');

      expect(creatorTools.map((t) => t.name)).toContain('search_corpus');
      expect(creatorTools.map((t) => t.name)).not.toContain(
        'get_document_summary',
      );
      expect(creatorTools.map((t) => t.name)).not.toContain('list_documents');
      expect(creatorTools.map((t) => t.name)).not.toContain(
        'schedule_content_item',
      );
      expect(creatorTools.map((t) => t.name)).not.toContain('approve_draft');
    });

    it('should expose render_workflow_diagram for all three roles', () => {
      const registry = createToolRegistry(db);
      for (const role of ['Creator', 'Editor', 'Admin'] as const) {
        const names = registry.getToolsForRole(role).map((t) => t.name);
        expect(names).toContain('render_workflow_diagram');
      }
    });

    it('render_workflow_diagram executes via registry as a read-only tool (no audit row)', async () => {
      const registry = createToolRegistry(db);
      const beforeRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };

      const { result, audit_id } = await registry.execute(
        'render_workflow_diagram',
        {
          code: 'flowchart TD\nA-->B',
          title: 'MCP smoke',
        },
        {
          role: 'Creator',
          userId: 'mcp-server',
          conversationId: 'mcp-session',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
      );

      expect(audit_id).toBeUndefined();
      expect(result).toMatchObject({
        code: 'flowchart TD\nA-->B',
        diagram_type: 'flowchart',
        title: 'MCP smoke',
      });

      const afterRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };
      expect(afterRow.n).toBe(beforeRow.n);
    });
  });

  describe('Mutating tools surface via MCP and produce audit rows (Sprint 8)', () => {
    it('schedule_content_item executes via registry and writes an audit row attributed to mcp-server', async () => {
      const registry = createToolRegistry(db);

      // Snapshot audit_log row count before
      const beforeRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };

      // Find a real corpus slug from the sample workspace specifically.
      // The dev DB may carry uploaded brand documents from manual smoke
      // tests; an unscoped LIMIT 1 can pick a non-sample slug and the
      // schedule tool's per-workspace existence check then 500s.
      const doc = db
        .prepare('SELECT slug FROM documents WHERE workspace_id = ? LIMIT 1')
        .get(SAMPLE_WORKSPACE.id) as { slug: string } | undefined;
      expect(doc).toBeDefined();
      if (!doc) return;

      const { result, audit_id } = await registry.execute(
        'schedule_content_item',
        {
          document_slug: doc.slug,
          scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
          channel: 'twitter',
        },
        {
          role: 'Admin',
          userId: 'mcp-server',
          conversationId: 'mcp-session',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
      );

      expect(audit_id).toBeTruthy();
      expect(result).toHaveProperty('schedule_id');

      // Audit row attributed to mcp-server / Admin
      const auditRow = db
        .prepare(
          'SELECT actor_user_id, actor_role, tool_name FROM audit_log WHERE id = ?',
        )
        .get(audit_id) as {
        actor_user_id: string;
        actor_role: string;
        tool_name: string;
      };
      expect(auditRow.actor_user_id).toBe('mcp-server');
      expect(auditRow.actor_role).toBe('Admin');
      expect(auditRow.tool_name).toBe('schedule_content_item');

      // Audit_log grew by exactly 1
      const afterRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };
      expect(afterRow.n).toBe(beforeRow.n + 1);

      // Cleanup so subsequent test runs are deterministic
      db.prepare('DELETE FROM audit_log WHERE id = ?').run(audit_id);
      db.prepare(
        'DELETE FROM content_calendar WHERE id = ?',
      ).run((result as { schedule_id: string }).schedule_id);
    });
  });
});
