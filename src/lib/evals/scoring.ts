// Adapted from docs/_references/ai_mcp_chat_ordo/src/lib/evals/scoring.ts
// Replaced funnel/routing/tool dimensions with retrieval-specific metrics.

import type { RetrievedChunk } from '@/lib/rag/retrieve';
import type { EvalScorecard, EvalScoreDimension, GoldenCase } from './domain';

const THRESHOLDS: Record<string, number> = {
  precision_at_k: 0.4,
  recall_at_k: 1.0,
  mrr: 0.5,
  groundedness: 0.8,
};

export function precisionAtK(
  retrieved: string[],
  expected: string[],
  k: number,
): number {
  if (k === 0) return 0;
  const topK = retrieved.slice(0, k);
  const expectedSet = new Set(expected);
  const hits = topK.filter((id) => expectedSet.has(id)).length;
  return hits / k;
}

export function recallAtK(retrieved: string[], expected: string[]): number {
  if (expected.length === 0) return 1.0;
  const retrievedSet = new Set(retrieved);
  const hits = expected.filter((id) => retrievedSet.has(id)).length;
  return hits / expected.length;
}

export function meanReciprocalRank(
  retrieved: string[],
  expected: string[],
): number {
  const expectedSet = new Set(expected);
  const index = retrieved.findIndex((id) => expectedSet.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function groundednessScore(
  retrievedContent: string[],
  expectedKeywords: string[],
): number {
  if (expectedKeywords.length === 0) return 1.0;
  const combined = retrievedContent.join(' ').toLowerCase();
  const hits = expectedKeywords.filter((kw) =>
    combined.includes(kw.toLowerCase()),
  ).length;
  return hits / expectedKeywords.length;
}

function buildDimension(
  id: string,
  label: string,
  score: number,
  maxScore: number,
  threshold: number,
): EvalScoreDimension {
  return {
    id,
    label,
    score,
    maxScore,
    passed: score >= threshold,
    details:
      score >= threshold
        ? null
        : `${label}: ${score.toFixed(3)} < ${threshold}`,
  };
}

function createScorecard(dimensions: EvalScoreDimension[]): EvalScorecard {
  const totalScore = dimensions.reduce((sum, d) => sum + d.score, 0);
  const maxScore = dimensions.reduce((sum, d) => sum + d.maxScore, 0);
  return {
    dimensions,
    totalScore,
    maxScore,
    passed: dimensions.every((d) => d.passed),
  };
}

export function scoreGoldenCase(
  goldenCase: GoldenCase,
  retrievedChunks: RetrievedChunk[],
): EvalScorecard {
  const retrieved = retrievedChunks.map((c) => c.chunkId);
  const retrievedContent = retrievedChunks.map((c) => c.content);

  const precision = precisionAtK(
    retrieved,
    goldenCase.expectedChunkIds,
    goldenCase.k,
  );
  const recall = recallAtK(retrieved, goldenCase.expectedChunkIds);
  const mrr = meanReciprocalRank(retrieved, goldenCase.expectedChunkIds);
  const grounded = groundednessScore(
    retrievedContent,
    goldenCase.expectedKeywords,
  );

  return createScorecard([
    buildDimension(
      'precision_at_k',
      'Precision@K',
      precision,
      1.0,
      THRESHOLDS.precision_at_k ?? 0,
    ),
    buildDimension(
      'recall_at_k',
      'Recall@K',
      recall,
      1.0,
      THRESHOLDS.recall_at_k ?? 0,
    ),
    buildDimension(
      'mrr',
      'Mean Reciprocal Rank',
      mrr,
      1.0,
      THRESHOLDS.mrr ?? 0,
    ),
    buildDimension(
      'groundedness',
      'Groundedness',
      grounded,
      1.0,
      THRESHOLDS.groundedness ?? 0,
    ),
  ]);
}
