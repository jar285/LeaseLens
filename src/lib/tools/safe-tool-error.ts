// Sprint 44B — reduce a thrown tool error to a SAFE, PII-free record for
// persistence (tool_calls) + structured logging. We deliberately keep ONLY the
// error class name + a stable enumerated code, and NEVER the message/stack: a
// JSON.parse SyntaxError from draft_negotiation_email / grade_clause_severity
// embeds the model's draft-email body or clause text (tenant PII) in its
// message. This is the structured-event allowlist applied to durable storage
// (Ross Anderson / Adam Shostack).

import {
  ToolAccessDeniedError,
  ToolTimeoutError,
  UnknownToolError,
} from './errors';

export interface SafeToolError {
  /** The JS error class name (e.g. 'SyntaxError') — safe, carries no PII. */
  name: string;
  /** Stable enumerated code for aggregation/triage. */
  code:
    | 'access_denied'
    | 'unknown_tool'
    | 'parse_error'
    | 'tool_timeout'
    | 'tool_error';
}

export function toSafeToolError(err: unknown): SafeToolError {
  if (err instanceof ToolAccessDeniedError) {
    return { name: err.name, code: 'access_denied' };
  }
  if (err instanceof UnknownToolError) {
    return { name: err.name, code: 'unknown_tool' };
  }
  // Sprint A.8 (#8) — per-tool timeout maps to its own code for triage.
  if (err instanceof ToolTimeoutError) {
    return { name: err.name, code: 'tool_timeout' };
  }
  if (err instanceof SyntaxError) {
    return { name: err.name, code: 'parse_error' };
  }
  if (err instanceof Error) {
    return { name: err.name, code: 'tool_error' };
  }
  return { name: 'NonError', code: 'tool_error' };
}
