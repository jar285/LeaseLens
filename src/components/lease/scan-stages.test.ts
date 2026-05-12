import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { computeScanStages } from './scan-stages';

interface Clause {
  clause_id: string;
  clause_type?: string;
}

function extractEvent(clauses: Clause[]): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: {},
    result: { clauses },
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
    result: { error: 'corpus lookup failed' },
    audit_id: undefined,
  };
}

describe('computeScanStages', () => {
  it('returns an empty list when no extract_clauses event has fired yet', () => {
    expect(computeScanStages([])).toEqual([]);
  });

  it('returns only the extract stage when clauses are known but none graded', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'late_fee' },
      ]),
    ]);
    expect(stages).toHaveLength(1);
    expect(stages[0].stageId).toBe('extract');
    expect(stages[0].label).toBe('Extracting clauses');
    expect(stages[0].status).toBe('complete');
  });

  it('reveals a grade stage the first time a clause of that type is attempted', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'security_deposit' },
        { clause_id: 'c3', clause_type: 'late_fee' },
      ]),
      gradeSuccess('c1'),
    ]);
    expect(stages.map((s) => s.label)).toEqual([
      'Extracting clauses',
      'Checking security deposit terms',
    ]);
    const secDepositStage = stages[1];
    expect(secDepositStage.status).toBe('active');
    expect(secDepositStage.clausesTotal).toBe(2);
    expect(secDepositStage.clausesGraded).toBe(1);
  });

  it('completes a stage when every clause in its bucket is attempted', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'security_deposit' },
      ]),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
    ]);
    const secDepositStage = stages.find(
      (s) => s.label === 'Checking security deposit terms',
    );
    expect(secDepositStage?.status).toBe('complete');
    expect(secDepositStage?.clausesGraded).toBe(2);
  });

  it('counts errored attempts toward stage progress (no ghost rows)', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'security_deposit' },
      ]),
      gradeSuccess('c1'),
      gradeError('c2'),
    ]);
    const secDepositStage = stages.find(
      (s) => s.label === 'Checking security deposit terms',
    );
    expect(secDepositStage?.status).toBe('complete');
    expect(secDepositStage?.clausesGraded).toBe(2);
  });

  it('groups related clause types into a single stage label', () => {
    // late_fee, attorneys_fees, indemnification all collapse to
    // "Reviewing fees and penalties" — see STAGE_LABEL in grading.ts.
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'late_fee' },
        { clause_id: 'c2', clause_type: 'attorneys_fees' },
        { clause_id: 'c3', clause_type: 'indemnification' },
      ]),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
    ]);
    const feeStages = stages.filter(
      (s) => s.label === 'Reviewing fees and penalties',
    );
    expect(feeStages).toHaveLength(1);
    expect(feeStages[0].clausesTotal).toBe(3);
    expect(feeStages[0].clausesGraded).toBe(2);
    expect(feeStages[0].status).toBe('active');
  });

  it('appends a synthetic "report" stage once every clause has been attempted', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'late_fee' },
      ]),
      gradeSuccess('c1'),
      gradeError('c2'),
    ]);
    expect(stages[stages.length - 1].stageId).toBe('report');
    expect(stages[stages.length - 1].label).toBe('Preparing red flag report');
    expect(stages[stages.length - 1].status).toBe('complete');
  });

  it('does not append the report stage while clauses remain unattempted', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'late_fee' },
      ]),
      gradeSuccess('c1'),
    ]);
    expect(stages.find((s) => s.stageId === 'report')).toBeUndefined();
  });

  it('buckets clauses with missing or unknown clause_type into "Reviewing other lease terms"', () => {
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1' }, // no clause_type
        { clause_id: 'c2', clause_type: 'definitely_not_a_known_type' },
      ]),
      gradeSuccess('c1'),
      gradeSuccess('c2'),
    ]);
    const otherStages = stages.filter(
      (s) => s.label === 'Reviewing other lease terms',
    );
    expect(otherStages).toHaveLength(1);
    expect(otherStages[0].clausesTotal).toBe(2);
    expect(otherStages[0].status).toBe('complete');
  });

  it('resets stages on a fresh extract (ignores prior-scan grade events)', () => {
    const stages = computeScanStages([
      extractEvent([{ clause_id: 'old1', clause_type: 'security_deposit' }]),
      gradeSuccess('old1'),
      // Fresh scan — different lease, different clauses.
      extractEvent([
        { clause_id: 'new1', clause_type: 'late_fee' },
        { clause_id: 'new2', clause_type: 'late_fee' },
      ]),
      gradeSuccess('new1'),
    ]);
    expect(stages.map((s) => s.label)).toEqual([
      'Extracting clauses',
      'Reviewing fees and penalties',
    ]);
    expect(stages[1].clausesTotal).toBe(2);
    expect(stages[1].clausesGraded).toBe(1);
  });

  it('deduplicates re-grades of the same clause within a stage', () => {
    const stages = computeScanStages([
      extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
      gradeSuccess('c1'),
      gradeSuccess('c1'), // accidental re-grade
    ]);
    const secDepositStage = stages.find(
      (s) => s.label === 'Checking security deposit terms',
    );
    expect(secDepositStage?.clausesGraded).toBe(1);
  });

  it('returns stages sorted by firstSeenIndex (reveal order)', () => {
    // Clauses are extracted in security_deposit, late_fee, sublet order,
    // but graded in late_fee, sublet, security_deposit order. The stage
    // sequence must follow first-grading order, not extract order.
    const stages = computeScanStages([
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'late_fee' },
        { clause_id: 'c3', clause_type: 'sublet' },
      ]),
      gradeSuccess('c2'), // late_fee first
      gradeSuccess('c3'), // sublet second
      gradeSuccess('c1'), // security_deposit last
    ]);
    expect(stages.map((s) => s.label)).toEqual([
      'Extracting clauses',
      'Reviewing fees and penalties',
      'Reviewing subletting rules',
      'Checking security deposit terms',
      'Preparing red flag report',
    ]);
  });

  it('produces a stable output for identical input (deterministic)', () => {
    const events: ToolEvent[] = [
      extractEvent([
        { clause_id: 'c1', clause_type: 'security_deposit' },
        { clause_id: 'c2', clause_type: 'late_fee' },
      ]),
      gradeSuccess('c1'),
      gradeError('c2'),
    ];
    const first = computeScanStages(events);
    const second = computeScanStages(events);
    expect(second).toEqual(first);
  });
});
