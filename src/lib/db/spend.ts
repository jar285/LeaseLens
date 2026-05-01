import { db } from '@/lib/db';
import { env } from '@/lib/env';

// Pricing source: https://www.anthropic.com/pricing
// Demo display only — verify against current pricing before any production claim.
// Reused by isSpendCeilingExceeded (chat route guard) and the Sprint 9 cockpit
// SpendPanel via estimateCost. Single source of truth — do not duplicate.
const HAIKU_INPUT_COST_PER_MTOK = 0.8;
const HAIKU_OUTPUT_COST_PER_MTOK = 4.0;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn * HAIKU_INPUT_COST_PER_MTOK +
      tokensOut * HAIKU_OUTPUT_COST_PER_MTOK) /
    1_000_000
  );
}

export function isSpendCeilingExceeded(): boolean {
  const row = db
    .prepare(
      "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
    )
    .get() as { tokens_in: number; tokens_out: number } | undefined;

  if (!row) return false;

  return (
    estimateCost(row.tokens_in, row.tokens_out) >=
    env.CONTENTOPS_DAILY_SPEND_CEILING_USD
  );
}

export function recordSpend(tokensIn: number, tokensOut: number): void {
  db.prepare(
    `INSERT INTO spend_log (date, tokens_in, tokens_out)
     VALUES (date('now'), ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       tokens_in  = spend_log.tokens_in  + excluded.tokens_in,
       tokens_out = spend_log.tokens_out + excluded.tokens_out`,
  ).run(tokensIn, tokensOut);
}
