// Adapted from docs/_references/ai_mcp_chat_ordo/src/lib/evals/reporting.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunReport } from './domain';

export function buildEvalSummary(report: EvalRunReport): string {
  const passedCount = report.caseResults.filter((r) => r.passed).length;
  const total = report.caseResults.length;
  const score = report.overallScorecard.totalScore.toFixed(1);
  const max = report.overallScorecard.maxScore.toFixed(1);
  return `Golden eval: ${passedCount}/${total} passed (${score}/${max} points)`;
}

export function serializeEvalReport(report: EvalRunReport): string {
  return JSON.stringify({ version: 1, ...report }, null, 2);
}

export function writeEvalReport(report: EvalRunReport): void {
  const dir = join(process.cwd(), 'data', 'eval-reports');
  mkdirSync(dir, { recursive: true });
  const filename = `golden-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(join(dir, filename), serializeEvalReport(report));
}
