import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedChunk, seedDocument } from '@/lib/test/seed';
import type { GoldenCase } from './domain';
import { runGoldenEval } from './runner';

vi.mock('@/lib/rag/embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

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
