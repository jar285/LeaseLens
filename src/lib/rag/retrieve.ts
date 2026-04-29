// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/search/HybridSearchEngine.ts
// Simplified: single function (no class), inline RRF + dotSimilarity, no deduplication or highlighting.
import type Database from 'better-sqlite3';
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
  vectorTopN?: number;
  bm25TopN?: number;
  rrfK?: number;
  maxResults?: number;
}

interface ChunkRecord {
  id: string;
  heading: string | null;
  content: string;
  embedding: Buffer;
  document_slug: string;
}

const CHUNK_QUERY = `
  SELECT c.id, c.heading, c.content, c.embedding, d.slug AS document_slug
  FROM chunks c
  JOIN documents d ON d.id = c.document_id
  WHERE c.chunk_level IN ('section', 'passage')
`;

function bufferToFloat32(buf: Buffer): Float32Array {
  const copy = Buffer.alloc(buf.length);
  buf.copy(copy);
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
  db: Database.Database,
  opts?: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const vectorTopN = opts?.vectorTopN ?? 20;
  const bm25TopN = opts?.bm25TopN ?? 20;
  const rrfK = opts?.rrfK ?? 60;
  const maxResults = opts?.maxResults ?? 5;

  const rows = db.prepare(CHUNK_QUERY).all() as ChunkRecord[];
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
