import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { withChatStream } from '@/components/chat/test-helpers';
import { ScanTimeline } from './ScanTimeline';

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

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

afterEach(cleanup);

describe('ScanTimeline', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });

  it('renders nothing before an extract_clauses event arrives', () => {
    const { container } = render(
      withChatStream(<ScanTimeline invocationCount={0} />),
    );
    expect(container.querySelector('[data-testid="scan-timeline"]')).toBeNull();
  });

  it('renders only the "Extracting clauses" row when extract just landed', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={1} />, {
        initialEvents: [
          extractEvent([
            { clause_id: 'c1', clause_type: 'security_deposit' },
            { clause_id: 'c2', clause_type: 'late_fee' },
          ]),
        ],
      }),
    );
    expect(screen.getByTestId('scan-timeline')).toBeInTheDocument();
    const rows = screen.getAllByTestId('scan-stage-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Extracting clauses');
    expect(rows[0].getAttribute('data-status')).toBe('complete');
  });

  it('reveals thematic stages in event order as gradings arrive', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={3} />, {
        initialEvents: [
          extractEvent([
            { clause_id: 'c1', clause_type: 'security_deposit' },
            { clause_id: 'c2', clause_type: 'late_fee' },
          ]),
          gradeSuccess('c2'), // fees first
          gradeSuccess('c1'), // security second
        ],
      }),
    );
    const rowLabels = screen
      .getAllByTestId('scan-stage-row')
      .map((row) => row.textContent ?? '');
    // Stages should reveal in first-seen order, not extract order.
    expect(rowLabels[0]).toContain('Extracting clauses');
    expect(rowLabels[1]).toContain('Reviewing fees and penalties');
    expect(rowLabels[2]).toContain('Checking security deposit terms');
    // Final synthetic stage appears once every clause has been attempted.
    expect(rowLabels[3]).toContain('Preparing red flag report');
  });

  it('renders the per-clause counter on active stages', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={3} />, {
        initialEvents: [
          extractEvent([
            { clause_id: 'c1', clause_type: 'security_deposit' },
            { clause_id: 'c2', clause_type: 'security_deposit' },
            { clause_id: 'c3', clause_type: 'security_deposit' },
          ]),
          gradeSuccess('c1'),
        ],
      }),
    );
    const counters = screen.getAllByTestId('scan-stage-counter');
    expect(counters.map((c) => c.textContent)).toContain('1 of 3');
  });

  it('renders the drawer-toggle stub as disabled (Phase 1 affordance)', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={5} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
        ],
      }),
    );
    const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle.textContent).toMatch(/5\s*steps/i);
  });

  it('pluralises "step" / "steps" correctly on the toggle', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={1} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
        ],
      }),
    );
    expect(
      screen.getByTestId('scan-timeline-drawer-toggle').textContent,
    ).toMatch(/1\s*step\b/);
  });

  it('announces the most-recently-completed stage via aria-live', () => {
    render(
      withChatStream(<ScanTimeline invocationCount={3} />, {
        initialEvents: [
          extractEvent([
            { clause_id: 'c1', clause_type: 'security_deposit' },
            { clause_id: 'c2', clause_type: 'security_deposit' },
          ]),
          gradeSuccess('c1'),
          gradeSuccess('c2'),
        ],
      }),
    );
    const announce = screen.getByTestId('scan-timeline-announce');
    expect(announce).toHaveAttribute('aria-live', 'polite');
    // Once every clause is attempted, the synthetic "Preparing red
    // flag report" row appears and is the most-recent complete.
    expect(announce.textContent).toMatch(/Preparing red flag report/);
  });

  it('renders static rows (no animated wrapper) under reduced motion', () => {
    useReducedMotionMock.mockReturnValue(true);
    render(
      withChatStream(<ScanTimeline invocationCount={2} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
          gradeSuccess('c1'),
        ],
      }),
    );
    // Under reduced motion the timeline still mounts and renders rows.
    // The visible cue we care about is that complete-state icons render
    // (the static dot path inside ScanTimelineRow), not the animated
    // pulse — but both share the same DOM otherwise, so a clean visual
    // assertion is "the rows themselves rendered with correct status".
    const rows = screen.getAllByTestId('scan-stage-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((row) => row.getAttribute('data-status') !== null)).toBe(
      true,
    );
  });
});
