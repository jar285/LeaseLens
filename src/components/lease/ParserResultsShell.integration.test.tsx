// Sprint 26b Phase 4 — integration test.
//
// Verifies that ParserResultsShell, mounted with rehydrated tool events,
// populates RedFlagReport and ClausesList from the same ChatStreamContext
// (no divergent state). Also verifies that the "View in PDF" affordance
// on a clause row triggers the same pdfViewerRef.scrollToPage(N) flow
// that the existing red-flag card uses.
//
// The shell's PdfViewer is mocked with a component that mounts INSIDE
// the shell's ChatStreamProvider, so we can hook the shared
// pdfViewerRef.current = { scrollToPage } from there. That mirrors the
// real PdfViewer's behavior (PdfViewer.client publishes its imperative
// API via the context's pdfViewerRef on mount).

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { useChatStream } from '@/components/chat/ChatStreamContext';

// Test-scoped spy that lives across renders within a single it() block.
// Reset via beforeEach.
let scrollSpy: ReturnType<typeof vi.fn<(page: number) => void>>;

vi.mock('./PdfViewer', () => ({
  PdfViewer: function PdfViewerStub() {
    // Hook into the shell's shared ChatStreamContext and publish a fake
    // imperative API exactly the way PdfViewer.client does in production.
    const { pdfViewerRef } = useChatStream();
    pdfViewerRef.current = {
      scrollToPage: (page: number) => {
        scrollSpy(page);
      },
    };
    return <div data-testid="pdf-viewer-mock">PdfViewer mock</div>;
  },
}));

// Sprint 26c — chat lives inside the FAB; the integration test doesn't
// need to exercise the FAB drawer here (that's covered by
// AssistantFab.client.test.tsx). Mock the FAB to a marker.
vi.mock('@/components/chat/AssistantFab', () => ({
  AssistantFab: () => <div data-testid="assistant-fab-mock">FAB mock</div>,
}));

import { ParserResultsShell } from './ParserResultsShell';

beforeEach(() => {
  scrollSpy = vi.fn();
});

afterEach(() => {
  cleanup();
});

function extractClausesEvent(): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: { lease_id: 'lease-int' },
    result: {
      lease_id: 'lease-int',
      page_count: 5,
      clauses: [
        {
          clause_id: 'c-deposit',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 2,
          text: '...',
        },
        {
          clause_id: 'c-late-fee',
          clause_index: 1,
          clause_type: 'late_fee',
          page_number: 3,
          text: '...',
        },
        {
          clause_id: 'c-sublet',
          clause_index: 2,
          clause_type: 'sublet',
          page_number: 4,
          text: '...',
        },
      ],
    },
    audit_id: undefined,
  };
}

function gradingHighDeposit(): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: 'c-deposit', lease_id: 'lease-int' },
    result: {
      clause_id: 'c-deposit',
      clause_type: 'security_deposit',
      clause_index: 0,
      page_number: 2,
      severity: 'high',
      statute_citation: 'NJ Stat 46:8-19',
      chunk_id: 'security-deposit-cap#section:1',
      reasoning: "Two months exceeds NJ's 1.5-month cap.",
      recommended_action: 'Negotiate down to the statutory cap.',
    },
    audit_id: undefined,
  };
}

const baseProps = {
  initialMessages: [],
  conversationId: 'conv-int',
  workspaceName: 'Integration test',
  viewerRole: 'Tenant' as const,
  initialToolEvents: [extractClausesEvent(), gradingHighDeposit()],
  initialActiveLease: {
    lease_id: 'lease-int',
    filename: 'integration.pdf',
    page_count: 5,
    clause_count: 3,
    pdfUrl: 'blob:mock-pdf-int',
  },
};

describe('ParserResultsShell integration', () => {
  it('populates RedFlagReport and ClausesList from the same rehydrated tool events', () => {
    render(<ParserResultsShell {...baseProps} />);

    // RedFlagReport renders one card (the only graded clause is c-deposit).
    const redFlagCards = screen.getAllByTestId('red-flag-card');
    expect(redFlagCards).toHaveLength(1);
    expect(redFlagCards[0]).toHaveAttribute('data-severity', 'high');
    expect(redFlagCards[0].textContent?.toLowerCase()).toContain(
      'security deposit',
    );

    // ClausesList shows all three rows. The deposit row carries the HIGH
    // chip; the others remain "pending" (no grading yet).
    const clauseRows = screen.getAllByTestId('clauses-list-row');
    expect(clauseRows).toHaveLength(3);
    expect(clauseRows[0]).toHaveAttribute('data-severity', 'high');
    expect(clauseRows[1]).toHaveAttribute('data-severity', 'pending');
    expect(clauseRows[2]).toHaveAttribute('data-severity', 'pending');
  });

  it('clicking a clause row triggers the same scrollToPage flow as a red-flag card', () => {
    render(<ParserResultsShell {...baseProps} />);

    // Click the deposit clause row (page 2). The mocked PdfViewer wires
    // scrollToPage to the test-scoped spy.
    const depositRow = screen
      .getAllByTestId('clauses-list-row')
      .find((row) => row.getAttribute('data-clause-id') === 'c-deposit');
    if (!depositRow) throw new Error('expected clauses-list-row for c-deposit');
    fireEvent.click(depositRow);
    expect(scrollSpy).toHaveBeenCalledWith(2);

    // Reset and click the red-flag card's citation chip (the collapsed-card
    // jump affordance). The chip uses an aria-label of the form
    // "<citation>, jump to page <N>". Both surfaces must call
    // scrollToPage with the same page number.
    scrollSpy.mockClear();
    const redCard = screen.getByTestId('red-flag-card');
    const citationChip = within(redCard).getByRole('button', {
      name: /jump to page 2/i,
    });
    fireEvent.click(citationChip);
    expect(scrollSpy).toHaveBeenCalledWith(2);
  });

  it('ungraded clauses appear in ClausesList but NOT in RedFlagReport', () => {
    render(<ParserResultsShell {...baseProps} />);

    // ClausesList carries every extracted clause.
    expect(screen.getAllByTestId('clauses-list-row')).toHaveLength(3);

    // RedFlagReport only carries the graded clause — c-late-fee and
    // c-sublet have no grading event, so no card for them.
    const cards = screen.getAllByTestId('red-flag-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent?.toLowerCase()).not.toContain('late fee');
    expect(cards[0].textContent?.toLowerCase()).not.toContain('sublet');
  });
});
