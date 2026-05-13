// Sprint 13 §3f — left-pane PDF viewer.
//
// Tests target the inner client component (PdfViewer.client) so we
// exercise the real wiring without involving next/dynamic at unit-test
// time. react-pdf is mocked because it touches Worker / Canvas, neither
// of which work cleanly in happy-dom. The scrollToPage imperative API
// is published via ChatStreamContext.pdfViewerRef (set by
// useImperativeHandle inside the component) — RedFlagReport reads it
// from there.

import { cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatStreamProvider,
  useChatStream,
} from '@/components/chat/ChatStreamContext';

// react-pdf mock: deterministic, no Workers, no async loading.
vi.mock('react-pdf', () => ({
  Document: ({
    onLoadSuccess,
    children,
  }: {
    onLoadSuccess?: (data: { numPages: number }) => void;
    children?: React.ReactNode;
  }) => {
    if (onLoadSuccess) onLoadSuccess({ numPages: 3 });
    return <div data-testid="mock-pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <div data-testid="mock-pdf-page" data-page-number={pageNumber}>
      Page {pageNumber}
    </div>
  ),
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

import { PdfViewerClient } from './PdfViewer.client';

afterEach(cleanup);

const wrap = (children: ReactNode) => (
  <ChatStreamProvider>{children}</ChatStreamProvider>
);

describe('PdfViewerClient', () => {
  it('renders a Document and one Page per page after load', () => {
    render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
    expect(screen.getByTestId('mock-pdf-document')).toBeInTheDocument();
    expect(screen.getAllByTestId('mock-pdf-page')).toHaveLength(3);
  });

  it('publishes scrollToPage onto ChatStreamContext.pdfViewerRef after mount', () => {
    type Handle = { scrollToPage: (n: number) => void };
    const captured: { current: Handle | null } = { current: null };
    function Probe() {
      const { pdfViewerRef } = useChatStream();
      // Probe runs as a sibling AFTER PdfViewerClient mounts. By the
      // time React commits, useImperativeHandle has registered the
      // handle on the shared ref; useEffect with [] captures it once.
      // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot
      useEffect(() => {
        captured.current = pdfViewerRef.current;
      }, []);
      return null;
    }
    render(
      wrap(
        <>
          <PdfViewerClient pdfUrl="/sample.pdf" />
          <Probe />
        </>,
      ),
    );
    expect(captured.current).not.toBeNull();
    expect(typeof captured.current?.scrollToPage).toBe('function');
    expect(() => captured.current?.scrollToPage(2)).not.toThrow();
  });

  it('renders a placeholder when no pdfUrl is provided', () => {
    render(wrap(<PdfViewerClient pdfUrl={null} />));
    expect(screen.getByTestId('pdf-viewer-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-pdf-document')).not.toBeInTheDocument();
  });

  it('renders the header chrome with filename + page count when a lease is loaded', () => {
    render(
      wrap(
        <PdfViewerClient
          pdfUrl="/sample.pdf"
          filename="tenant-lease.pdf"
          pageCount={3}
          clauseCount={12}
        />,
      ),
    );
    const header = screen.getByTestId('pdf-viewer-header');
    expect(header).toBeInTheDocument();
    expect(screen.getByTestId('pdf-viewer-filename')).toHaveTextContent(
      'tenant-lease.pdf',
    );
    expect(header).toHaveTextContent(/3 pages/i);
    expect(header).toHaveTextContent(/12 clauses/i);
  });

  it('exposes a scroll-area container with overflow-y-auto for independent scrolling', () => {
    render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
    const scrollArea = screen.getByTestId('pdf-viewer-scroll-area');
    expect(scrollArea.className).toMatch(/overflow-y-auto/);
    expect(scrollArea.className).toMatch(/min-h-0/);
    expect(scrollArea.className).toMatch(/flex-1/);
  });

  it('falls back to "Lease document" when no filename is supplied', () => {
    render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
    expect(screen.getByTestId('pdf-viewer-filename')).toHaveTextContent(
      'Lease document',
    );
  });

  // Sprint 23b Phase 3 — two-row dock header. Row 1 = filename + parsed
  // pill; row 2 = page/clause meta + reading controls (compact) + expand
  // button. Supersedes the S20.6 "no reading controls in inline" decision:
  // compact mode lets the controls fit inside the inline pane without
  // crowding the filename row.
  describe('Sprint 23b — two-row dock header', () => {
    it('row 1 carries the filename, the parsed/failed pill, and the Expand button', () => {
      render(
        wrap(
          <PdfViewerClient
            pdfUrl="/sample.pdf"
            filename="tenant-lease.pdf"
            pageCount={3}
            clauseCount={12}
          />,
        ),
      );
      const row1 = screen.getByTestId('pdf-viewer-header-row1');
      expect(row1).toHaveTextContent('tenant-lease.pdf');
      // The Parsed pill renders when numPages > 0 (3 in this test).
      expect(row1).toHaveTextContent(/parsed/i);
      // Sprint 23b Phase 6.1 — Expand moved from row 2 to row 1 so the
      // affordance sits next to the Parsed pill and row 2 has room for
      // the metadata + reading controls without overflow.
      const expand = screen.getByTestId('pdf-viewer-expand');
      expect(row1.contains(expand)).toBe(true);
    });

    it('row 2 carries the page/clause meta, uses surface-sunken, and flex-wraps', () => {
      render(
        wrap(
          <PdfViewerClient
            pdfUrl="/sample.pdf"
            filename="tenant-lease.pdf"
            pageCount={3}
            clauseCount={12}
          />,
        ),
      );
      const row2 = screen.getByTestId('pdf-viewer-header-row2');
      expect(row2).toHaveTextContent(/3 pages/i);
      expect(row2).toHaveTextContent(/12 clauses/i);
      expect(row2.className).toMatch(/\bbg-surface-sunken\b/);
      // Sprint 23b Phase 6.1 — flex-wrap so at very narrow pane widths
      // the metadata + reading controls stack instead of overlapping.
      expect(row2.className).toMatch(/\bflex-wrap\b/);
    });

    it('Expand button is NOT in row 2 (moved to row 1 in Phase 6.1)', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" pageCount={2} />));
      const row2 = screen.getByTestId('pdf-viewer-header-row2');
      const expand = screen.getByTestId('pdf-viewer-expand');
      expect(row2.contains(expand)).toBe(false);
    });

    it('inline mode renders compact reading controls (zoom + fit + Page N)', () => {
      // Supersedes the S20.6 "inline = no controls" decision. Compact mode
      // hides the visible "Fit width" text and drops the "/ Total" suffix,
      // so the controls fit beside the metadata at narrow pane widths.
      render(
        wrap(
          <PdfViewerClient
            pdfUrl="/sample.pdf"
            filename="tenant-lease.pdf"
            pageCount={3}
            clauseCount={12}
          />,
        ),
      );
      expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/fit.*width/i)).toBeInTheDocument();
      // Compact form — no visible "Fit width" text.
      expect(screen.queryByText(/^Fit width$/)).not.toBeInTheDocument();
      const indicator = screen.getByTestId('pdf-page-indicator');
      // Compact form drops "/ Total".
      expect(indicator.textContent).not.toMatch(/\/\s*3/);
    });

    it('focus mode (hideFocusToggle) renders full-form reading controls', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" hideFocusToggle />));
      expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/fit.*width/i)).toBeInTheDocument();
      // Full form — visible "Fit width" text node is in the DOM (the
      // sm:inline class is media-query-driven; jsdom keeps the node).
      expect(screen.getByText(/^Fit width$/)).toBeInTheDocument();
      expect(screen.getByTestId('pdf-page-indicator')).toBeInTheDocument();
      expect(screen.queryByTestId('pdf-viewer-expand')).not.toBeInTheDocument();
    });
  });
});
