// Sprint 13 §3f / Phase 10 hotfix — client-only PdfViewer wrapper.
//
// react-pdf touches `DOMMatrix` and `Worker` at module-init time, which
// crashes Next.js's server-side render. Loading the real implementation
// through `next/dynamic({ ssr: false })` defers the import until the
// component actually mounts in the browser.
//
// The scrollToPage imperative API is published via ChatStreamContext
// (see PdfViewer.client) rather than through a forwarded ref, so this
// wrapper stays plumbing-free.

'use client';

import dynamic from 'next/dynamic';

export type { PdfViewerClientProps as PdfViewerProps } from './PdfViewer.client';

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
}

export const PdfViewer = dynamic(
  () => import('./PdfViewer.client').then((m) => m.PdfViewerClient),
  {
    ssr: false,
    loading: () => (
      <div
        data-testid="pdf-viewer-loading"
        className="flex h-full items-center justify-center bg-surface-muted text-sm text-fg-muted dark:bg-neutral-950"
      >
        <p>Loading PDF viewer…</p>
      </div>
    ),
  },
);
