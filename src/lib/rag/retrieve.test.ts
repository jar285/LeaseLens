import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedChunk, seedDocument } from '@/lib/test/seed';
import { retrieve } from './retrieve';

vi.mock('./embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

describe('retrieve', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns top-k results for a relevant query', async () => {
    const docId = seedDocument(db, 'brand-identity');
    seedChunk(db, docId, {
      id: 'chunk-alpha',
      content: 'alpha beta gamma',
      level: 'section',
      heading: 'Brand Voice',
    });
    seedChunk(db, docId, {
      id: 'chunk-other',
      content: 'unrelated content about weather',
      level: 'section',
      heading: 'Other',
      index: 1,
    });

    const results = await retrieve('alpha beta gamma', db);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe('chunk-alpha');
  });

  it('returns empty array when corpus is empty', async () => {
    const results = await retrieve('any query', db);
    expect(results).toEqual([]);
  });

  it('respects maxResults option', async () => {
    const doc1Id = seedDocument(db, 'doc-one');
    const doc2Id = seedDocument(db, 'doc-two');

    for (let i = 0; i < 3; i++) {
      seedChunk(db, doc1Id, {
        id: `chunk-a${i}`,
        content: `section alpha content part ${i}`,
        level: 'section',
        index: i,
      });
    }
    for (let i = 0; i < 3; i++) {
      seedChunk(db, doc2Id, {
        id: `chunk-b${i}`,
        content: `section beta content part ${i}`,
        level: 'section',
        index: i,
      });
    }

    const results = await retrieve('alpha', db, { maxResults: 2 });
    expect(results.length).toBe(2);
  });

  it('all returned chunks have rrfScore > 0', async () => {
    const docId = seedDocument(db, 'style-guide');
    seedChunk(db, docId, {
      id: 'c1',
      content: 'brand voice guidelines',
      level: 'section',
      index: 0,
    });
    seedChunk(db, docId, {
      id: 'c2',
      content: 'content calendar planning',
      level: 'section',
      index: 1,
    });
    seedChunk(db, docId, {
      id: 'c3',
      content: 'audience profile data',
      level: 'section',
      index: 2,
    });

    const results = await retrieve('brand', db);

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.rrfScore).toBeGreaterThan(0);
    }
  });

  it('document-level chunks are excluded', async () => {
    const docId = seedDocument(db, 'test-doc');
    seedChunk(db, docId, {
      id: 'doc-chunk',
      content: 'full document summary',
      level: 'document',
      index: 0,
    });
    seedChunk(db, docId, {
      id: 'section-chunk-1',
      content: 'section about brand voice',
      level: 'section',
      index: 1,
    });
    seedChunk(db, docId, {
      id: 'section-chunk-2',
      content: 'section about content strategy',
      level: 'section',
      index: 2,
    });

    const results = await retrieve('brand', db);

    const ids = results.map((r) => r.chunkId);
    expect(ids).not.toContain('doc-chunk');
  });
});
