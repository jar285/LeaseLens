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

  // S20.6 — header cleanup. The inline pane is a preview surface, not a
  // reading surface; reading controls (zoom / fit / page indicator)
  // moved into Focus mode where they have room. The inline header
  // keeps only file metadata + Expand + Parsed pill.
  describe('S20.6 — inline header is preview-density (no reading controls)', () => {
    it('does not render the zoom buttons in the inline header', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
      expect(screen.queryByLabelText(/zoom in/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/zoom out/i)).not.toBeInTheDocument();
    });

    it('does not render the fit-width toggle in the inline header', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
      expect(screen.queryByLabelText(/fit.*width/i)).not.toBeInTheDocument();
    });

    it('does not render the page indicator in the inline header', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
      expect(
        screen.queryByTestId('pdf-page-indicator'),
      ).not.toBeInTheDocument();
    });

    it('still renders the Expand button as the gateway to Focus mode', () => {
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" />));
      expect(screen.getByTestId('pdf-viewer-expand')).toBeInTheDocument();
    });

    it('renders the reading controls inside Focus mode (hideFocusToggle=true variant)', () => {
      // The inner PdfViewer rendered inside the focus dialog skips the
      // Expand button (hideFocusToggle=true) and gains the reading
      // controls — the only surface where they belong.
      render(wrap(<PdfViewerClient pdfUrl="/sample.pdf" hideFocusToggle />));
      expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/fit.*width/i)).toBeInTheDocument();
      expect(screen.getByTestId('pdf-page-indicator')).toBeInTheDocument();
      expect(screen.queryByTestId('pdf-viewer-expand')).not.toBeInTheDocument();
    });
  });
});
