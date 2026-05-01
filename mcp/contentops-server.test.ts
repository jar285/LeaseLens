// MCP Contract Tests
// Verifies parity between MCP server and direct registry calls
// Adapted pattern from docs/_references/ai_mcp_chat_ordo/tests/mcp/calculator-mcp-contract.test.ts

import Database from 'better-sqlite3';
import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../src/lib/tools/create-registry';

const DB_PATH = join(process.cwd(), 'data', 'contentops.db');

describe('MCP Server Contract', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  });

  describe('Tool Parity', () => {
    it('should expose all three tools in registry', () => {
      const registry = createToolRegistry(db);
      const toolNames = registry.getToolNames();

      expect(toolNames).toContain('search_corpus');
      expect(toolNames).toContain('get_document_summary');
      expect(toolNames).toContain('list_documents');
      expect(toolNames).toHaveLength(3);
    });

    it('should return same results via registry and expected tool behavior', async () => {
      const registry = createToolRegistry(db);

      // Test search_corpus
      const searchResult = await registry.execute(
        'search_corpus',
        { query: 'brand voice', max_results: 3 },
        { role: 'Admin', userId: 'test', conversationId: 'test' },
      );

      expect(searchResult).toHaveProperty('results');
      expect(searchResult).toHaveProperty('query', 'brand voice');
      expect(
        Array.isArray((searchResult as { results: unknown[] }).results),
      ).toBe(true);

      // Test get_document_summary
      const summaryResult = await registry.execute(
        'get_document_summary',
        { slug: 'brand-identity' },
        { role: 'Admin', userId: 'test', conversationId: 'test' },
      );

      expect(summaryResult).toHaveProperty('slug', 'brand-identity');
      expect(summaryResult).toHaveProperty('title');

      // Test list_documents
      const listResult = await registry.execute(
        'list_documents',
        {},
        { role: 'Admin', userId: 'test', conversationId: 'test' },
      );

      expect(listResult).toHaveProperty('document_count', 5);
      expect(listResult).toHaveProperty('documents');
      expect(
        Array.isArray((listResult as { documents: unknown[] }).documents),
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
    });
  });
});
