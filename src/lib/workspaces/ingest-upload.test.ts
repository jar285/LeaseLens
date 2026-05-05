import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '@/lib/test/db';

// Mock embed to avoid loading WASM model in unit tests.
vi.mock('@/lib/rag/embed', () => ({
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 384 }, (_, i) => Math.sin(i + 1))),
  ),
}));

import {
  ingestUpload,
  type UploadFile,
  UploadValidationError,
  validateUpload,
} from './ingest-upload';

function makeFile(over: Partial<UploadFile> = {}): UploadFile {
  return {
    filename: 'brand-identity.md',
    content: '# Brand\n\nA test paragraph for ingestion.',
    size: 50,
    mimeType: 'text/markdown',
    ...over,
  };
}

describe('validateUpload', () => {
  it('rejects oversized files', () => {
    expect(() =>
      validateUpload({
        name: 'Acme',
        description: 'A test',
        files: [makeFile({ size: 200_000 })],
      }),
    ).toThrow(UploadValidationError);
  });

  it('rejects too many files (6)', () => {
    expect(() =>
      validateUpload({
        name: 'Acme',
        description: 'A test',
        files: Array.from({ length: 6 }, () => makeFile()),
      }),
    ).toThrow(UploadValidationError);
  });

  it('rejects bad MIME and missing .md extension (both fallbacks fail)', () => {
    expect(() =>
      validateUpload({
        name: 'Acme',
        description: 'A test',
        files: [
          makeFile({ filename: 'something.bin', mimeType: 'application/zip' }),
        ],
      }),
    ).toThrow(UploadValidationError);
  });

  it('accepts .md filename with application/octet-stream MIME (sprint-QA M2)', () => {
    expect(() =>
      validateUpload({
        name: 'Acme',
        description: 'A test',
        files: [
          makeFile({
            filename: 'brand-identity.md',
            mimeType: 'application/octet-stream',
          }),
        ],
      }),
    ).not.toThrow();
  });
});

describe('ingestUpload', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a workspace and inserts chunks scoped to its id', async () => {
    const validated = validateUpload({
      name: 'Acme Test',
      description: 'A demo brand',
      files: [
        makeFile({
          filename: 'brand-identity.md',
          content: '# Brand\n\nThe Acme brand voice is direct.',
        }),
        makeFile({
          filename: 'audience.md',
          content: '# Audience\n\nWe write for technical readers.',
        }),
      ],
    });
    const { workspaceId } = await ingestUpload(db, validated);

    const docs = db
      .prepare('SELECT slug FROM documents WHERE workspace_id = ?')
      .all(workspaceId) as { slug: string }[];
    expect(docs.map((d) => d.slug).sort()).toEqual([
      'audience',
      'brand-identity',
    ]);

    const chunkCount = (
      db
        .prepare('SELECT COUNT(*) as c FROM chunks WHERE workspace_id = ?')
        .get(workspaceId) as { c: number }
    ).c;
    expect(chunkCount).toBeGreaterThan(0);
  });

  it('Round 5 — rolls back the workspace row when ingestMarkdownFile throws', async () => {
    // Force the SECOND file's embedBatch to reject so the first file ingests
    // (creating documents + chunks rows) and the second one explodes mid-flight.
    // The catch-and-delete must clean up the partial state AND the workspace row.
    const { embedBatch } = await import('@/lib/rag/embed');
    vi.mocked(embedBatch)
      .mockResolvedValueOnce(
        Array.from({ length: 5 }, () =>
          Array.from({ length: 384 }, (_, i) => Math.sin(i + 1)),
        ),
      )
      .mockRejectedValueOnce(new Error('embed boom'));

    const validated = validateUpload({
      name: 'Acme Test',
      description: 'A demo brand',
      files: [
        makeFile({
          filename: 'brand-identity.md',
          content: '# Brand\n\nA paragraph long enough to chunk.',
        }),
        makeFile({
          filename: 'audience.md',
          content: '# Audience\n\nAnother paragraph for the second file.',
        }),
      ],
    });

    await expect(ingestUpload(db, validated)).rejects.toThrow('embed boom');

    const wsCount = (
      db
        .prepare('SELECT COUNT(*) as n FROM workspaces WHERE is_sample = 0')
        .get() as { n: number }
    ).n;
    expect(wsCount, 'workspace row must be rolled back').toBe(0);

    const docs = (
      db.prepare('SELECT COUNT(*) as n FROM documents').get() as { n: number }
    ).n;
    expect(docs, 'document rows must be rolled back').toBe(0);

    const chunks = (
      db.prepare('SELECT COUNT(*) as n FROM chunks').get() as { n: number }
    ).n;
    expect(chunks, 'chunk rows must be rolled back').toBe(0);
  });
});
