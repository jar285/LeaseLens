// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/search/HybridSearchEngine.ts
// Simplified: single function (no class), inline RRF + dotSimilarity, no deduplication or highlighting.
//
// Issue #29 — async: the chunk read awaits the async `Db` driver, and the
// workspace filter binds positionally (the statement interface binds
// positional `?` args). The libSQL driver returns BLOB columns as
// ArrayBuffer (better-sqlite3 returned Buffer), so `bufferToFloat32`
// accepts both shapes while keeping the old Node-side semantics.
import type { Db } from '@/lib/db/client';
import { buildBM25Index, scoreBM25, tokenize } from './bm25';
import { embedBatch } from './embed';

export interface RetrievedChunk {
  chunkId: string;
  documentSlug: string;
  heading: string | null;
  content: string;
  rrfScore: number;
  vectorRank: number | null;
  bm25Rank: number | null;
}

export interface RetrieveOptions {
  /** Sprint 11: required — every retrieval is workspace-scoped. */
  workspaceId: string;
  vectorTopN?: number;
  bm25TopN?: number;
  rrfK?: number;
  maxResults?: number;
}

interface ChunkRecord {
  id: string;
  heading: string | null;
  content: string;
  /** BLOB column: ArrayBuffer from @libsql/client (Buffer with better-sqlite3). */
  embedding: ArrayBuffer | Uint8Array;
  document_slug: string;
}

const CHUNK_QUERY = `
  SELECT c.id, c.heading, c.content, c.embedding, d.slug AS document_slug
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.chunk_level IN ('section', 'passage')
    AND c.workspace_id = ?
`;

function bufferToFloat32(buf: ArrayBuffer | Uint8Array): Float32Array {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Copy onto a 4-byte-aligned buffer before viewing as float32, exactly
  // like the old implementation did after Buffer.copy.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

function dotSimilarity(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function reciprocalRankFusion(
  rankings: Map<string, number>[],
  k: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (const [id, rank] of ranking) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return scores;
}

export async function retrieve(
  query: string,
  db: Db,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const vectorTopN = opts.vectorTopN ?? 20;
  const bm25TopN = opts.bm25TopN ?? 20;
  const rrfK = opts.rrfK ?? 60;
  const maxResults = opts.maxResults ?? 5;

  const rows = await db.prepare(CHUNK_QUERY).all<ChunkRecord>(opts.workspaceId);
  if (rows.length === 0) return [];

  const [rawQuery] = await embedBatch([query]);
  const queryVec = Float32Array.from(rawQuery);

  const rowMap = new Map<string, ChunkRecord>();
  const vectorScored: { id: string; similarity: number }[] = [];

  for (const row of rows) {
    rowMap.set(row.id, row);
    const chunkVec = bufferToFloat32(row.embedding);
    vectorScored.push({
      id: row.id,
      similarity: dotSimilarity(queryVec, chunkVec),
    });
  }

  vectorScored.sort((a, b) => b.similarity - a.similarity);
  const vectorRanking = new Map<string, number>();
  vectorScored.slice(0, vectorTopN).forEach((item, i) => {
    vectorRanking.set(item.id, i + 1);
  });

  const bm25Index = buildBM25Index(
    rows.map((r) => ({ id: r.id, content: r.content })),
  );
  const queryTerms = tokenize(query);

  const bm25Scored: { id: string; score: number }[] = [];
  for (const row of rows) {
    const docTokens = tokenize(row.content);
    const docLength = bm25Index.docLengths.get(row.id) ?? docTokens.length;
    bm25Scored.push({
      id: row.id,
      score: scoreBM25(queryTerms, docTokens, docLength, bm25Index),
    });
  }

  bm25Scored.sort((a, b) => b.score - a.score);
  const bm25Ranking = new Map<string, number>();
  bm25Scored.slice(0, bm25TopN).forEach((item, i) => {
    bm25Ranking.set(item.id, i + 1);
  });

  const rrfScores = reciprocalRankFusion([vectorRanking, bm25Ranking], rrfK);

  return [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxResults)
    .flatMap(([id, rrfScore]) => {
      const row = rowMap.get(id);
      if (!row) return [];
      return [
        {
          chunkId: row.id,
          documentSlug: row.document_slug,
          heading: row.heading,
          content: row.content,
          rrfScore,
          vectorRank: vectorRanking.get(id) ?? null,
          bm25Rank: bm25Ranking.get(id) ?? null,
        },
      ];
    });
}
