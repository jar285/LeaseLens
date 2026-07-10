// Sprint A.5a (#5a) — metered Anthropic gateway.
//
// grade_clause_severity and draft_negotiation_email each make their OWN
// Anthropic call inside the tool path; those calls were invisible to spend
// tracking (the chat route only summed its main-loop response usage), so a
// turn that fanned out to N grade calls under-counted its real spend. This
// wrapper routes those tool calls through ONE metered gateway that records
// every call's usage — GoF Facade: a single metered choke point. It's wired in
// at createToolRegistry, so every tool-issued Anthropic call is captured.
//
// Scope note: #5a METERS (records actual usage). Sprint B.5b (#18) adds the
// reserve-before-spend budget LEDGER — see `budgetedAnthropicClient` below,
// which supersedes the plain metering sink on the tool path (it reserves before
// the call and records via the ledger's commit).

import { commit, release, reserve } from '@/lib/db/budget-ledger';
import { recordSpend } from '@/lib/db/spend';
import type { AnthropicLike } from '@/lib/tools/lease-tools';

// The usage block on an Anthropic message response. Tool stubs return only
// `{ content }`, so every field is optional and read defensively.
// Fields are `number | null | undefined` to match the SDK's `Usage` (cache
// fields are nullable) as well as tool stubs that omit usage entirely;
// normalizeUsage coalesces every field with `?? 0`.
export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface MeteredUsage {
  // Total input tokens = base input + cache-creation + cache-read. We sum all
  // three because the pricing model (spend.ts) prices input at one rate;
  // counting cache tokens at the base rate over-estimates slightly, the SAFE
  // direction for a spend ceiling. (Per-tier cache pricing is intentionally out
  // of scope — spend.ts is the frozen single pricing source; base-rate folding
  // is the accepted conservative over-estimate.)
  input: number;
  output: number;
}

export function normalizeUsage(
  usage: AnthropicUsageLike | null | undefined,
): MeteredUsage {
  if (!usage) return { input: 0, output: 0 };
  return {
    input:
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    output: usage.output_tokens ?? 0,
  };
}

export type SpendSink = (usage: MeteredUsage) => void;

// Default sink: record to the daily spend_log (the single pricing source of
// truth). Skip zero-usage calls (e.g. test stubs with no usage block) so we
// never write empty rows.
const recordSpendSink: SpendSink = (usage) => {
  if (usage.input > 0 || usage.output > 0) {
    recordSpend(usage.input, usage.output);
  }
};

/**
 * Wrap a base Anthropic-like client so every `messages.create()` call's usage
 * is recorded via `sink` (default: recordSpend). Returns the raw response
 * unchanged so callers — the lease tools — are drop-in. `sink` is injectable
 * for unit tests (and for #5b's ledger).
 */
export function meterAnthropicClient(
  base: AnthropicLike,
  sink: SpendSink = recordSpendSink,
): AnthropicLike {
  return {
    messages: {
      create: async (args) => {
        const response = await base.messages.create(args);
        sink(
          normalizeUsage((response as { usage?: AnthropicUsageLike }).usage),
        );
        return response;
      },
    },
  };
}

/**
 * Estimate input tokens from a request payload (system + messages + tools).
 * Cheap heuristic (~4 chars/token) — a reservation only needs a rough upper
 * bound; commit() records the ACTUAL after the call, so an under-estimate only
 * causes a bounded single-call overshoot. Avoids a countTokens round-trip.
 */
export function estimateInputTokens(...parts: unknown[]): number {
  let chars = 0;
  for (const part of parts) {
    if (part == null) continue;
    chars +=
      typeof part === 'string' ? part.length : JSON.stringify(part).length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Sprint B.5b (#18) — budget-enforcing gateway. Wraps `messages.create` to
 * reserve estimated max cost BEFORE the call (fail closed via the ledger when
 * the daily budget is exhausted), commit the ACTUAL usage AFTER (which records
 * to spend_log — so this REPLACES the recordSpend sink; do NOT also wrap with
 * meterAnthropicClient or spend double-records), and release in `finally`
 * (leak-proof against a client abort mid-await or a throwing commit — release is
 * an idempotent no-op on an already-committed reservation).
 */
export function budgetedAnthropicClient(
  base: AnthropicLike,
  opts: { sessionId?: string | null } = {},
): AnthropicLike {
  return {
    messages: {
      create: async (args) => {
        const a = (args ?? {}) as {
          system?: unknown;
          messages?: unknown;
          tools?: unknown;
          max_tokens?: unknown;
        };
        const reservationId = reserve({
          sessionId: opts.sessionId ?? null,
          estIn: estimateInputTokens(a.system, a.messages, a.tools),
          maxOut: typeof a.max_tokens === 'number' ? a.max_tokens : 1024,
        });
        try {
          const response = await base.messages.create(args);
          const usage = normalizeUsage(
            (response as { usage?: AnthropicUsageLike }).usage,
          );
          commit(reservationId, usage.input, usage.output);
          return response;
        } finally {
          release(reservationId);
        }
      },
    },
  };
}
