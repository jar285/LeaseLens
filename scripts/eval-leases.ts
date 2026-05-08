// Sprint 14 / Phase 11 — Tier 2 lease-grading eval CLI.
//
// Runs the 12 LeaseGradingCase rows against a real Anthropic client
// (the chat path's grading prompt + validateGrading). Writes a
// timestamped JSON report to data/eval-reports/lease-grading-*.json
// and prints a one-line summary. Exits with status 1 if recall <
// the spec §3i Tier 2 threshold (0.75).
//
// Each run consumes Anthropic budget — `LEASELENS_DAILY_SPEND_CEILING_USD`
// (default $2) caps cost. Run sparingly. CI's tier2 job is
// `workflow_dispatch` only (operator-triggered) for the same reason.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { db } from '@/lib/db';
import { LEASE_GRADING_SET } from '@/lib/evals/lease-cases';
import {
  type LeaseGradingReport,
  runLeaseGradingEval,
} from '@/lib/evals/lease-grading-runner';

const TIER2_RECALL_THRESHOLD = 0.75;
const TIER2_GROUNDEDNESS_THRESHOLD = 0.9;

function writeLeaseGradingReport(report: LeaseGradingReport): string {
  const dir = join(process.cwd(), 'data', 'eval-reports');
  mkdirSync(dir, { recursive: true });
  const filename = `lease-grading-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify({ version: 1, ...report }, null, 2));
  return path;
}

async function main() {
  console.log(
    `Running lease-grading eval (${LEASE_GRADING_SET.length} cases — real Anthropic)...`,
  );
  // Wrap the SDK client behind an AnthropicLike-shaped object so the
  // runner's interface stays narrow.
  const client = getAnthropicClient();
  // The SDK client has multiple `create` overloads; AnthropicLike is
  // a single-overload narrow shape the runner can call. Cast through
  // `unknown` to bridge the two — at runtime the SDK accepts the
  // single-overload call shape we use.
  const anthropic = {
    messages: {
      create: client.messages.create.bind(client.messages) as unknown as (
        args: unknown,
      ) => Promise<{
        content: Array<{ type: string; text?: string }>;
      }>,
    },
  };
  const report = await runLeaseGradingEval(db, { anthropic });
  const path = writeLeaseGradingReport(report);
  console.log(report.summary);
  console.log(`Report: ${path}`);

  const passed =
    report.scorecard.recall >= TIER2_RECALL_THRESHOLD &&
    report.scorecard.groundedness >= TIER2_GROUNDEDNESS_THRESHOLD;
  if (!passed) {
    console.warn(
      `Below threshold: recall ${(report.scorecard.recall * 100).toFixed(0)}% (need ${TIER2_RECALL_THRESHOLD * 100}%) · groundedness ${(report.scorecard.groundedness * 100).toFixed(0)}% (need ${TIER2_GROUNDEDNESS_THRESHOLD * 100}%)`,
    );
  }
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Lease grading eval failed:', err);
  process.exit(1);
});
