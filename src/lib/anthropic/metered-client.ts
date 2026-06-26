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
// Scope note: #5a only METERS (records actual usage). The reserve-before-spend
// budget LEDGER (pre-flight estimate, fail-closed when exhausted, per-tier
// cache pricing) is #5b in Phase C, which reuses this gateway.

import { recordSpend } from '@/lib/db/spend';
import type { AnthropicLike } from '@/lib/tools/lease-tools';

// The usage block on an Anthropic message response. Tool stubs return only
// `{ content }`, so every field is optional and read defensively.
export interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface MeteredUsage {
  // Total input tokens = base input + cache-creation + cache-read. We sum all
  // three because the current pricing model (spend.ts) prices input at one
  // rate; counting cache tokens at the base rate over-estimates slightly,
  // which is the SAFE direction for a spend ceiling. #5b refines this into
  // per-tier cache pricing.
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
