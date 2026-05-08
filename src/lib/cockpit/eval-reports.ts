import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunReport } from '@/lib/evals/domain';
import type { LeaseGradingReport } from '@/lib/evals/lease-grading-runner';
import type { EvalHealthSnapshot, LeaseGradingSnapshot } from './types';

const TIER1_REPORT_FILE_RE = /^golden-.*\.json$/;
const TIER2_REPORT_FILE_RE = /^lease-grading-.*\.json$/;

/**
 * Reads the most recent golden-*.json under data/eval-reports/ and projects
 * it to the cockpit's EvalHealthSnapshot shape. Returns null if the directory
 * is missing or empty.
 *
 * Uses process.cwd() (the global) directly — NOT a destructured import — so
 * tests can override via vi.spyOn(process, 'cwd'). See sprint-QA M1.
 *
 * Spec §4.6.
 */
export function getLatestEvalReport(): EvalHealthSnapshot | null {
  const dir = join(process.cwd(), 'data', 'eval-reports');
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const reports = files
    .filter((f) => TIER1_REPORT_FILE_RE.test(f))
    .sort()
    .reverse();
  if (reports.length === 0) return null;

  const latest = reports[0];
  const reportPath = join(dir, latest);
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as EvalRunReport;

  return {
    passedCount: report.caseResults.filter((r) => r.passed).length,
    totalCases: report.caseResults.length,
    totalScore: report.overallScorecard.totalScore,
    maxScore: report.overallScorecard.maxScore,
    lastRunAt: report.completedAt,
    reportPath,
  };
}

/**
 * Sprint 14 / Phase 12 — Tier 2 reader. Reads the most recent
 * lease-grading-*.json under data/eval-reports/ and projects it to
 * the cockpit's LeaseGradingSnapshot shape. Same null-on-missing-dir
 * contract as Tier 1 so a fresh clone (no Tier 2 run yet) renders
 * the empty-state branch.
 */
export function getLatestLeaseGradingReport(): LeaseGradingSnapshot | null {
  const dir = join(process.cwd(), 'data', 'eval-reports');
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const reports = files
    .filter((f) => TIER2_REPORT_FILE_RE.test(f))
    .sort()
    .reverse();
  if (reports.length === 0) return null;

  const latest = reports[0];
  const reportPath = join(dir, latest);
  const report = JSON.parse(
    readFileSync(reportPath, 'utf-8'),
  ) as LeaseGradingReport;

  return {
    totalCases: report.scorecard.totalCases,
    precision: report.scorecard.precision,
    recall: report.scorecard.recall,
    f1: report.scorecard.f1,
    groundedness: report.scorecard.groundedness,
    exactMatch: report.scorecard.exactMatch,
    statuteHitRate: report.scorecard.statuteHitRate,
    latencyP50Ms: report.scorecard.latencyP50Ms,
    latencyP95Ms: report.scorecard.latencyP95Ms,
    lastRunAt: report.completedAt,
    reportPath,
  };
}
