// Integration tests for corpus tools
// Tests against seeded database

import { join } from 'node:path';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import type { ToolExecutionContext } from './domain';

const DB_PATH = join(process.cwd(), 'data', 'contentops.db');

describe('Corpus Tools', () => {
  let db: Database.Database;
  let context: ToolExecutionContext;

  beforeAll(() => {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    context = {
      role: 'Admin',
      userId: 'test-user',
      conversationId: 'test-conv',
    };
  });

  describe('search_corpus', () => {
    it('should return results for a valid query', async () => {
      const tool = createSearchCorpusTool(db);
      const result = await tool.execute(
        { query: 'brand voice', max_results: 5 },
        context,
      );

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('query', 'brand voice');
      expect(Array.isArray((result as { results: unknown[] }).results)).toBe(
        true,
      );
      expect((result as { results: unknown[] }).results.length).toBeGreaterThan(
        0,
      );
      expect(
        (result as { results: unknown[] }).results.length,
      ).toBeLessThanOrEqual(5);
    });

    it('should respect max_results limit', async () => {
      const tool = createSearchCorpusTool(db);
      const result = await tool.execute(
        { query: 'content', max_results: 3 },
        context,
      );

      expect(
        (result as { results: unknown[] }).results.length,
      ).toBeLessThanOrEqual(3);
    });

    it('should return error for empty query', async () => {
      const tool = createSearchCorpusTool(db);
      const result = await tool.execute({ query: '' }, context);

      expect(result).toHaveProperty('error');
    });

    it('should return results for any query (vector similarity fallback)', async () => {
      const tool = createSearchCorpusTool(db);
      const result = await tool.execute(
        { query: 'xyznonexistent12345' },
        context,
      );

      // Hybrid retrieval uses vector similarity as fallback, so we may still get results
      // even for non-matching queries (this is expected behavior for the embedder)
      expect(result).toHaveProperty('results');
      expect(Array.isArray((result as { results: unknown[] }).results)).toBe(
        true,
      );
    });
  });

  describe('get_document_summary', () => {
    it('should return document by slug', async () => {
      const tool = createGetDocumentSummaryTool(db);
      const result = await tool.execute({ slug: 'brand-identity' }, context);

      expect(result).toHaveProperty('slug', 'brand-identity');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('chunk_count');
      expect(result).toHaveProperty('content_preview');
      expect((result as { has_more: boolean }).has_more).toBeDefined();
    });

    it('should return error for non-existent slug', async () => {
      const tool = createGetDocumentSummaryTool(db);
      const result = await tool.execute({ slug: 'does-not-exist' }, context);

      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('not found');
    });

    it('should return error for empty slug', async () => {
      const tool = createGetDocumentSummaryTool(db);
      const result = await tool.execute({ slug: '' }, context);

      expect(result).toHaveProperty('error');
    });
  });

  describe('list_documents', () => {
    it('should return all documents', async () => {
      const tool = createListDocumentsTool(db);
      const result = await tool.execute({}, context);

      expect(result).toHaveProperty('document_count');
      expect(result).toHaveProperty('documents');
      expect((result as { document_count: number }).document_count).toBe(5);
      expect(
        Array.isArray((result as { documents: unknown[] }).documents),
      ).toBe(true);

      const docs = (
        result as {
          documents: { slug: string; title: string; chunk_count: number }[];
        }
      ).documents;
      expect(
        docs.every(
          (d) => d.slug && d.title && typeof d.chunk_count === 'number',
        ),
      ).toBe(true);
    });

    it('should return sorted documents', async () => {
      const tool = createListDocumentsTool(db);
      const result = await tool.execute({}, context);

      const docs = (result as { documents: { title: string }[] }).documents;
      const titles = docs.map((d) => d.title);
      const sortedTitles = [...titles].sort();

      expect(titles).toEqual(sortedTitles);
    });
  });
});
