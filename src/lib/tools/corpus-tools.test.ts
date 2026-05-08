// Unit tests for corpus tools — hermetic via in-memory SQLite per
// agent-guidelines §1 Vitest rule. Pre-Sprint-13 this file opened the
// real dev DB, which made it order-dependent on db:seed state.

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedChunk, seedDocument } from '@/lib/test/seed';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import type { ToolExecutionContext } from './domain';

vi.mock('@/lib/rag/embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

const FIXTURE_DOCS = [
  {
    slug: 'brand-identity',
    chunks: [
      { id: 'brand-identity#section:0', content: 'mission and identity' },
      { id: 'brand-identity#section:1', content: 'mission statement intro' },
      { id: 'brand-identity#section:2', content: 'audience overview' },
      {
        id: 'brand-identity#section:3',
        content: 'brand voice — conversational, knowledgeable friend',
      },
    ],
  },
  {
    slug: 'content-pillars',
    chunks: [
      { id: 'content-pillars#section:0', content: 'pillar overview content' },
      { id: 'content-pillars#section:1', content: 'pillar 1 community' },
    ],
  },
  {
    slug: 'content-calendar',
    chunks: [
      { id: 'content-calendar#section:0', content: 'editorial weekly cadence' },
    ],
  },
  {
    slug: 'audience-profile',
    chunks: [
      { id: 'audience-profile#section:0', content: 'primary audience players' },
    ],
  },
  {
    slug: 'style-guide',
    chunks: [
      { id: 'style-guide#section:0', content: 'tone of voice intro' },
      { id: 'style-guide#section:1', content: 'tone with authority' },
    ],
  },
];

function seedFixtureCorpus(db: Database.Database): void {
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

describe('Corpus Tools', () => {
  let db: Database.Database;
  let context: ToolExecutionContext;

  beforeEach(() => {
    db = createTestDb();
    db.prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      Math.floor(Date.now() / 1000),
    );
    seedFixtureCorpus(db);
    context = {
      role: 'Admin',
      userId: 'test-user',
      conversationId: 'test-conv',
      workspaceId: SAMPLE_WORKSPACE.id,
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
