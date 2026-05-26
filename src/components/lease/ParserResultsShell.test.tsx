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

  it('Replace button asks for confirmation before resetting the workspace', () => {
    // Sprint 28.9 — Replace is the destructive path. Per Don Norman's
    // "prevent accidental destructive action", we require an explicit
    // confirm before tearing down the workspace.
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const onReplace = vi.fn();
    render(<ParserResultsShell {...baseProps} onReplace={onReplace} />);
    expect(screen.getByTestId('pdf-viewer-mock')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('results-replace-button'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // The confirmation copy must name what's about to be lost so a
    // first-time user understands the click is destructive.
    expect(confirmSpy.mock.calls[0][0]).toMatch(/lease/i);
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('pdf-viewer-mock')).not.toBeInTheDocument();
  });

  it('Replace button is a no-op when the confirm prompt is cancelled', () => {
    // Sprint 28.9 — cancelling the confirm leaves the workspace intact.
    const confirmSpy = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirmSpy);
    const onReplace = vi.fn();
    render(<ParserResultsShell {...baseProps} onReplace={onReplace} />);
    expect(screen.getByTestId('pdf-viewer-mock')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('results-replace-button'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
    // PDF still visible — workspace preserved.
    expect(screen.getByTestId('pdf-viewer-mock')).toBeInTheDocument();
  });

  it('Replace revokes the active Blob URL after the user confirms', () => {
    // Sprint 28.9 — the Blob URL lifecycle moved from chat-thread
    // resets (Sprint 4 removed that path) onto the explicit Reset
    // workspace flow. Revoking here prevents the leak that the old
    // ChatUI commit-boundary revoke used to handle.
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const revokeSpy = vi.fn();
    global.URL.revokeObjectURL = revokeSpy;
    render(<ParserResultsShell {...baseProps} />);

    fireEvent.click(screen.getByTestId('results-replace-button'));

    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-pdf');
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
    expect(screen.getByTestId('red-flag-report-scanning')).toBeInTheDocument();
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
