/**
 * Shared embedder mock for RAG / eval tests.
 *
 * Used in two ways:
 * 1. As a vi.mock factory for the @/lib/rag/embed module — see usage at
 *    the top of each consumer test (vi.mock is hoisted, so the factory
 *    is consumed via async dynamic import).
 * 2. As a direct Buffer producer for tests that seed `chunks.embedding`
 *    columns — see seedChunk in @/lib/test/seed.
 *
 * Implementation matches the pre-Sprint-8 locally-defined mocks in
 * src/lib/rag/retrieve.test.ts, src/lib/rag/ingest.test.ts, and
 * src/lib/evals/runner.test.ts byte-for-byte. Characterization-diff
 * (Sprint 8 Task 3) verifies preservation.
 */

/**
 * Returns the module shape used by vi.mock('./embed' | '@/lib/rag/embed').
 * embedBatch returns number[][] (matches embed.ts's actual signature).
 */
export function buildEmbedderMock() {
  return {
    embedBatch: async (texts: string[]): Promise<number[][]> =>
      texts.map((text) => {
        const vec = Array.from({ length: 384 }, (_, i) => {
          return ((text.charCodeAt(i % text.length) + i) % 100) / 100;
        });
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        return norm === 0 ? vec : vec.map((v) => v / norm);
      }),
  };
}

/**
 * Returns a Buffer suitable for the `chunks.embedding` BLOB column.
 * Same numeric output as buildEmbedderMock's per-text vector, but wrapped
 * as a Float32Array buffer for SQLite storage.
 */
export function mockEmbedding(text: string): Buffer {
  const vec = Array.from({ length: 384 }, (_, i) => {
    return ((text.charCodeAt(i % text.length) + i) % 100) / 100;
  });
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  const normalized = norm === 0 ? vec : vec.map((v) => v / norm);
  return Buffer.from(new Float32Array(normalized).buffer);
}
