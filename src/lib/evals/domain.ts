// Adapted from docs/_references/ai_mcp_chat_ordo/src/lib/evals/domain.ts
// Simplified for ContentOps: no cohorts, no tool behaviors, no observation tracking.

export interface GoldenCase {
  id: string;
  query: string;
  expectedChunkIds: string[];
  expectedKeywords: string[];
  k: number;
}

export interface EvalScoreDimension {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  passed: boolean;
  details: string | null;
}

export interface EvalScorecard {
  dimensions: EvalScoreDimension[];
  totalScore: number;
  maxScore: number;
  passed: boolean;
}

export interface EvalCaseResult {
  caseId: string;
  query: string;
  retrievedChunkIds: string[];
  scorecard: EvalScorecard;
  passed: boolean;
}

export interface EvalRunReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  caseResults: EvalCaseResult[];
  overallScorecard: EvalScorecard;
  passed: boolean;
  summary: string;
}
