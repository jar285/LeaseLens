import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA } from '@/lib/db/schema';
import type { GoldenCase } from './domain';
import { runGoldenEval } from './runner';

vi.mock('@/lib/rag/embed', () => ({
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map((text) => {
      const vec = Array.from({ length: 384 }, (_, i) => {
        return ((text.charCodeAt(i % text.length) + i) % 100) / 100;
      });
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return norm === 0 ? vec : vec.map((v) => v / norm);
    }),
  ),
}));

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  return db;
}

function mockEmbedding(text: string): Buffer {
  const vec = Array.from({ length: 384 }, (_, i) => {
    return ((text.charCodeAt(i % text.length) + i) % 100) / 100;
  });
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  const normalized = norm === 0 ? vec : vec.map((v) => v / norm);
  return Buffer.from(new Float32Array(normalized).buffer);
}

function seedDocument(db: Database.Database, slug: string): string {
  const docId = `doc-${slug}`;
  db.prepare(
    'INSERT INTO documents (id, slug, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(docId, slug, slug, 'full doc content', 'hash', Date.now());
  return docId;
}

function seedChunk(
  db: Database.Database,
  docId: string,
  overrides: {
    id: string;
    content: string;
    level?: 'document' | 'section' | 'passage';
    heading?: string | null;
    index?: number;
  },
): void {
  const level = overrides.level ?? 'section';
  const heading = overrides.heading ?? null;
  const chunkIndex = overrides.index ?? 0;
  const embedding = mockEmbedding(overrides.content);

  db.prepare(
    `INSERT INTO chunks (id, document_id, chunk_index, chunk_level, heading, content, embedding, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    overrides.id,
    docId,
    chunkIndex,
    level,
    heading,
    overrides.content,
    embedding,
    'all-MiniLM-L6-v2',
    Date.now(),
  );
}

describe('runGoldenEval', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('produces correct report structure with synthetic golden set', async () => {
    const docId = seedDocument(db, 'test-doc');
    seedChunk(db, docId, {
      id: 'test-doc#section:0',
      content:
        'The brand voice is conversational and knowledgeable like a friend',
      heading: 'Brand Voice',
      index: 0,
    });
    seedChunk(db, docId, {
      id: 'test-doc#section:1',
      content: 'Secondary content about other topics',
      heading: 'Other',
      index: 1,
    });

    const goldenSet: GoldenCase[] = [
      {
        id: 'test-case',
        query: 'brand voice conversational knowledgeable friend',
        expectedChunkIds: ['test-doc#section:0'],
        expectedKeywords: ['conversational', 'knowledgeable', 'friend'],
        k: 5,
      },
    ];

    const report = await runGoldenEval(db, goldenSet);

    expect(report.caseResults).toHaveLength(1);
    expect(report.caseResults[0]?.caseId).toBe('test-case');
    expect(report.caseResults[0]?.scorecard.dimensions).toHaveLength(4);
    expect(report.runId).toBeTruthy();
    expect(report.startedAt).toBeTruthy();
    expect(report.completedAt).toBeTruthy();
    expect(report.summary).toContain('Golden eval:');
    expect(report.overallScorecard.dimensions).toHaveLength(4);
  });

  it('returns passed report for empty golden set', async () => {
    const report = await runGoldenEval(db, []);

    expect(report.passed).toBe(true);
    expect(report.caseResults).toHaveLength(0);
    expect(report.overallScorecard.passed).toBe(true);
  });

  it('fails gracefully when case expects non-existent chunks', async () => {
    const docId = seedDocument(db, 'test-doc');
    seedChunk(db, docId, {
      id: 'test-doc#section:0',
      content: 'Some content about gaming reviews',
      heading: 'Reviews',
      index: 0,
    });

    const goldenSet: GoldenCase[] = [
      {
        id: 'impossible-case',
        query: 'What is our brand voice?',
        expectedChunkIds: ['non-existent#section:99'],
        expectedKeywords: ['nonexistent'],
        k: 5,
      },
    ];

    const report = await runGoldenEval(db, goldenSet);

    expect(report.passed).toBe(false);
    expect(report.caseResults[0]?.passed).toBe(false);
    const recallDim = report.caseResults[0]?.scorecard.dimensions.find(
      (d) => d.id === 'recall_at_k',
    );
    expect(recallDim?.score).toBe(0);
    expect(recallDim?.passed).toBe(false);
  });
});
