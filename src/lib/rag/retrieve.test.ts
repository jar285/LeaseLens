import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedChunk, seedDocument } from '@/lib/test/seed';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { retrieve } from './retrieve';

const WS = SAMPLE_WORKSPACE.id;

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

    const results = await retrieve('alpha beta gamma', db, { workspaceId: WS });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunkId).toBe('chunk-alpha');
  });

  it('returns empty array when corpus is empty', async () => {
    const results = await retrieve('any query', db, { workspaceId: WS });
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

    const results = await retrieve('alpha', db, { workspaceId: WS, maxResults: 2 });
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

    const results = await retrieve('brand', db, { workspaceId: WS });

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.rrfScore).toBeGreaterThan(0);
    }
  });

  it('cross-workspace isolation: chunks in workspace A are not returned for a query against workspace B (Sprint 11)', async () => {
    const wsA = '00000000-0000-0000-0000-0000000000aa';
    const wsB = '00000000-0000-0000-0000-0000000000bb';
    // Workspace A has the relevant chunk; workspace B is empty.
    const docA = seedDocument(db, 'brand-identity', wsA);
    seedChunk(db, docA, {
      id: 'chunk-a',
      content: 'authentic gaming voice',
      level: 'section',
      heading: 'Voice',
      workspaceId: wsA,
    });

    // Query against workspace B — should return nothing.
    const resultsB = await retrieve('authentic gaming voice', db, {
      workspaceId: wsB,
    });
    expect(resultsB).toEqual([]);

    // Query against workspace A — should return the chunk.
    const resultsA = await retrieve('authentic gaming voice', db, {
      workspaceId: wsA,
    });
    expect(resultsA.length).toBeGreaterThan(0);
    expect(resultsA[0].chunkId).toBe('chunk-a');
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

    const results = await retrieve('brand', db, { workspaceId: WS });

    const ids = results.map((r) => r.chunkId);
    expect(ids).not.toContain('doc-chunk');
  });
});
