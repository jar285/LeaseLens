import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunReport } from '@/lib/evals/domain';
import type { EvalHealthSnapshot } from './types';

const REPORT_FILE_RE = /^golden-.*\.json$/;

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
    .filter((f) => REPORT_FILE_RE.test(f))
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
