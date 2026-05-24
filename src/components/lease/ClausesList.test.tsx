// Sprint 26b Phase 2 — red test.
//
// Standalone list of extracted clauses. Reads tool events from
// ChatStreamContext, unions extracted clauses with graded clauses, and
// renders one row per clause with severity chip (when graded), page
// meta, and a keyboard-reachable button that triggers the same PDF
// jump flow RedFlagReport uses.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantFabProvider,
  useAssistantFab,
} from '@/components/chat/AssistantFabContext';
import {
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { ClausesList } from './ClausesList';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function extractClausesEvent(
  clauses: Array<{
    clause_id: string;
    clause_index: number;
    clause_type: string;
    page_number: number;
    text?: string;
  }>,
): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: { lease_id: 'lease-1' },
    result: {
      lease_id: 'lease-1',
      page_count: 18,
      clauses: clauses.map((c) => ({
        text: c.text ?? `text for ${c.clause_id}`,
        ...c,
      })),
    },
    audit_id: undefined,
  };
}

function gradingEvent(clause: {
  clause_id: string;
  clause_index: number;
  clause_type: string;
  page_number: number;
  severity: 'high' | 'medium' | 'low' | 'ok';
}): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: clause.clause_id, lease_id: 'lease-1' },
    result: {
      clause_id: clause.clause_id,
      clause_type: clause.clause_type,
      clause_index: clause.clause_index,
      page_number: clause.page_number,
      severity: clause.severity,
      statute_citation: 'NJ Stat 46:8-19',
      chunk_id: 'security-deposit-cap#section:1',
      reasoning: 'Reasoning text',
      recommended_action: 'Negotiate down to the statutory cap.',
    },
    audit_id: undefined,
  };
}

// Wrap ClausesList inside a ChatStreamProvider with the given initial
// tool events so the component reads them via useChatStream.
function renderWithEvents(events: ToolEvent[]): {
  scrollSpy: ReturnType<typeof vi.fn>;
  setActiveSpy: ReturnType<typeof vi.fn>;
} {
  const scrollSpy = vi.fn();
  const setActiveSpy = vi.fn();

  function Probe(): null {
    const { pdfViewerRef, setActiveClauseId } = useChatStream();
    // Install the spies onto the context's refs on first render.
    pdfViewerRef.current = { scrollToPage: scrollSpy };
    // setActiveClauseId itself is a stable function from the context;
    // we wrap the underlying state via the public API. The spy below
    // captures the calls. Implementation detail: useChatStream exposes
    // the setter directly, so we wrap it for assertion via a side
    // effect — we cannot replace the function. Instead, we spy on the
    // pdfViewerRef.scrollToPage call (which is the load-bearing
    // outcome) and read activeClauseId via DOM data attribute below.
    setActiveSpy.mockImplementation(setActiveClauseId);
    return null;
  }

  render(
    <AssistantFabProvider>
      <ChatStreamProvider initialEvents={events} viewerRole="Tenant">
        <Probe />
        <ClausesList />
      </ChatStreamProvider>
    </AssistantFabProvider>,
  );

  return { scrollSpy, setActiveSpy };
}

