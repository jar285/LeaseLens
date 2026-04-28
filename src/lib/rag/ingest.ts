import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { chunkDocument } from './chunk-document';
import { embedBatch } from './embed';

const DEFAULT_CORPUS_DIR = join(process.cwd(), 'src', 'corpus');
const EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

interface DocumentRow {
  id: string;
  content_hash: string;
}

export async function ingestCorpus(
  db: Database.Database,
  corpusDir: string = DEFAULT_CORPUS_DIR,
): Promise<void> {
  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = readFileSync(join(corpusDir, file), 'utf-8');
    const contentHash = createHash('sha256').update(content).digest('hex');

    const existing = db
      .prepare('SELECT id, content_hash FROM documents WHERE slug = ?')
      .get(slug) as DocumentRow | undefined;

    if (existing?.content_hash === contentHash) {
      console.log(`${slug}: unchanged, skipping`);
      continue;
    }

    const title = extractTitle(content, slug);
    const chunks = chunkDocument(slug, title, content);
    const vectors = await embedBatch(chunks.map((c) => c.embeddingInput));

    const documentId = existing?.id ?? randomUUID();

    const upsert = db.transaction(() => {
      if (existing) {
        db.prepare(
          'UPDATE documents SET title = ?, content = ?, content_hash = ?, created_at = ? WHERE id = ?',
        ).run(title, content, contentHash, Date.now(), documentId);

        db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
      } else {
        db.prepare(
          'INSERT INTO documents (id, slug, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(documentId, slug, title, content, contentHash, Date.now());
      }

      const insertChunk = db.prepare(`
        INSERT INTO chunks
          (id, document_id, chunk_index, chunk_level, heading, content, embedding, embedding_model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      chunks.forEach((chunk, index) => {
        const vector = vectors[index];
        const blob = vector
          ? Buffer.from(new Float32Array(vector).buffer)
          : null;
        insertChunk.run(
          chunk.id,
          documentId,
          index,
          chunk.level,
          chunk.heading,
          chunk.content,
          blob,
          EMBEDDING_MODEL,
          Date.now(),
        );
      });
    });

    upsert();
    console.log(`${slug}: ${chunks.length} chunks embedded`);
  }
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : fallback;
}
