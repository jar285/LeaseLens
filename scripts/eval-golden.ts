import { db } from '@/lib/db';
import { GOLDEN_SET } from '@/lib/evals/golden-set';
import { buildEvalSummary, writeEvalReport } from '@/lib/evals/reporter';
import { runGoldenEval } from '@/lib/evals/runner';

async function main() {
  console.log(`Running golden eval (${GOLDEN_SET.length} cases)...`);
  const report = await runGoldenEval(db);
  writeEvalReport(report);
  console.log(buildEvalSummary(report));
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Golden eval failed:', err);
  process.exit(1);
});
