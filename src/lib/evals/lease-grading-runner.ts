// Sprint 14 / Phase 11 — Tier 2 lease-grading eval runner.
//
// Iterates LEASE_GRADING_SET. For each case: look up the clause by
// clause_index in the seeded sample lease; invoke `grade_clause_severity`
// directly (not through the chat route — keeps the eval fast and
// hermetic and isolates the metric to grading quality, not chat
// orchestration); score the result against ground-truth labels.
//
// Metrics (per spec §3i Tier 2):
//   - Red-flag PRECISION: of clauses the tool graded as red flag
//     (high|medium), how many match a labeled red flag.
//   - Red-flag RECALL: of labeled red flags, how many surfaced as
//     red flag (high|medium).
//   - GROUNDEDNESS: % of cases where grade_clause_severity completed
//     WITHOUT throwing the validateGrading citation-not-grounded
//     error. The tool already enforces verbatim citation in the
//     cited chunk's content (see lease-tools.ts validateGrading);
//     a thrown error means the citation didn't ground.
//   - LATENCY: per-case wall-clock; report p50 + p95.
//   - COST: total tokens × pricing model. Captured if the AnthropicLike
//     mock returns usage; left as 0 when not provided (mock path).
//
// "Red flag" = severity in {high, medium}. "Not red flag" = {low, ok}.
// This binary reduction makes precision/recall interpretable; severity
// agreement (high vs medium specifically) is reported separately as
// EXACT_MATCH for transparency.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { SAMPLE_LEASE_ID } from '@/db/seed';
import {
  type AnthropicLike,
  createGradeClauseSeverityTool,
} from '@/lib/tools/lease-tools';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import type { LeaseGradingCase } from './lease-cases';
import { LEASE_GRADING_SET } from './lease-cases';

export interface LeaseGradingCaseResult {
  caseId: string;
  clauseIndex: number;
  expectedSeverity: LeaseGradingCase['expectedSeverity'];
  actualSeverity: 'high' | 'medium' | 'low' | 'ok' | 'error';
  expectedRedFlag: boolean;
  actualRedFlag: boolean;
  /** Tool errors (citation not grounded, no chunks retrieved, etc.). */
  errorMessage: string | null;
  /** Substring match check on statute_citation. */
  statuteMatch: boolean;
  expectedStatutePrefix: string;
  actualStatuteCitation: string | null;
  latencyMs: number;
}

export interface LeaseGradingScorecard {
  /** Red-flag precision = TP / (TP + FP). */
  precision: number;
  /** Red-flag recall    = TP / (TP + FN). */
  recall: number;
  f1: number;
  /** % of cases that completed without a tool error. */
  groundedness: number;
  /** % of cases where actualSeverity exactly matched expectedSeverity. */
  exactMatch: number;
  /** % of cases where statute_citation contained expectedStatutePrefix
   *  (skipped when expectedStatutePrefix is empty). */
  statuteHitRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  totalCases: number;
}

export interface LeaseGradingReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  caseResults: LeaseGradingCaseResult[];
  scorecard: LeaseGradingScorecard;
  summary: string;
}

interface ClauseRow {
  id: string;
  clause_index: number;
  text: string;
}

function isRedFlag(sev: string): boolean {
  return sev === 'high' || sev === 'medium';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx];
}

export interface RunLeaseGradingEvalOptions {
  /** Pass a mock for hermetic tests. Defaults to throwing if absent —
   *  the script provides a real Anthropic client. */
  anthropic: AnthropicLike;
  /** Subset to run (e.g. one case in tests). Defaults to LEASE_GRADING_SET. */
  cases?: LeaseGradingCase[];
  /** Workspace scope. Defaults to SAMPLE_WORKSPACE.id (matches the seed). */
  workspaceId?: string;
}

