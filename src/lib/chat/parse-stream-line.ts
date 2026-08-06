import type { BudgetEvent, QuotaEvent } from '@/lib/tools/domain';
import { narrowToolEnvelope } from './parse-tool-content';

export type StreamLineMessage =
  | { conversationId: string }
  | { chunk: string }
  | { error: string }
  // Sprint D.12b (#12) — quota widened to carry the window limit (meter
  // fraction); shared type with the route emitter via tools/domain.ts so the
  // wire contract can't silently drift between the two sides.
  | QuotaEvent
  // Sprint D.12b (#12) — typed at-limit event ('daily' spend ceiling or the
  // visitor's own 'rate' window), replacing the demo-copy {chunk} text.
  | BudgetEvent
  | { tool_use: { id: string; name: string; input: Record<string, unknown> } }
  | {
      tool_result: {
        id: string;
        name: string;
        result: unknown;
        error?: string;
        audit_id?: string;
        compensating_available?: boolean;
      };
    }
  // Sprint 18 — Anthropic returned stop_reason: "max_tokens" on the
  // final streamed message. The model's output is partial; the client
  // should render a "response was cut short" notice under the message.
  | { truncated: true; reason: 'max_tokens' };

export function parseStreamLine(line: string): StreamLineMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'conversationId' in parsed &&
      typeof parsed.conversationId === 'string'
    ) {
      return { conversationId: parsed.conversationId };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'chunk' in parsed &&
      typeof parsed.chunk === 'string'
    ) {
      return { chunk: parsed.chunk };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return { error: parsed.error };
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'quota' in parsed &&
      typeof (parsed as { quota?: unknown }).quota === 'object' &&
      (parsed as { quota?: unknown }).quota !== null
    ) {
      return {
        quota: (parsed as { quota: { remaining: number; limit?: number } })
          .quota,
      };
    }

    // Sprint D.12b (#12) — typed budget (at-limit) event. Scope is validated
    // strictly: an unknown scope is NOT a budget event (fail closed on the
    // contract rather than render a bogus paused state).
    if (typeof parsed === 'object' && parsed !== null && 'budget' in parsed) {
      const budget = (parsed as { budget?: unknown }).budget;
      if (
        typeof budget === 'object' &&
        budget !== null &&
        'scope' in budget &&
        ((budget as { scope?: unknown }).scope === 'daily' ||
          (budget as { scope?: unknown }).scope === 'rate')
      ) {
        return {
          budget: budget as {
            scope: 'daily' | 'rate';
            retryAfterSeconds?: number;
            requestId?: string;
          },
        };
      }
      return null;
    }

    // Tool envelopes (tool_use / tool_result) — shared with the SSR
    // rehydration path via narrowToolEnvelope. Sprint 25.1 (R5).
    const tool = narrowToolEnvelope(parsed);
    if (tool && 'tool_use' in tool) {
      return { tool_use: tool.tool_use };
    }
    if (tool && 'tool_result' in tool) {
      // The live stream contract requires `name` on tool_result; the
      // shared envelope keeps it optional to match legacy persisted
      // rows. Guard the narrower contract here.
      const { name } = tool.tool_result;
      if (typeof name !== 'string') return null;
      return { tool_result: { ...tool.tool_result, name } };
    }

    // Truncation event (Sprint 18)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'truncated' in parsed &&
      (parsed as { truncated?: unknown }).truncated === true
    ) {
      const reason = (parsed as { reason?: unknown }).reason;
      if (reason === 'max_tokens') {
        return { truncated: true, reason: 'max_tokens' };
      }
    }

    return null;
  } catch {
    return null;
  }
}
