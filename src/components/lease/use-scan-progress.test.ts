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
});
