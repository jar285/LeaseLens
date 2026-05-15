// Sprint 25.1 (R5) — single source of truth for the tool_use / tool_result
// JSON envelopes that flow both through the live NDJSON stream
// (parse-stream-line.ts) and through the persisted `messages.content`
// column (rehydrate-history.ts). The two paths used to carry near-
// identical type-guard ladders — this consolidates them so a future
// envelope-shape change touches one file instead of three.
//
// `name` on tool_result is optional at the type level because legacy
// persisted rows may omit it; live-stream consumers should narrow
// further if they require it.

export type ToolUseEnvelope = {
  tool_use: { id: string; name: string; input: Record<string, unknown> };
};

export type ToolResultEnvelope = {
  tool_result: {
    id: string;
    name?: string;
    result: unknown;
    error?: string;
    audit_id?: string;
    compensating_available?: boolean;
  };
};

export type ToolEnvelope = ToolUseEnvelope | ToolResultEnvelope;

/** Parse a raw JSON string; null if malformed or wrong shape. */
export function parseToolContent(content: string): ToolEnvelope | null {
  try {
    return narrowToolEnvelope(JSON.parse(content));
  } catch {
    return null;
  }
}

/**
 * Same logic against an already-parsed value. Used by parse-stream-line.ts
 * after its own JSON.parse, so we don't double-parse on the hot path.
 */
export function narrowToolEnvelope(parsed: unknown): ToolEnvelope | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (
    'tool_use' in parsed &&
    typeof (parsed as { tool_use?: unknown }).tool_use === 'object' &&
    (parsed as { tool_use?: unknown }).tool_use !== null
  ) {
    return parsed as ToolUseEnvelope;
  }
  if (
    'tool_result' in parsed &&
    typeof (parsed as { tool_result?: unknown }).tool_result === 'object' &&
    (parsed as { tool_result?: unknown }).tool_result !== null
  ) {
    return parsed as ToolResultEnvelope;
  }
  return null;
}
