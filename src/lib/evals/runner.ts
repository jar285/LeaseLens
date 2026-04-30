// Adapted from docs/_references/ai_mcp_chat_ordo/src/lib/evals/runner.ts
// Simplified: iterate golden cases → retrieve → score → aggregate.
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { retrieve } from '@/lib/rag/retrieve';
import type {
  EvalCaseResult,
  EvalRunReport,
  EvalScorecard,
  EvalScoreDimension,
  GoldenCase,
} from './domain';
import { GOLDEN_SET } from './golden-set';
import { scoreGoldenCase } from './scoring';

function aggregateScorecard(caseResults: EvalCaseResult[]): EvalScorecard {
  const dimensions: EvalScoreDimension[] = caseResults.flatMap(
    (r) => r.scorecard.dimensions,
  );
  const totalScore = caseResults.reduce(
    (sum, r) => sum + r.scorecard.totalScore,
    0,
  );
  const maxScore = caseResults.reduce(
    (sum, r) => sum + r.scorecard.maxScore,
    0,
  );
  return {
    dimensions,
    totalScore,
    maxScore,
    passed: caseResults.every((r) => r.passed),
  };
}

export async function runGoldenEval(
  db: Database.Database,
  goldenSet: GoldenCase[] = GOLDEN_SET,
): Promise<EvalRunReport> {
  const startedAt = new Date().toISOString();
  const caseResults: EvalCaseResult[] = [];

  for (const goldenCase of goldenSet) {
    const chunks = await retrieve(goldenCase.query, db, {
      maxResults: goldenCase.k,
    });
    const scorecard = scoreGoldenCase(goldenCase, chunks);
    caseResults.push({
      caseId: goldenCase.id,
      query: goldenCase.query,
      retrievedChunkIds: chunks.map((c) => c.chunkId),
      scorecard,
      passed: scorecard.passed,
    });
  }

  const completedAt = new Date().toISOString();
  const overallScorecard = aggregateScorecard(caseResults);
  const passedCount = caseResults.filter((r) => r.passed).length;
  const summary = `Golden eval: ${passedCount}/${caseResults.length} passed (${overallScorecard.totalScore.toFixed(1)}/${overallScorecard.maxScore.toFixed(1)} points)`;

  return {
    runId: randomUUID(),
    startedAt,
    completedAt,
    caseResults,
    overallScorecard,
    passed: overallScorecard.passed,
    summary,
  };
}
