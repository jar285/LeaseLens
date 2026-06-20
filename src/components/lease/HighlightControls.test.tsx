// Sprint 46.7 — highlight visibility + severity-filter controls.
//
// Lives in the red-flags pane header. Master show/hide toggle + four
// severity chips (each a SeverityBadge → icon+text+colour, never colour
// alone). aria-pressed conveys state; min-h-11 keeps touch targets ≥44px;
// a polite aria-live status announces visibility changes. Self-gates on
// "are there graded highlights" so it never shows before a scan completes.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { withChatStream } from '@/components/chat/test-helpers';
import { HighlightControls } from './HighlightControls';

afterEach(cleanup);

const LEASE = 'L1';

function completeScan(): ToolEvent[] {
  return [
    {
      tool_name: 'extract_clauses',
      input: {},
      result: {
        lease_id: LEASE,
        clauses: [
          {
            clause_id: 'c1',
            clause_index: 0,
            page_number: 1,
            clause_type: 'security_deposit',
            text: 'security deposit equal to two months',
          },
        ],
      },
      audit_id: undefined,
    },
    {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: {
        clause_id: 'c1',
        severity: 'high',
        statute_citation: 'N.J.S.A. 46:8-21.1',
        chunk_id: 'c',
        reasoning: 'r',
        recommended_action: 'a',
      },
      audit_id: undefined,
    },
  ];
}

function renderControls(events: ToolEvent[]) {
  return render(
    withChatStream(<HighlightControls />, {
      initialEvents: events,
      activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
    }),
  );
}

describe('HighlightControls', () => {
  it('renders nothing until there are graded highlights', () => {
    renderControls([]); // no scan → no graded clauses
    expect(screen.queryByTestId('highlight-controls')).toBeNull();
  });

  // Sprint 54 — the controls govern the PDF highlights, not the card list; a
  // scope label removes that ambiguity (Nielsen: label the control).
  it('labels the control group as governing the PDF highlights', () => {
    renderControls(completeScan());
    const label = screen.getByTestId('highlight-controls-label');
    expect(label.textContent ?? '').toMatch(/highlight on pdf/i);
  });

  it('renders the master toggle on + High/Medium filters on, Low/OK off by default', () => {
    renderControls(completeScan());
    expect(screen.getByTestId('highlight-controls')).toBeInTheDocument();
    expect(screen.getByTestId('highlight-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('highlight-filter-high')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('highlight-filter-medium')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('highlight-filter-low')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('highlight-filter-ok')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('toggles master visibility and reflects it in aria-pressed + the live status', () => {
    renderControls(completeScan());
    const toggle = screen.getByTestId('highlight-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('highlight-status')).toHaveTextContent(/off/i);
  });

  it('toggles an individual severity filter', () => {
    renderControls(completeScan());
    const low = screen.getByTestId('highlight-filter-low');
    expect(low).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(low);
    expect(low).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables the severity filters when highlights are hidden', () => {
    renderControls(completeScan());
    fireEvent.click(screen.getByTestId('highlight-toggle')); // hide
    expect(screen.getByTestId('highlight-filter-high')).toBeDisabled();
  });

  it('keeps each severity filter labelled by text+icon, not colour alone', () => {
    renderControls(completeScan());
    const high = screen.getByTestId('highlight-filter-high');
    // SeverityBadge renders the text label inside the chip
    expect(high).toHaveTextContent(/high/i);
    expect(high.querySelector('[data-testid="severity-badge"]')).not.toBeNull();
  });
});
