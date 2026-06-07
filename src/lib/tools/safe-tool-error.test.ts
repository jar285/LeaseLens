// Sprint 44B — a thrown tool error must NEVER be persisted/logged raw: a
// JSON.parse SyntaxError on a draft-email body (or clause text) embeds tenant
// PII in its message. toSafeToolError reduces any error to a safe { name, code }.

import { describe, expect, it } from 'vitest';
import { ToolAccessDeniedError, UnknownToolError } from './errors';
import { toSafeToolError } from './safe-tool-error';

describe('toSafeToolError', () => {
  it('reduces a JSON.parse SyntaxError to a safe name + code, dropping the message', () => {
    const err = new SyntaxError('Unexpected token < — DRAFT-BODY-PII-xyz');
    const safe = toSafeToolError(err);
    expect(safe).toEqual({ name: 'SyntaxError', code: 'parse_error' });
    expect(JSON.stringify(safe)).not.toContain('DRAFT-BODY-PII-xyz');
  });

  it('reduces a generic Error to tool_error, dropping the message', () => {
    const safe = toSafeToolError(new Error('clause text PII-123'));
    expect(safe).toEqual({ name: 'Error', code: 'tool_error' });
    expect(JSON.stringify(safe)).not.toContain('PII-123');
  });

  it('does not echo a non-Error value', () => {
    const safe = toSafeToolError('RAW-PII-STRING');
    expect(JSON.stringify(safe)).not.toContain('RAW-PII-STRING');
    expect(safe.code).toBe('tool_error');
  });

  it('maps known registry errors to stable codes', () => {
    expect(toSafeToolError(new ToolAccessDeniedError('t', 'Tenant')).code).toBe(
      'access_denied',
    );
    expect(toSafeToolError(new UnknownToolError('t')).code).toBe(
      'unknown_tool',
    );
  });
});
