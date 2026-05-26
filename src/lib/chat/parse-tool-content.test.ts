// Sprint 25.1 (R5) — shared tool envelope parser.

import { describe, expect, it } from 'vitest';
import { narrowToolEnvelope, parseToolContent } from './parse-tool-content';

describe('parseToolContent', () => {
  it('parses a valid tool_use envelope', () => {
    const result = parseToolContent(
      JSON.stringify({
        tool_use: {
          id: 't1',
          name: 'extract_clauses',
          input: { lease_id: 'L' },
        },
      }),
    );
    expect(result).toEqual({
      tool_use: { id: 't1', name: 'extract_clauses', input: { lease_id: 'L' } },
    });
  });

  it('parses a valid tool_result envelope (with optional fields populated)', () => {
    const result = parseToolContent(
      JSON.stringify({
        tool_result: {
          id: 't1',
          name: 'grade_clause_severity',
          result: { severity: 'high' },
          audit_id: 'a-1',
        },
      }),
    );
    expect(result).toEqual({
      tool_result: {
        id: 't1',
        name: 'grade_clause_severity',
        result: { severity: 'high' },
        audit_id: 'a-1',
      },
    });
  });

  it('returns null for malformed JSON', () => {
    expect(parseToolContent('not json')).toBeNull();
  });

  it('returns null for a primitive', () => {
    expect(parseToolContent(JSON.stringify('hello'))).toBeNull();
    expect(parseToolContent(JSON.stringify(42))).toBeNull();
  });

  it('returns null for an unrecognized shape', () => {
    expect(parseToolContent(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('narrowToolEnvelope', () => {
  it('narrows an already-parsed tool_use', () => {
    expect(
      narrowToolEnvelope({
        tool_use: { id: 't1', name: 'n', input: {} },
      }),
    ).toEqual({ tool_use: { id: 't1', name: 'n', input: {} } });
  });

  it('returns null for null / non-object input', () => {
    expect(narrowToolEnvelope(null)).toBeNull();
    expect(narrowToolEnvelope('hello')).toBeNull();
    expect(narrowToolEnvelope(undefined)).toBeNull();
  });
});