describe('ClausesList', () => {
  it('renders an empty-state hint when no extract_clauses event is present', () => {
    renderWithEvents([]);
    expect(screen.getByTestId('clauses-list')).toBeInTheDocument();
    expect(screen.getByTestId('clauses-list-empty')).toBeInTheDocument();
    expect(
      screen.getByTestId('clauses-list-empty').textContent?.toLowerCase(),
    ).toMatch(/no clauses/);
  });

  it('renders one row per clause from an extract_clauses event', () => {
    renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          clause_type: 'late_fee',
          page_number: 2,
        },
        {
          clause_id: 'c3',
          clause_index: 2,
          clause_type: 'sublet',
          page_number: 4,
        },
      ]),
    ]);
    const rows = screen.getAllByTestId('clauses-list-row');
    expect(rows).toHaveLength(3);
    // Rows show the human label + page meta.
    expect(rows[0].textContent).toContain('Security deposit');
    expect(rows[0].textContent).toContain('§1');
    expect(rows[1].textContent).toContain('Late fee');
    expect(rows[2].textContent).toContain('Subletting');
  });

  it('renders severity chips on graded rows; ungraded rows show a "—" placeholder', () => {
    renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          clause_type: 'late_fee',
          page_number: 2,
        },
      ]),
      gradingEvent({
        clause_id: 'c1',
        clause_index: 0,
        clause_type: 'security_deposit',
        page_number: 1,
        severity: 'high',
      }),
    ]);
    const rows = screen.getAllByTestId('clauses-list-row');
    expect(rows).toHaveLength(2);

    // First row (graded): contains the HIGH severity label text.
    expect(within(rows[0]).getByText(/high/i)).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute('data-severity', 'high');

    // Second row (ungraded): shows the "—" placeholder.
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('data-severity', 'pending');
  });

  it('latest-wins for repeated grade_clause_severity events on the same clause', () => {
    renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
      ]),
      gradingEvent({
        clause_id: 'c1',
        clause_index: 0,
        clause_type: 'security_deposit',
        page_number: 1,
        severity: 'low',
      }),
      gradingEvent({
        clause_id: 'c1',
        clause_index: 0,
        clause_type: 'security_deposit',
        page_number: 1,
        severity: 'high',
      }),
    ]);
    const row = screen.getByTestId('clauses-list-row');
    expect(row).toHaveAttribute('data-severity', 'high');
  });

  it('falls back to the gradings list when no extract_clauses event is present (seeded conversations)', () => {
    // Some pre-seeded conversation fixtures (e2e red-flag-interactions seed)
    // only carry gradings, not the canonical extract result. The component
    // should still surface a row per graded clause so users see what's been
    // analyzed.
    renderWithEvents([
      gradingEvent({
        clause_id: 'seed-a',
        clause_index: 0,
        clause_type: 'security_deposit',
        page_number: 1,
        severity: 'high',
      }),
      gradingEvent({
        clause_id: 'seed-b',
        clause_index: 1,
        clause_type: 'late_fee',
        page_number: 2,
        severity: 'medium',
      }),
    ]);
    expect(screen.getAllByTestId('clauses-list-row')).toHaveLength(2);
    expect(screen.queryByTestId('clauses-list-empty')).not.toBeInTheDocument();
  });

  it('clicking a row scrolls the PDF to the clause page', () => {
    const { scrollSpy } = renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 7,
        },
      ]),
    ]);
    const row = screen.getByTestId('clauses-list-row');
    fireEvent.click(row);
    expect(scrollSpy).toHaveBeenCalledWith(7);
  });

  it('each row is a real <button> with type="button" for keyboard reachability', () => {
    renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
      ]),
    ]);
    const row = screen.getByTestId('clauses-list-row');
    expect(row.tagName).toBe('BUTTON');
    expect(row).toHaveAttribute('type', 'button');
  });

  it('sorts rows by clause_index ascending (parser order, not severity)', () => {
    renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c3',
          clause_index: 2,
          clause_type: 'sublet',
          page_number: 4,
        },
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
        {
          clause_id: 'c2',
          clause_index: 1,
          clause_type: 'late_fee',
          page_number: 2,
        },
      ]),
    ]);
    const rows = screen.getAllByTestId('clauses-list-row');
    expect(rows[0].textContent).toContain('§1');
    expect(rows[1].textContent).toContain('§2');
    expect(rows[2].textContent).toContain('§3');
  });
});

// ===========================================================================
// Sprint 26c — Explain action wires into AssistantFabContext
// ===========================================================================
// (Imports for AssistantFabProvider/useAssistantFab already exist at the
// top of the file.)

describe('Sprint 26c — ClausesList Explain action', () => {
  afterEach(cleanup);

  function renderWithFab(events: ToolEvent[]): {
    fab: ReturnType<typeof useAssistantFab> | null;
  } {
    const ref: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      ref.fab = useAssistantFab();
      return null;
    }
    render(
      <AssistantFabProvider>
        <ChatStreamProvider initialEvents={events}>
          <Probe />
          <ClausesList />
        </ChatStreamProvider>
      </AssistantFabProvider>,
    );
    return ref;
  }

  it('each row renders an Explain icon button that opens the FAB drawer with the clause prefilled', () => {
    const ctx = renderWithFab([
      extractClausesEvent([
        {
          clause_id: 'c-explain',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
      ]),
    ]);
    const explain = screen.getByTestId('clauses-list-row-explain');
    expect(explain.tagName).toBe('BUTTON');
    expect(explain).toHaveAttribute('type', 'button');
    expect(explain).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/explain/i) as unknown as string,
    );
    fireEvent.click(explain);
    expect(ctx.fab?.state).toBe('drawer');
    expect(ctx.fab?.selection.clauseId).toBe('c-explain');
    expect(ctx.fab?.pendingPrompt?.toLowerCase()).toContain('explain');
    expect(ctx.fab?.pendingPrompt).toContain('§1');
  });

  it('clicking Explain does not also fire the row-level scrollToPage handler', () => {
    const { scrollSpy } = renderWithEvents([
      extractClausesEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          clause_type: 'security_deposit',
          page_number: 1,
        },
      ]),
    ]);
    // Use the renderWithEvents helper (no AssistantFabProvider) but mount
    // a minimal Fab provider so Explain doesn't throw.
    cleanup();

    function Wrapper(): React.JSX.Element {
      return (
        <AssistantFabProvider>
          <ChatStreamProvider
            initialEvents={[
              extractClausesEvent([
                {
                  clause_id: 'c1',
                  clause_index: 0,
                  clause_type: 'security_deposit',
                  page_number: 1,
                },
              ]),
            ]}
          >
            <ClausesListProbe />
            <ClausesList />
          </ChatStreamProvider>
        </AssistantFabProvider>
      );
    }

    function ClausesListProbe(): null {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = {
        scrollToPage: scrollSpy as unknown as (page: number) => void,
      };
      return null;
    }

    render(<Wrapper />);
    fireEvent.click(screen.getByTestId('clauses-list-row-explain'));
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
