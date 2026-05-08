// Sprint 14 / Phase 11 — pin the Tier 1 golden set's expectedChunkIds
// to actual chunks the seed path produces. Regenerates the corpus into
// an in-memory DB via the real `ingestCorpus` helper (same path
// `npm run db:seed` uses), then asserts every `expectedChunkIds[i]`
// across all 12 golden cases resolves. Catches drift between the
// corpus filesystem and the eval expectations BEFORE `npm run eval:golden`
// reports a misleading 0% recall.

import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';

vi.mock('@/lib/rag/embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

import { ingestCorpus } from '@/lib/rag/ingest';
import { createTestDb } from '@/lib/test/db';
import { GOLDEN_SET } from './golden-set';

const NJ_CORPUS_DIR = join(process.cwd(), 'src', 'corpus', 'nj-tenant-law');

describe('GOLDEN_SET (NJ tenant-law Tier 1)', () => {
  let db: Database.Database;

  beforeAll(async () => {
    db = createTestDb();
    db.prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      Math.floor(Date.now() / 1000),
    );
    await ingestCorpus(db, NJ_CORPUS_DIR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains exactly 12 cases (one per issue family from spec §3d)', () => {
    expect(GOLDEN_SET).toHaveLength(12);
  });

  it('every case has unique id, non-empty query, k > 0', () => {
    const ids = new Set<string>();
    for (const c of GOLDEN_SET) {
      expect(c.id).toBeTruthy();
      expect(c.query.length).toBeGreaterThan(10);
      expect(c.expectedChunkIds.length).toBeGreaterThan(0);
      expect(c.k).toBeGreaterThan(0);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  it('every expectedChunkId resolves to a real chunk after ingesting the NJ corpus', () => {
    const allChunkIds = new Set(
      (
        db
          .prepare('SELECT id FROM chunks WHERE workspace_id = ?')
          .all(SAMPLE_WORKSPACE.id) as { id: string }[]
      ).map((r) => r.id),
    );

    const missing: { caseId: string; chunkId: string }[] = [];
    for (const c of GOLDEN_SET) {
      for (const chunkId of c.expectedChunkIds) {
        if (!allChunkIds.has(chunkId)) {
          missing.push({ caseId: c.id, chunkId });
        }
      }
    }

    if (missing.length > 0) {
      // Fail with a tight diagnostic so the developer can fix the
      // golden set OR add a missing corpus file.
      const lines = missing
        .map((m) => `  case "${m.caseId}" → "${m.chunkId}"`)
        .join('\n');
      throw new Error(
        `\n${missing.length} expectedChunkId(s) not found in the seeded corpus:\n${lines}\n`,
      );
    }
    expect(missing).toEqual([]);
  });
});
