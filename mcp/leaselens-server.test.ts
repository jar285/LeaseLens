// MCP Contract Tests
// Verifies parity between MCP server and direct registry calls
// Adapted pattern from docs/_references/ai_mcp_chat_ordo/tests/mcp/calculator-mcp-contract.test.ts
//
// Sprint 13: rewritten to use in-memory SQLite + seed helpers per
// agent-guidelines §1 Vitest hermeticity rule. Pre-S13 the file opened
// the dev DB directly, which made the envelope test order-dependent on
// db:seed state.

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../src/lib/test/db';
import { seedChunk, seedDocument } from '../src/lib/test/seed';
import { createToolRegistry } from '../src/lib/tools/create-registry';
import { SAMPLE_WORKSPACE } from '../src/lib/workspaces/constants';

vi.mock('@/lib/rag/embed', async () => {
  const m = await import('../src/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

const FIXTURE_DOCS = [
  {
    slug: 'brand-identity',
    title: 'brand-identity',
    chunks: [
      { id: 'brand-identity#section:0', content: 'mission identity overview' },
      {
        id: 'brand-identity#section:3',
        content: 'brand voice — conversational, knowledgeable friend',
      },
    ],
  },
  {
    slug: 'content-pillars',
    title: 'content-pillars',
    chunks: [{ id: 'content-pillars#section:0', content: 'pillar coverage' }],
  },
  {
    slug: 'content-calendar',
    title: 'content-calendar',
    chunks: [
      { id: 'content-calendar#section:0', content: 'editorial weekly cadence' },
    ],
  },
  {
    slug: 'audience-profile',
    title: 'audience-profile',
    chunks: [
      {
        id: 'audience-profile#section:0',
        content: 'audience players community',
      },
    ],
  },
  {
    slug: 'style-guide',
    title: 'style-guide',
    chunks: [{ id: 'style-guide#section:0', content: 'tone of voice intro' }],
  },
];

function seedFixture(db: Database.Database): void {
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    Math.floor(Date.now() / 1000),
  );
  for (const doc of FIXTURE_DOCS) {
    const docId = seedDocument(db, doc.slug);
    doc.chunks.forEach((chunk, index) => {
      seedChunk(db, docId, {
        id: chunk.id,
        content: chunk.content,
        index,
        level: 'section',
      });
    });
  }
}

describe('MCP Server Contract', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedFixture(db);
  });

  describe('Tool Parity', () => {
    it('exposes the LeaseLens 7-tool surface (Sprint 13)', () => {
      const registry = createToolRegistry(db);
      const toolNames = registry.getToolNames();

      // 3 retained read-only corpus tools
      expect(toolNames).toContain('search_corpus');
      expect(toolNames).toContain('get_document_summary');
      expect(toolNames).toContain('list_documents');
      // Sprint 12: visualization tool retained.
      expect(toolNames).toContain('render_workflow_diagram');
      // Sprint 13: three new lease tools.
      expect(toolNames).toContain('extract_clauses');
      expect(toolNames).toContain('grade_clause_severity');
      expect(toolNames).toContain('draft_negotiation_email');
      // ContentOps mutating tools removed.
      expect(toolNames).not.toContain('schedule_content_item');
      expect(toolNames).not.toContain('approve_draft');
      expect(toolNames).toHaveLength(7);
    });

    it('should return envelope-shaped results from registry.execute', async () => {
      const registry = createToolRegistry(db);

      // Read-only path: audit_id is undefined.
      const search = await registry.execute(
        'search_corpus',
        { query: 'brand voice', max_results: 3 },
        {
          role: 'Admin',
          userId: 'test',
          conversationId: 'test',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
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
        {
          role: 'Admin',
          userId: 'test',
          conversationId: 'test',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
      );
      expect(summary.audit_id).toBeUndefined();
      expect(summary.result).toHaveProperty('slug', 'brand-identity');
      expect(summary.result).toHaveProperty('title');

      const list = await registry.execute(
        'list_documents',
        {},
        {
          role: 'Admin',
          userId: 'test',
          conversationId: 'test',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
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
    it('Admin sees all 7 LeaseLens tools', () => {
      const registry = createToolRegistry(db);
      const adminTools = registry.getToolsForRole('Admin');
      const names = adminTools.map((t) => t.name);

      expect(names).toContain('search_corpus');
      expect(names).toContain('get_document_summary');
      expect(names).toContain('list_documents');
      expect(names).toContain('render_workflow_diagram');
      expect(names).toContain('extract_clauses');
      expect(names).toContain('grade_clause_severity');
      expect(names).toContain('draft_negotiation_email');
    });

    it('Reviewer sees search/get plus all three lease tools (Sprint 13)', () => {
      const registry = createToolRegistry(db);
      const names = registry.getToolsForRole('Reviewer').map((t) => t.name);

      expect(names).toContain('search_corpus');
      expect(names).toContain('get_document_summary');
      expect(names).not.toContain('list_documents');
      expect(names).toContain('extract_clauses');
      expect(names).toContain('grade_clause_severity');
      expect(names).toContain('draft_negotiation_email');
    });

    it('Tenant sees search_corpus + the three lease tools; NOT the removed ContentOps tools (Sprint 13)', () => {
      const registry = createToolRegistry(db);
      const names = registry.getToolsForRole('Tenant').map((t) => t.name);

      expect(names).toContain('search_corpus');
      expect(names).not.toContain('get_document_summary');
      expect(names).not.toContain('list_documents');
      expect(names).not.toContain('schedule_content_item');
      expect(names).not.toContain('approve_draft');
      expect(names).toContain('extract_clauses');
      expect(names).toContain('grade_clause_severity');
      expect(names).toContain('draft_negotiation_email');
    });

    it('should expose render_workflow_diagram for all three roles', () => {
      const registry = createToolRegistry(db);
      for (const role of ['Tenant', 'Reviewer', 'Admin'] as const) {
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
          role: 'Tenant',
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

  describe('Mutating tools surface via MCP and produce audit rows (Sprint 13)', () => {
    it('draft_negotiation_email executes via registry and writes an audit row attributed to mcp-server', async () => {
      // Stub Anthropic so the prepare step is deterministic.
      const fakeAnthropic = {
        messages: {
          create: async () => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  subject: 'Re: security deposit',
                  body: 'Dear Landlord, …',
                }),
              },
            ],
          }),
        },
      };
      const registry = createToolRegistry(db, fakeAnthropic);

      // Seed mcp-server user + a lease + a clause Admin can act on.
      db.prepare(
        'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(
        'mcp-server',
        'mcp@local',
        'Admin',
        'MCP Server',
        Math.floor(Date.now() / 1000),
      );
      db.prepare(
        `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
         VALUES ('lease-mcp', ?, 'mcp.pdf', 'text', 1, 'mcp-server', 1)`,
      ).run(SAMPLE_WORKSPACE.id);
      db.prepare(
        `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
         VALUES ('clause-mcp', 'lease-mcp', ?, 0, 'security_deposit', 'Tenant shall provide a security deposit equal to two months rent.', 1, 1)`,
      ).run(SAMPLE_WORKSPACE.id);

      const beforeRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };

      const { result, audit_id } = await registry.execute(
        'draft_negotiation_email',
        { clause_id: 'clause-mcp', tone: 'polite' },
        {
          role: 'Admin',
          userId: 'mcp-server',
          conversationId: 'mcp-session',
          workspaceId: SAMPLE_WORKSPACE.id,
        },
      );

      expect(audit_id).toBeTruthy();
      expect(result).toHaveProperty('email_id');

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
      expect(auditRow.tool_name).toBe('draft_negotiation_email');

      const afterRow = db
        .prepare('SELECT COUNT(*) as n FROM audit_log')
        .get() as { n: number };
      expect(afterRow.n).toBe(beforeRow.n + 1);
    });
  });
});
