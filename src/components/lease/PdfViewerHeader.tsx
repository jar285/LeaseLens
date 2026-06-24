'use client';

/*
 * Sprint 23b → 55.2 — PDF viewer dock header (pure presenter).
 *
 * Sprint 23b Phase 3 — two-row dock header.
 *   Row 1: brand icon + filename + parsed/failed pill + expand button.
 *   Row 2: page/clause meta + reading controls (secondary), set on
 *   `bg-surface-sunken` so the two visual registers separate cleanly.
 * Sprint 23b Phase 6.1 — Expand moved from row 2 to row 1 and row 2 takes
 *   flex-wrap so reading controls reflow under the metadata at very narrow
 *   pane widths instead of overlapping.
 *
 * Sprint 55.2 — extracted from PdfViewer.client.tsx as a render-phase-safe
 * presenter. The viewer keeps the <Document> loop, observers, refs, and all
 * state; the header receives derived values (filename / loadError / numPages /
 * page-nav flags) + callbacks as props, so it never touches react-pdf or the
 * parser context itself (Robert C. Martin: presentation split from
 * orchestration/state). The pdf-viewer-header* testids + the
 * `compact={!hideFocusToggle}` reading-controls contract are unchanged.
 */

import { Maximize2, ScrollText } from 'lucide-react';
import { PdfReadingControls } from './PdfReadingControls';

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export interface PdfViewerHeaderProps {
  filename?: string | null;
  loadError: string | null;
  numPages: number;
  clauseCount?: number | null;
  /**
   * When true the header omits its own Expand button (the inner viewer
   * rendered inside PdfFocusDialog), and the reading controls render in their
   * full (non-compact) form.
   */
  hideFocusToggle: boolean;
  onExpand: () => void;
  // Reading-control state + handlers, threaded straight through to
  // PdfReadingControls (the viewer owns this state).
  zoom: number;
  fit: boolean;
  currentPage: number | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFit: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
}

export function PdfViewerHeader({
  filename,
  loadError,
  numPages,
  clauseCount,
  hideFocusToggle,
  onExpand,
  zoom,
  fit,
  currentPage,
  onZoomIn,
  onZoomOut,
  onToggleFit,
  onPrevPage,
  onNextPage,
  canGoPrev,
  canGoNext,
}: PdfViewerHeaderProps): React.JSX.Element {
  return (
    <header
      data-testid="pdf-viewer-header"
      className="flex shrink-0 flex-col border-b border-neutral-100 dark:border-neutral-800"
    >
      <div
        data-testid="pdf-viewer-header-row1"
        className="flex items-center justify-between gap-3 bg-surface-card px-3 py-2 dark:bg-neutral-900"
      >
        <div className="flex min-w-0 items-center gap-2 text-[13px] leading-tight">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
          >
            <ScrollText className="h-3 w-3" strokeWidth={2.25} />
          </span>
          <span
            data-testid="pdf-viewer-filename"
            title={filename ?? 'Lease document'}
            className="truncate font-medium text-fg-default"
          >
            {filename ?? 'Lease document'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {loadError ? (
            <span className="rounded-full bg-danger-100 px-2 py-0.5 text-[11px] font-medium text-danger-600 dark:bg-danger-600/15 dark:text-danger-100">
              Failed
            </span>
          ) : numPages > 0 ? (
            <span className="rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-medium text-success-600 dark:bg-success-600/15 dark:text-success-100">
              Parsed
            </span>
          ) : null}
          {!hideFocusToggle ? (
            <button
              type="button"
              aria-label="Expand to full viewport"
              data-testid="pdf-viewer-expand"
              onClick={onExpand}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-neutral-200 bg-surface-card px-2 text-[11px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            >
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <div
        data-testid="pdf-viewer-header-row2"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 bg-surface-sunken px-3 py-1.5"
      >
        <div
          data-testid="pdf-viewer-meta"
          className="flex min-w-0 items-center gap-2 text-[11px] leading-tight text-fg-muted"
        >
          <span className="shrink-0">
            {numPages > 0 ? pluralize(numPages, 'page') : 'Loading…'}
          </span>
          {typeof clauseCount === 'number' ? (
            <>
              <span className="shrink-0" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0">
                {pluralize(clauseCount, 'clause')}
              </span>
            </>
          ) : null}
        </div>
        <PdfReadingControls
          zoom={zoom}
          fit={fit}
          currentPage={currentPage}
          totalPages={numPages}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onToggleFit={onToggleFit}
          onPrevPage={onPrevPage}
          onNextPage={onNextPage}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          compact={!hideFocusToggle}
        />
      </div>
    </header>
  );
}
