// Sprint 26b Phase 3 — red test.
//
// Mode-B composition root. Header strip + two-pane layout (PDF | results
// stack) + temporary chat slot + FAB stub. Reads ChatStreamContext for
// active-lease + tool events; reuses RedFlagReport, ClausesList,
// ScanTimeline, ChatUI, PdfViewer, AssistantFabStub, useLeftPaneState.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// PdfViewer is a dynamic import that touches DOMMatrix / Worker. Mock
// it to a minimal stub so the shell composition test focuses on layout.
vi.mock('./PdfViewer', () => ({
  PdfViewer: (props: Record<string, unknown>) => (
    <div data-testid="pdf-viewer-mock" data-pdf-url={String(props.pdfUrl)}>
      PdfViewer mock
    </div>
  ),
}));

// Sprint 26c — the temporary chat slot is gone. The real assistant
// lives inside the FAB; mock it to a thin marker so the shell-composition
// test doesn't try to mount the heavy ChatUI subtree.
vi.mock('@/components/chat/AssistantFab', () => ({
  AssistantFab: () => (
    <button
      type="button"
      data-testid="assistant-fab"
      aria-label="Open assistant"
    >
      Open assistant
    </button>
  ),
}));

import { ParserResultsShell } from './ParserResultsShell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const baseProps = {
  initialMessages: [],
  conversationId: 'conv-1',
  workspaceName: 'Demo workspace',
  viewerRole: 'Tenant' as const,
  initialToolEvents: [],
  initialActiveLease: {
    lease_id: 'lease-1',
    filename: 'sample.pdf',
    page_count: 18,
    clause_count: 13,
    pdfUrl: 'blob:mock-pdf',
  },
};

describe('ParserResultsShell', () => {
  it('renders the parser-results-shell root container', () => {
    render(<ParserResultsShell {...baseProps} />);
    expect(screen.getByTestId('parser-results-shell')).toBeInTheDocument();
  });

  it('renders the header strip with filename + page count + clause count', () => {
    render(<ParserResultsShell {...baseProps} />);
    const header = screen.getByTestId('results-header');
    expect(header).toBeInTheDocument();
    expect(header.textContent).toContain('sample.pdf');
    expect(header.textContent).toMatch(/18\s*pages?/i);
    expect(header.textContent).toMatch(/13\s*clauses?/i);
  });

  it('renders a Replace button that fires onReplace + resets the conversation', () => {
    const onReplace = vi.fn();
    render(<ParserResultsShell {...baseProps} onReplace={onReplace} />);
    expect(screen.getByTestId('pdf-viewer-mock')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('results-replace-button'));

    // onReplace is the upward channel — router shell will use it to
    // unmount Mode B and return to Mode A.
    expect(onReplace).toHaveBeenCalledTimes(1);

    // Local context is also cleared so an isolated mount (no router)
    // visibly drops the PDF pane.
    expect(screen.queryByTestId('pdf-viewer-mock')).not.toBeInTheDocument();
  });

  it('mounts PdfViewer in the left pane when activeLease has a pdfUrl', () => {
    render(<ParserResultsShell {...baseProps} />);
    const pdfPane = screen.getByTestId('results-pdf-pane');
    expect(pdfPane).toBeInTheDocument();
    expect(pdfPane).toHaveAttribute('data-state', 'loaded');
    expect(screen.getByTestId('pdf-viewer-mock')).toBeInTheDocument();
  });

  it('renders the results stack with RedFlagReport and ClausesList in order; no inline chat slot in 26c', () => {
    render(<ParserResultsShell {...baseProps} />);
    const stack = screen.getByTestId('results-stack');
    expect(stack).toBeInTheDocument();

    // Sprint 27 — with an active lease present, RedFlagReport's
    // lifecycle panel (data-testid="red-flag-report-scanning") mounts
    // instead of the bare empty state. That confirms the component is
    // in the tree.
    expect(
      screen.getByTestId('red-flag-report-scanning'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('clauses-list')).toBeInTheDocument();
    // Sprint 26c — temporary chat slot is deleted. Chat lives in the FAB.
    expect(screen.queryByTestId('results-chat-slot')).not.toBeInTheDocument();

    // Order: red flags first, then clauses.
    const stackHtml = stack.innerHTML;
    const idxRedFlags = stackHtml.indexOf('red-flag-report-scanning');
    const idxClauses = stackHtml.indexOf('clauses-list');
    expect(idxRedFlags).toBeGreaterThan(-1);
    expect(idxClauses).toBeGreaterThan(idxRedFlags);
  });

  it('mounts the real AssistantFab (no stub) in Mode B', () => {
    render(<ParserResultsShell {...baseProps} />);
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-fab-stub')).not.toBeInTheDocument();
  });
});
