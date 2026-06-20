// Sprint 46.2 — derive per-page highlight targets from the scan's tool events.
//
// Highlights are only meaningful once a scan is complete and clauses are
// graded. This module joins the latest extract_clauses result (clause
// text + page) with the latest grade_clause_severity result (severity)
// and groups the graded clauses by page in clause_index order — the
// exact shape the customTextRenderer needs. It reuses the same "current
// scan" anchor (partitionByLatestExtract) and last-wins grading scan that
// RedFlagReport uses, so the highlights can never disagree with the cards.

import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { computeClauseHighlights } from './use-clause-highlights';

function extractEvent(
  leaseId: string,
  clauses: Array<{
    clause_id: string;
    clause_index: number;
    page_number: number;
    text: string;
  }>,
): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: {},
    result: { lease_id: leaseId, clauses },
    audit_id: undefined,
  };
}

function gradeEvent(clauseId: string, severity: string): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: clauseId },
    result: {
      clause_id: clauseId,
      severity,
      statute_citation: 'N.J.S.A. 46:8-21.1',
      chunk_id: 'chunk-1',
      reasoning: 'because',
      recommended_action: 'do x',
    },
    audit_id: undefined,
  };
}

describe('computeClauseHighlights', () => {
  it('groups graded clauses by page with their clause text + severity', () => {
    const events: ToolEvent[] = [
      extractEvent('L1', [
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          text: 'deposit terms',
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          page_number: 2,
          text: 'late fee terms',
        },
      ]),
      gradeEvent('c1', 'high'),
      gradeEvent('c2', 'medium'),
    ];

    const { byPage, count } = computeClauseHighlights(events, 'L1');
    expect(count).toBe(2);
    expect(byPage.get(1)?.[0]).toMatchObject({
      clauseId: 'c1',
      severity: 'high',
      text: 'deposit terms',
    });
    expect(byPage.get(2)?.[0]).toMatchObject({
      clauseId: 'c2',
      severity: 'medium',
    });
  });

  it('uses the last grade for a clause when it was re-graded', () => {
    const events: ToolEvent[] = [
      extractEvent('L1', [
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          text: 'deposit terms',
        },
      ]),
      gradeEvent('c1', 'low'),
      gradeEvent('c1', 'high'), // re-grade wins
    ];

    const { byPage } = computeClauseHighlights(events, 'L1');
    expect(byPage.get(1)?.[0].severity).toBe('high');
  });

  it('excludes clauses that were never graded (not red flags)', () => {
    const events: ToolEvent[] = [
      extractEvent('L1', [
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          text: 'deposit terms',
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          page_number: 1,
          text: 'parking terms',
        },
      ]),
      gradeEvent('c1', 'high'),
      // c2 grading errored — still counts as an attempt (so scan completes)
      {
        tool_name: 'grade_clause_severity',
        input: { clause_id: 'c2' },
        result: { error: 'citation grounding failed' },
        audit_id: undefined,
      },
    ];

    const { byPage, count } = computeClauseHighlights(events, 'L1');
    expect(count).toBe(1);
    expect(byPage.get(1)?.map((t) => t.clauseId)).toEqual(['c1']);
  });

  it('ignores gradings for a clause not in the active lease extract', () => {
    const events: ToolEvent[] = [
      extractEvent('L2', [
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          text: 'deposit terms',
        },
      ]),
      gradeEvent('c1', 'high'),
      gradeEvent('stale-prior-lease-clause', 'high'),
    ];

    const { count } = computeClauseHighlights(events, 'L2');
    expect(count).toBe(1);
  });

  it('returns nothing until the scan is complete', () => {
    const events: ToolEvent[] = [
      extractEvent('L1', [
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          text: 'deposit terms',
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          page_number: 1,
          text: 'late fee terms',
        },
      ]),
      gradeEvent('c1', 'high'), // only 1 of 2 graded → still grading
    ];

    const { byPage, count } = computeClauseHighlights(events, 'L1');
    expect(count).toBe(0);
    expect(byPage.size).toBe(0);
  });

  it('orders targets within a page by clause_index', () => {
    const events: ToolEvent[] = [
      extractEvent('L1', [
        {
          clause_id: 'late',
          clause_index: 3,
          page_number: 1,
          text: 'late fee terms here',
        },
        {
          clause_id: 'dep',
          clause_index: 1,
          page_number: 1,
          text: 'deposit terms here',
        },
      ]),
      gradeEvent('late', 'medium'),
      gradeEvent('dep', 'high'),
    ];

    const { byPage } = computeClauseHighlights(events, 'L1');
    expect(byPage.get(1)?.map((t) => t.clauseId)).toEqual(['dep', 'late']);
  });
});
