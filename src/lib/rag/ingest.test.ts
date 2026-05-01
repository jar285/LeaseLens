import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { ingestCorpus } from './ingest';

vi.mock('./embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

const DOC_CONTENT = [
  '# Mock Document',
  '',
  '## Section Alpha',
  '',
  Array.from({ length: 40 }, (_, i) => `alpha${i}`).join(' '),
  '',
  '## Section Beta',
  '',
  Array.from({ length: 40 }, (_, i) => `beta${i}`).join(' '),
].join('\n');

const DOC_CONTENT_V2 = `${DOC_CONTENT}\n\nAdditional content that changes the hash.`;

function makeTempCorpus(content: string): string {
  const dir = join(
    tmpdir(),
    `ingest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mock-doc.md'), content, 'utf-8');
  return dir;
}

describe('ingestCorpus', () => {
  let db: Database.Database;
  let corpusDir: string;

  beforeEach(() => {
    db = createTestDb();
    corpusDir = makeTempCorpus(DOC_CONTENT);
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(corpusDir, { recursive: true, force: true });
  });

  it('creates one documents row and multiple chunks rows for a new document', async () => {
    await ingestCorpus(db, corpusDir);

    const docCount = (
      db.prepare('SELECT COUNT(*) as n FROM documents').get() as { n: number }
    ).n;
    const chunkCount = (
      db.prepare('SELECT COUNT(*) as n FROM chunks').get() as { n: number }
    ).n;

    expect(docCount).toBe(1);
    expect(chunkCount).toBeGreaterThan(0);
  });

  it('skips re-ingestion when slug and content_hash are unchanged (idempotency)', async () => {
    await ingestCorpus(db, corpusDir);
    const afterFirst = (
      db.prepare('SELECT COUNT(*) as n FROM chunks').get() as { n: number }
    ).n;

    await ingestCorpus(db, corpusDir);
    const afterSecond = (
      db.prepare('SELECT COUNT(*) as n FROM chunks').get() as { n: number }
    ).n;

    expect(afterSecond).toBe(afterFirst);
  });

  it('replaces old chunks when content changes for the same slug', async () => {
    await ingestCorpus(db, corpusDir);

    const docBefore = db
      .prepare('SELECT id, content_hash FROM documents WHERE slug = ?')
      .get('mock-doc') as { id: string; content_hash: string };
    const idsBefore = (
      db
        .prepare('SELECT id FROM chunks WHERE document_id = ?')
        .all(docBefore.id) as { id: string }[]
    ).map((r) => r.id);

    writeFileSync(join(corpusDir, 'mock-doc.md'), DOC_CONTENT_V2, 'utf-8');
    await ingestCorpus(db, corpusDir);

    const docAfter = db
      .prepare('SELECT id, content_hash FROM documents WHERE slug = ?')
      .get('mock-doc') as { id: string; content_hash: string };
    const idsAfter = (
      db
        .prepare('SELECT id FROM chunks WHERE document_id = ?')
        .all(docAfter.id) as { id: string }[]
    ).map((r) => r.id);

    expect(docAfter.id).toBe(docBefore.id);
    expect(docAfter.content_hash).not.toBe(docBefore.content_hash);
    expect(idsAfter.length).toBeGreaterThan(0);
    expect(idsAfter).toEqual(idsBefore);
  });

  it('stores embeddings as non-null BLOBs with the correct byte length', async () => {
    await ingestCorpus(db, corpusDir);

    const rows = db.prepare('SELECT embedding FROM chunks').all() as {
      embedding: Buffer;
    }[];

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.embedding).not.toBeNull();
      expect(row.embedding.byteLength).toBe(384 * 4);
    }
  });
});
