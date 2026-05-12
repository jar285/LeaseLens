import { describe, expect, it } from 'vitest';
import {
  CLAUSE_TYPE_LABEL,
  clauseLabel,
  isGradingResult,
  SEVERITY_BADGE,
  SEVERITY_BAR,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
} from './grading';

describe('isGradingResult', () => {
  const valid = {
    clause_id: 'c1',
    severity: 'high',
    statute_citation: 'NJ Stat 46:8-19',
  };

  it('accepts a minimal valid grading result', () => {
    expect(isGradingResult(valid)).toBe(true);
  });

  it('accepts a grading with optional fields', () => {
    expect(
      isGradingResult({
        ...valid,
        clause_type: 'security_deposit',
        clause_index: 2,
        page_number: 4,
        chunk_id: 'foo',
        reasoning: 'because',
        recommended_action: 'do x',
      }),
    ).toBe(true);
  });

  it('rejects non-object inputs', () => {
    expect(isGradingResult(null)).toBe(false);
    expect(isGradingResult(undefined)).toBe(false);
    expect(isGradingResult('string')).toBe(false);
    expect(isGradingResult(42)).toBe(false);
  });

  it('rejects when clause_id is missing or wrong type', () => {
    expect(isGradingResult({ ...valid, clause_id: undefined })).toBe(false);
    expect(isGradingResult({ ...valid, clause_id: 42 })).toBe(false);
  });

  it('rejects an unknown severity value', () => {
    expect(isGradingResult({ ...valid, severity: 'critical' })).toBe(false);
  });

  it('rejects when statute_citation is missing', () => {
    expect(isGradingResult({ ...valid, statute_citation: undefined })).toBe(
      false,
    );
  });

  it('rejects an errored tool_result shape', () => {
    // Real-world: a tool_result whose call errored typically lacks the
    // grading shape entirely.
    expect(isGradingResult({ error: 'corpus lookup failed' })).toBe(false);
  });
});

describe('clauseLabel', () => {
  it('falls back to "Clause" when no clause_type is set', () => {
    expect(clauseLabel({})).toBe('Clause');
  });

  it('uses the human label when clause_type is known', () => {
    expect(clauseLabel({ clause_type: 'security_deposit' })).toBe(
      'Security deposit',
    );
  });

  it('falls back to the unknown label when clause_type is not in the dictionary', () => {
    expect(clauseLabel({ clause_type: 'not_a_known_key' })).toBe(
      CLAUSE_TYPE_LABEL.unknown,
    );
  });

  it('appends the 1-based section number when clause_index is provided', () => {
    expect(
      clauseLabel({ clause_type: 'security_deposit', clause_index: 2 }),
    ).toBe('Security deposit · §3');
  });

  it('still emits the section number when only the index is set', () => {
    expect(clauseLabel({ clause_index: 0 })).toBe('Clause · §1');
  });
});

describe('severity dictionaries', () => {
  it('covers every severity in BAR / BADGE / LABEL maps', () => {
    for (const sev of SEVERITY_ORDER) {
      expect(SEVERITY_BAR[sev]).toBeTruthy();
      expect(SEVERITY_BADGE[sev]).toBeTruthy();
      expect(SEVERITY_LABEL[sev]).toBeTruthy();
    }
  });
});
