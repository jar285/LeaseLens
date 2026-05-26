import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { computeScanProgress } from './use-scan-progress';

function extractEvent(clauseIds: string[]): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: {},
    result: {
      clauses: clauseIds.map((id) => ({ clause_id: id })),
    },
    audit_id: undefined,
  };
}

function gradeSuccess(clauseId: string): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: clauseId },
    result: {
      clause_id: clauseId,
      severity: 'high',
      statute_citation: 'NJSA 1',
    },
    audit_id: undefined,
  };
}

function gradeError(clauseId: string): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: clauseId },
    // Real errored tool_results lack the GradingResult fields and may
    // expose an `error` string instead. Crucially, input.clause_id is
    // still present — that's what we count by.
    result: { error: 'corpus lookup failed' },
    audit_id: undefined,
  };
}

describe('computeScanProgress', () => {
  it('returns idle when no extract_clauses event has fired', () => {
    expect(computeScanProgress([])).toEqual({
      phase: 'idle',
      total: 0,
      attempted: 0,
      label: '',
    });
  });

  it('returns extracting when clauses are known but none attempted yet', () => {
    const events = [extractEvent(['c1', 'c2', 'c3'])];
    const progress = computeScanProgress(events);
    expect(progress.phase).toBe('extracting');
    expect(progress.total).toBe(3);
    expect(progress.attempted).toBe(0);
    expect(progress.label).toContain('3 clauses');
  });

  it('returns grading with the attempted/total counter mid-scan', () => {
    const events = [
      extractEvent(['c1', 'c2', 'c3']),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
    ];
    const progress = computeScanProgress(events);
    expect(progress.phase).toBe('grading');
    expect(progress.total).toBe(3);
    expect(progress.attempted).toBe(2);
    expect(progress.label).toBe('Grading 2 of 3…');
  });

  it('returns complete once every clause has at least one tool_result, even when some errored', () => {
    // Reproduces the user-reported bug: 7 successes + 8 errors across 15
    // clauses should land in 'complete', not stay stuck in 'grading'.
    const events: ToolEvent[] = [
      extractEvent(['c1', 'c2', 'c3', 'c4', 'c5']),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
      gradeSuccess('c3'),
      gradeError('c4'),
      gradeError('c5'),
    ];
    const progress = computeScanProgress(events);
    expect(progress.phase).toBe('complete');
    expect(progress.attempted).toBe(5);
    expect(progress.label).toContain('5 clauses processed');
  });

  it('counts errored gradings as attempts mid-scan', () => {
    const events: ToolEvent[] = [
      extractEvent(['c1', 'c2', 'c3']),
      gradeSuccess('c1'),
      gradeError('c2'),
    ];
    const progress = computeScanProgress(events);
    expect(progress.phase).toBe('grading');
    expect(progress.attempted).toBe(2);
    expect(progress.label).toBe('Grading 2 of 3…');
  });

  it('ignores attempts from a prior scan when a fresh extract fires', () => {
    const events = [
      extractEvent(['c1', 'c2']),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
      // Re-run: a new extract resets the counter
      extractEvent(['d1', 'd2', 'd3']),
      gradeSuccess('d1'),
    ];
    const progress = computeScanProgress(events);
    expect(progress.phase).toBe('grading');
    expect(progress.total).toBe(3);
    expect(progress.attempted).toBe(1);
  });

  it('deduplicates repeated attempts on the same clause', () => {
    const events = [
      extractEvent(['c1', 'c2']),
      gradeSuccess('c1'),
      gradeSuccess('c1'), // a re-grade of the same clause
    ];
    const progress = computeScanProgress(events);
    expect(progress.attempted).toBe(1);
    expect(progress.phase).toBe('grading');
  });

  // Sprint 28.5 — Bug 2 follow-up. AutoScanRunner pushes tool events with
  // `input: {}` (empty) because it only processes `tool_result` envelopes
  // and discards the `tool_use` envelopes that carry the input args. The
  // grade events arrive with empty input but a populated `result.clause_id`.
  // The original counter only read `input.clause_id`, so every auto-scan
  // grading was invisible — `attempted` stayed at 0 and the header parked
  // on "Scanning lease — N clauses found" with a spinner even after every
  // clause had finished grading. This pins the regression.
  describe('Sprint 28.5 — auto-scan input-less grade events (Bug 2 follow-up)', () => {
    function gradeSuccessNoInput(clauseId: string): ToolEvent {
      return {
        tool_name: 'grade_clause_severity',
        input: {}, // mirrors AutoScanRunner's empty-input shape
        result: {
          clause_id: clauseId,
          severity: 'med',
          statute_citation: 'NJSA 1',
        },
        audit_id: undefined,
      };
    }

    it('counts auto-scan grade events that carry only result.clause_id', () => {
      const events: ToolEvent[] = [
        extractEvent(['c1', 'c2', 'c3']),
        gradeSuccessNoInput('c1'),
        gradeSuccessNoInput('c2'),
      ];
      const progress = computeScanProgress(events);
      expect(progress.attempted).toBe(2);
      expect(progress.phase).toBe('grading');
      expect(progress.label).toBe('Grading 2 of 3…');
    });

    it('marks the scan complete when every clause has an input-less grade event', () => {
      // Reproduces the user's screenshot: 15 clauses found, every clause
      // graded via auto-scan (empty input, result.clause_id populated).
      // Today the header was still showing "Scanning lease — 15 clauses
      // found" with a spinner because attempted stayed at 0.
      const clauseIds = Array.from({ length: 15 }, (_, i) => `c${i + 1}`);
      const events: ToolEvent[] = [
        extractEvent(clauseIds),
        ...clauseIds.map(gradeSuccessNoInput),
      ];
      const progress = computeScanProgress(events);
      expect(progress.attempted).toBe(15);
      expect(progress.phase).toBe('complete');
    });
  });
});
