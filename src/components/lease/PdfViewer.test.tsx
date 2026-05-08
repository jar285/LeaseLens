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
});
