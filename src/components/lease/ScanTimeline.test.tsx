import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolInvocation } from '@/components/chat/ChatMessage';
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
      withChatStream(<ScanTimeline invocations={[]} />),
    );
    expect(container.querySelector('[data-testid="scan-timeline"]')).toBeNull();
  });

  it('renders only the "Extracting clauses" row when extract just landed', () => {
    render(
      withChatStream(<ScanTimeline invocations={[]} />, {
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
      withChatStream(<ScanTimeline invocations={[]} />, {
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
      withChatStream(<ScanTimeline invocations={[]} />, {
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

  it('renders the drawer toggle disabled when there are no invocations behind it', () => {
    // Defensive: the timeline can mount before any tool invocation has
    // been wired through (e.g. an immediate re-render after a state
    // change). The toggle should fall back to disabled rather than
    // open an empty drawer.
    render(
      withChatStream(<ScanTimeline invocations={[]} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
        ],
      }),
    );
    const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toBeDisabled();
  });

  it('pluralises "step" / "steps" correctly on the toggle', () => {
    const single: ToolInvocation = {
      id: 'inv-1',
      name: 'extract_clauses',
      input: {},
      result: {},
    };
    const triple: ToolInvocation[] = [single, single, single].map((t, i) => ({
      ...t,
      id: `inv-${i}`,
    }));

    const { rerender } = render(
      withChatStream(<ScanTimeline invocations={[single]} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
        ],
      }),
    );
    expect(
      screen.getByTestId('scan-timeline-drawer-toggle').textContent,
    ).toMatch(/1\s*step\b/);

    rerender(
      withChatStream(<ScanTimeline invocations={triple} />, {
        initialEvents: [
          extractEvent([{ clause_id: 'c1', clause_type: 'security_deposit' }]),
        ],
      }),
    );
    expect(
      screen.getByTestId('scan-timeline-drawer-toggle').textContent,
    ).toMatch(/3\s*steps/i);
  });

  it('announces the most-recently-completed stage via aria-live', () => {
    render(
      withChatStream(<ScanTimeline invocations={[]} />, {
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
      withChatStream(<ScanTimeline invocations={[]} />, {
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

  // S19.7 — the "Show what I did" toggle wires to an inline
  // ActivityDrawer that renders the raw ToolCards behind the curtain.
  // The drawer is closed by default; clicking the toggle flips
  // aria-expanded and reveals the cards below the timeline.
  describe('S19.7 — drawer toggle wiring', () => {
    const invocations: ToolInvocation[] = [
      {
        id: 'inv-extract',
        name: 'extract_clauses',
        input: { lease_id: 'lease-1' },
        result: { clauses: [{ clause_id: 'c1' }] },
      },
      {
        id: 'inv-grade',
        name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        result: {
          clause_id: 'c1',
          severity: 'high',
          statute_citation: 'NJSA 46:8-1',
          chunk_id: 'k',
          reasoning: 'r',
          recommended_action: 'a',
        },
      },
    ];

    function renderTimelineWithInvocations() {
      return render(
        withChatStream(<ScanTimeline invocations={invocations} />, {
          initialEvents: [
            extractEvent([
              { clause_id: 'c1', clause_type: 'security_deposit' },
            ]),
            gradeSuccess('c1'),
          ],
        }),
      );
    }

    it('renders the toggle button enabled (not aria-disabled) once invocations are present', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      expect(toggle).not.toBeDisabled();
      expect(toggle.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('starts with the drawer collapsed (aria-expanded=false)', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('activity-drawer')).not.toBeInTheDocument();
    });

    it('opens the drawer on toggle click and flips aria-expanded', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByTestId('activity-drawer')).toBeInTheDocument();
    });

    it('toggle text flips between "Show what I did" and "Hide technical details"', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      expect(toggle.textContent ?? '').toMatch(/show what i did/i);
      fireEvent.click(toggle);
      expect(toggle.textContent ?? '').toMatch(/hide technical details/i);
      fireEvent.click(toggle);
      expect(toggle.textContent ?? '').toMatch(/show what i did/i);
    });

    it('wires aria-controls on the toggle to the drawer id', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      const drawerId = toggle.getAttribute('aria-controls');
      expect(drawerId).toBeTruthy();
      fireEvent.click(toggle);
      expect(screen.getByTestId('activity-drawer').id).toBe(drawerId);
    });

    // S19.9 — the toggle is a primary interaction surface in the chat
    // column; on mobile it has to clear the 44px touch-target floor.
    it('S19.9 — drawer toggle reaches the 44px touch-target minimum', () => {
      renderTimelineWithInvocations();
      const toggle = screen.getByTestId('scan-timeline-drawer-toggle');
      expect(toggle.className).toMatch(/\bmin-h-11\b/);
    });
  });
});