export async function runLeaseGradingEval(
  db: Database.Database,
  opts: RunLeaseGradingEvalOptions,
): Promise<LeaseGradingReport> {
  const cases = opts.cases ?? LEASE_GRADING_SET;
  const workspaceId = opts.workspaceId ?? SAMPLE_WORKSPACE.id;
  const startedAt = new Date().toISOString();

  // The lease-tools' `loadOwnedLeaseFromClauseId` enforces
  // `assertLeaseOwnership` against the eval's user. Tier 2 uses the
  // SAMPLE_LEASE_UPLOADER_ID (set by the seed) as the test actor, so
  // ownership passes without an Editor/Admin override.
  const uploader = db
    .prepare('SELECT uploaded_by FROM leases WHERE id = ? AND workspace_id = ?')
    .get(SAMPLE_LEASE_ID, workspaceId) as { uploaded_by: string } | undefined;
  if (!uploader) {
    throw new Error(
      `lease-grading-runner: sample lease ${SAMPLE_LEASE_ID} not found in workspace ${workspaceId}. Did the seed run?`,
    );
  }

  const tool = createGradeClauseSeverityTool(db, opts.anthropic);
  const results: LeaseGradingCaseResult[] = [];

  for (const c of cases) {
    const clause = db
      .prepare(
        'SELECT id, clause_index, text FROM clauses WHERE lease_id = ? AND workspace_id = ? AND clause_index = ?',
      )
      .get(SAMPLE_LEASE_ID, workspaceId, c.clauseIndex) as
      | ClauseRow
      | undefined;

    if (!clause) {
      results.push({
        caseId: c.id,
        clauseIndex: c.clauseIndex,
        expectedSeverity: c.expectedSeverity,
        actualSeverity: 'error',
        expectedRedFlag: isRedFlag(c.expectedSeverity),
        actualRedFlag: false,
        errorMessage: `clause_index ${c.clauseIndex} not found on sample lease`,
        statuteMatch: false,
        expectedStatutePrefix: c.expectedStatutePrefix,
        actualStatuteCitation: null,
        latencyMs: 0,
      });
      continue;
    }

    const t0 = performance.now();
    let actualSeverity: LeaseGradingCaseResult['actualSeverity'] = 'error';
    let actualStatuteCitation: string | null = null;
    let errorMessage: string | null = null;

    try {
      const out = (await tool.execute(
        { clause_id: clause.id },
        {
          role: 'Creator',
          userId: uploader.uploaded_by,
          conversationId: 'eval-tier2',
          workspaceId,
        },
      )) as {
        severity: 'high' | 'medium' | 'low' | 'ok';
        statute_citation: string;
      };
      actualSeverity = out.severity;
      actualStatuteCitation = out.statute_citation;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const latencyMs = performance.now() - t0;
    const expectedRedFlag = isRedFlag(c.expectedSeverity);
    const actualRedFlag =
      actualSeverity !== 'error' && isRedFlag(actualSeverity);

    const statuteMatch =
      c.expectedStatutePrefix === ''
        ? true // no expectation → trivially satisfied (but not counted in hit rate)
        : (actualStatuteCitation
            ?.toLowerCase()
            .includes(c.expectedStatutePrefix.toLowerCase()) ?? false);

    results.push({
      caseId: c.id,
      clauseIndex: c.clauseIndex,
      expectedSeverity: c.expectedSeverity,
      actualSeverity,
      expectedRedFlag,
      actualRedFlag,
      errorMessage,
      statuteMatch,
      expectedStatutePrefix: c.expectedStatutePrefix,
      actualStatuteCitation,
      latencyMs,
    });
  }

  // Aggregate scorecard.
  const truePositives = results.filter(
    (r) => r.expectedRedFlag && r.actualRedFlag,
  ).length;
  const falsePositives = results.filter(
    (r) => !r.expectedRedFlag && r.actualRedFlag,
  ).length;
  const falseNegatives = results.filter(
    (r) => r.expectedRedFlag && !r.actualRedFlag,
  ).length;

  const precision =
    truePositives + falsePositives === 0
      ? 1
      : truePositives / (truePositives + falsePositives);
  const recall =
    truePositives + falseNegatives === 0
      ? 1
      : truePositives / (truePositives + falseNegatives);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  const groundedness =
    results.filter((r) => r.errorMessage === null).length / results.length;
  const exactMatch =
    results.filter((r) => r.actualSeverity === r.expectedSeverity).length /
    results.length;

  const casesWithStatuteExpectation = results.filter(
    (r) => r.expectedStatutePrefix !== '',
  );
  const statuteHitRate =
    casesWithStatuteExpectation.length === 0
      ? 1
      : casesWithStatuteExpectation.filter((r) => r.statuteMatch).length /
        casesWithStatuteExpectation.length;

  const latencies = results
    .map((r) => r.latencyMs)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const scorecard: LeaseGradingScorecard = {
    precision,
    recall,
    f1,
    groundedness,
    exactMatch,
    statuteHitRate,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    totalCases: results.length,
  };

  const summary = `Lease grading eval: P=${(precision * 100).toFixed(0)}% R=${(
    recall * 100
  ).toFixed(0)}% F1=${(f1 * 100).toFixed(0)}% groundedness=${(
    groundedness * 100
  ).toFixed(0)}% exact=${(exactMatch * 100).toFixed(0)}% statute=${(
    statuteHitRate * 100
  ).toFixed(0)}% (${results.length} cases)`;

  return {
    runId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    caseResults: results,
    scorecard,
    summary,
  };
}
