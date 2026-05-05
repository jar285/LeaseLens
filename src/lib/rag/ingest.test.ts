import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { ingestCorpus, ingestMarkdownFile } from './ingest';

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

describe('ingestMarkdownFile cross-workspace (Round 5)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();

    // Two non-sample workspaces. The same slug + identical content should land
    // in both without colliding on the chunks PRIMARY KEY.
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run('ws-a', 'A', 'A', now, now + 3600);
    db.prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    ).run('ws-b', 'B', 'B', now, now + 3600);
  });

  it('ingests the same slug+content into two workspaces without chunk-id collision', async () => {
    const slug = 'brand-identity';
    const content = DOC_CONTENT;

    await ingestMarkdownFile(db, { slug, content, workspaceId: 'ws-a' });
    await expect(
      ingestMarkdownFile(db, { slug, content, workspaceId: 'ws-b' }),
    ).resolves.toMatchObject({ chunkCount: expect.any(Number) });

    const counts = db
      .prepare(
        'SELECT workspace_id, COUNT(*) as n FROM chunks GROUP BY workspace_id',
      )
      .all() as { workspace_id: string; n: number }[];
    const byWs = Object.fromEntries(counts.map((r) => [r.workspace_id, r.n]));
    expect(byWs['ws-a']).toBeGreaterThan(0);
    // Same content → same chunk count in each workspace.
    expect(byWs['ws-b']).toBe(byWs['ws-a']);
  });

  it('Sprint 12 — uses forceDocumentId verbatim as document.id and chunk-id prefix when provided', async () => {
    const db = createTestDb();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES ('ws-seed', 'seed', 'd', 1, 0, NULL)`,
    ).run();

    const result = await ingestMarkdownFile(db, {
      slug: 'brand-identity',
      content: DOC_CONTENT,
      workspaceId: 'ws-seed',
      forceDocumentId: 'brand-identity',
    });

    expect(result.documentId).toBe('brand-identity');
    const docs = db
      .prepare('SELECT id, slug FROM documents WHERE slug = ?')
      .all('brand-identity') as { id: string; slug: string }[];
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('brand-identity');

    const chunkIds = db
      .prepare('SELECT id FROM chunks WHERE document_id = ?')
      .all('brand-identity') as { id: string }[];
    expect(chunkIds.length).toBeGreaterThan(0);
    for (const row of chunkIds) {
      expect(row.id).toMatch(/^brand-identity#(document|section|passage):\d+$/);
    }
  });

  it('Sprint 12 — omits forceDocumentId → randomUUID for upload safety (no cross-workspace collision)', async () => {
    const db = createTestDb();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES ('ws-1', 'a', 'd', 0, 0, 9999999999)`,
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES ('ws-2', 'b', 'd', 0, 0, 9999999999)`,
    ).run();

    const r1 = await ingestMarkdownFile(db, {
      slug: 'brand-identity',
      content: DOC_CONTENT,
      workspaceId: 'ws-1',
    });
    const r2 = await ingestMarkdownFile(db, {
      slug: 'brand-identity',
      content: DOC_CONTENT,
      workspaceId: 'ws-2',
    });

    expect(r1.documentId).not.toBe(r2.documentId);
    // Both should be UUID-shaped, not slug-shaped.
    expect(r1.documentId).not.toBe('brand-identity');
    expect(r2.documentId).not.toBe('brand-identity');
  });
});
