import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '@/lib/db/client';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { chunkDocument } from './chunk-document';
import { embedBatch } from './embed';

const DEFAULT_CORPUS_DIR = join(process.cwd(), 'src', 'corpus');
const EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

interface DocumentRow {
  id: string;
  content_hash: string;
}

export interface IngestFileInput {
  slug: string;
  content: string;
  workspaceId: string;
  /**
   * Sprint 12 — optional override for the document's primary key.
   * When provided, used verbatim as the row id (and therefore as the
   * prefix on every chunk id). Used by the corpus seed path to keep
   * deterministic, slug-prefixed chunk ids that match the eval
   * golden set. Upload paths must NOT pass this — they need
   * randomUUID() so identical slugs in different workspaces never
   * collide on the chunks PRIMARY KEY (Sprint 11 round 5).
   */
  forceDocumentId?: string;
}

export interface IngestFileResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Sprint 11 — per-file ingestion that's workspace-scoped. Used by:
 *   - The corpus seed path (ingestCorpus, below).
 *   - The upload route via ingest-upload.ts.
 *
 * Lookup uses the composite (slug, workspace_id) — same slug can exist
 * in multiple workspaces (Spec §4.1, §14).
 */
export async function ingestMarkdownFile(
  db: Db,
  input: IngestFileInput,
): Promise<IngestFileResult> {
  const { slug, content, workspaceId, forceDocumentId } = input;
  const contentHash = createHash('sha256').update(content).digest('hex');

  const existing = await db
    .prepare(
      'SELECT id, content_hash FROM documents WHERE slug = ? AND workspace_id = ?',
    )
    .get<DocumentRow>(slug, workspaceId);

  if (existing?.content_hash === contentHash) {
    return { documentId: existing.id, chunkCount: 0 };
  }

  const title = extractTitle(content, slug);
  // Round 5 — chunk IDs are namespaced by documentId so identical
  // slug+content in distinct workspaces don't collide on the chunks
  // PRIMARY KEY. Spec §22. Sprint 12 — the seed path passes a
  // deterministic `forceDocumentId` (the slug) so the eval golden
  // set's slug-prefixed chunk IDs continue to resolve.
  const documentId = existing?.id ?? forceDocumentId ?? randomUUID();
  const chunks = chunkDocument(documentId, title, content);
  const vectors = await embedBatch(chunks.map((c) => c.embeddingInput));

  // Issue #29 — the upsert is a single async transaction. Every statement
  // goes through the `tx` handle; `forEach` is replaced by an awaited
  // loop because chunk inserts are now async.
  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .prepare(
          'UPDATE documents SET title = ?, content = ?, content_hash = ?, created_at = ? WHERE id = ?',
        )
        .run(title, content, contentHash, Date.now(), documentId);
      await tx
        .prepare('DELETE FROM chunks WHERE document_id = ?')
        .run(documentId);
    } else {
      await tx
        .prepare(
          `INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          documentId,
          slug,
          workspaceId,
          title,
          content,
          contentHash,
          Date.now(),
        );
    }

    const insertChunk = tx.prepare(`
      INSERT INTO chunks
        (id, document_id, workspace_id, chunk_index, chunk_level, heading, content, embedding, embedding_model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [index, chunk] of chunks.entries()) {
      const vector = vectors[index];
      const blob = vector ? Buffer.from(new Float32Array(vector).buffer) : null;
      await insertChunk.run(
        chunk.id,
        documentId,
        workspaceId,
        index,
        chunk.level,
        chunk.heading,
        chunk.content,
        blob,
        EMBEDDING_MODEL,
        Date.now(),
      );
    }
  });

  return { documentId, chunkCount: chunks.length };
}

export async function ingestCorpus(
  db: Db,
  corpusDir: string = DEFAULT_CORPUS_DIR,
  workspaceId: string = SAMPLE_WORKSPACE.id,
): Promise<void> {
  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = readFileSync(join(corpusDir, file), 'utf-8');
    // Seed path uses slug-as-id so chunk IDs are deterministic
    // (`brand-identity#section:N`). The eval golden set keys on this
    // shape. Upload paths intentionally omit `forceDocumentId` so
    // they get randomUUID() and avoid cross-workspace collisions.
    const result = await ingestMarkdownFile(db, {
      slug,
      content,
      workspaceId,
      forceDocumentId: slug,
    });
    if (result.chunkCount === 0) {
      console.log(`${slug}: unchanged, skipping`);
    } else {
      console.log(`${slug}: ${result.chunkCount} chunks embedded`);
    }
  }
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : fallback;
}
