// Sprint B.5b (#18) — hard budget ledger. Turns post-hoc spend TRACKING into a
// reserve-before / commit-after LEDGER so concurrent turns + tool loops can't
// blow past the daily ceiling before recordSpend catches up.
//
// reserve() reads today's committed spend (spend_log) + outstanding reservations
// in ONE transaction and fails closed BEFORE the Anthropic call — closing the
// check-then-spend TOCTOU (two requests could both pass the old pre-flight while
// awaiting the provider).
//
// Issue #29 — the driver is now async (remote-capable). The transaction still
// serializes on a local `file:` database (single embedded connection), so two
// reserves can't interleave there. On hosted Turso the write transaction holds
// a server-side lock; concurrent reserves from scaled-out instances serialize
// or fail with a busy error rather than silently double-spending — the
// fail-closed direction. A busy-retry helper is a possible follow-up, not part
// of this migration.
//
// commit() records the ACTUAL usage to spend_log (the pricing source of truth).
// release() frees a reservation.
//
// Always-track vs fail-closed split (Sprint 24 de-conflation): recording is
// UNCONDITIONAL — reserve always inserts a row and commit always records, so a
// plain local-dev deploy (no guardrails) keeps populating the cockpit. Only the
// `throw BudgetExhaustedError` is gated on guardrailsEnforced(). (Google SRE:
// cost budgets are operational contracts; fail closed at the trust boundary.)

import { randomUUID } from 'node:crypto';
import { guardrailsEnforced } from '@/lib/auth/mode';
import { db } from '@/lib/db';
import type { DbTransaction } from '@/lib/db/client';
import { estimateCost, recordSpend } from '@/lib/db/spend';
import { env } from '@/lib/env';

/**
 * Raised by reserve() when the estimated cost would push committed + reserved
 * spend past the daily ceiling AND guardrails are enforced. PII-safe message.
 */
export class BudgetExhaustedError extends Error {
  readonly limitingKey: string;

  constructor(limitingKey = 'global:daily') {
    super(`Budget exhausted for ${limitingKey}`);
    this.limitingKey = limitingKey;
    this.name = 'BudgetExhaustedError';
  }
}

export interface ReserveInput {
  /** Attribution only (per-session caps are #4); NULL on the tool path. */
  sessionId?: string | null;
  /** Estimated input tokens for the call (a heuristic upper bound). */
  estIn: number;
  /** The call's max_tokens — a true upper bound on output. */
  maxOut: number;
}

// A reserved row older than this is assumed orphaned (crashed request between
// reserve and commit/release) and swept, so it can't poison the day's budget.
// The provider timeout + a margin bounds any legitimately in-flight call.
function staleCutoffSeconds(): number {
  return Math.ceil(env.LEASELENS_ANTHROPIC_TIMEOUT_MS / 1000) + 60;
}

/** Committed cost for today, read from the spend_log source of truth. */
async function committedCostToday(tx: DbTransaction): Promise<number> {
  const row = await tx
    .prepare(
      "SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
    )
    .get<{ tokens_in: number; tokens_out: number }>();
  return row ? estimateCost(row.tokens_in, row.tokens_out) : 0;
}

/**
 * Reserve estimated max cost for one Anthropic call. Atomic read-then-write:
 * sweeps stale reservations, sums committed + live reserved cost, and either
 * INSERTs a 'reserved' row (returning its id) or — only under guardrails —
 * throws BudgetExhaustedError. The row is ALWAYS inserted when not throwing, so
 * spend tracking works in every mode.
 */
export async function reserve(input: ReserveInput): Promise<string> {
  const id = randomUUID();
  const estCost = estimateCost(input.estIn, input.maxOut);
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - staleCutoffSeconds();

  return db.transaction(async (tx) => {
    // Sweep orphaned reservations first so they leave the reserved-sum.
    await tx
      .prepare(
        `UPDATE provider_call SET status = 'released'
       WHERE status = 'reserved' AND created_at <= ?`,
      )
      .run(cutoff);

    const { reserved } = (await tx
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost), 0) AS reserved
         FROM provider_call
         WHERE date = date('now') AND status = 'reserved'`,
      )
      .get<{ reserved: number }>()) ?? { reserved: 0 };

    if (
      guardrailsEnforced() &&
      (await committedCostToday(tx)) + reserved + estCost >
        env.LEASELENS_DAILY_SPEND_CEILING_USD
    ) {
      throw new BudgetExhaustedError('global:daily');
    }

    await tx
      .prepare(
        `INSERT INTO provider_call
         (id, status, session_id, estimated_in, estimated_out, estimated_cost, date, created_at)
       VALUES (?, 'reserved', ?, ?, ?, ?, date('now'), ?)`,
      )
      .run(
        id,
        input.sessionId ?? null,
        input.estIn,
        input.maxOut,
        estCost,
        now,
      );

    return id;
  });
}

/**
 * Commit the ACTUAL usage of a completed call: mark the reservation committed
 * and record the real tokens to spend_log (unconditional — keeps the cockpit +
 * isSpendCeilingExceeded accurate, incl. cache + nested-tool tokens). No status
 * guard, so a swept-then-succeeded call still records its actuals.
 */
export async function commit(
  reservationId: string,
  actualIn: number,
  actualOut: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.transaction(async (tx) => {
    await tx
      .prepare(
        `UPDATE provider_call
       SET status = 'committed', actual_in = ?, actual_out = ?, committed_at = ?
       WHERE id = ?`,
      )
      .run(actualIn, actualOut, now, reservationId);
    await recordSpend(actualIn, actualOut, tx);
  });
}

/**
 * Release a reservation (error / abort / after-commit cleanup). Idempotent
 * no-op on an already-committed or already-released row — the WHERE guard makes
 * `reserve(); try { call; commit } finally { release }` safe.
 */
export async function release(reservationId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE provider_call SET status = 'released'
     WHERE id = ? AND status = 'reserved'`,
    )
    .run(reservationId);
}
