'use client';

/*
 * S20.2 — header-level PDF reading controls.
 *
 * Compact zoom in / out, fit-width toggle, and a "Page N / Total"
 * indicator. The component is pure presentation — zoom level and
 * fit-width state are owned by the parent PdfViewerClient and flow
 * back in via props + callbacks. Keeping it stateless makes the
 * Focus-mode dialog (which mounts its own PdfViewer) trivial to
 * support: both instances render their own controls reading their own
 * state without sharing any global zoom.
 */

import { ChevronLeft, ChevronRight, Maximize, Minus, Plus } from 'lucide-react';

export const PDF_ZOOM_MIN = 0.5;
export const PDF_ZOOM_MAX = 2;

export interface PdfReadingControlsProps {
  zoom: number;
  fit: boolean;
  /** Page currently most-visible in the scroll viewport, 1-indexed. */
  currentPage: number | null;
  totalPages: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleFit: () => void;
  /**
   * Sprint 23h — page navigation. When provided, render Prev/Next page
   * buttons flanking the page indicator. Disabled state is driven by
   * the parent via `canGoPrev` / `canGoNext` so the parent owns the
   * "are we at an edge" computation (it already knows numPages +
   * currentPage). Omit these props in tests or read-only contexts to
   * fall back to indicator-only rendering.
   */
  onPrevPage?: () => void;
  onNextPage?: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  /**
   * Sprint 23b Phase 2 — when true, render in compact form for the
   * inline (non-focus) viewer header where pane width is tight: the
   * visible "Fit width" text is hidden (aria-label preserved), and the
   * page indicator drops the "/ Total" suffix. Defaults to false; Focus
   * mode does not pass this and keeps the full presentation.
   */
  compact?: boolean;
}

const BUTTON_BASE =
  'inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-surface-card px-2 text-[11px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200';

export function PdfReadingControls({
  zoom,
  fit,
  currentPage,
  totalPages,
  onZoomIn,
  onZoomOut,
  onToggleFit,
  onPrevPage,
  onNextPage,
  canGoPrev = false,
  canGoNext = false,
  compact = false,
}: PdfReadingControlsProps): React.JSX.Element {
  const atMin = zoom <= PDF_ZOOM_MIN;
  const atMax = zoom >= PDF_ZOOM_MAX;
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <div
      data-testid="pdf-reading-controls"
      className="flex shrink-0 items-center gap-1"
    >
      {/* S20.7 — zoom buttons stay enabled even when Fit Width is on.
          The parent's onZoomIn/onZoomOut handlers turn Fit Width off
          in the same step, so users don't have to dance between two
          controls just to bump zoom from "75%" to "100%". The visible
          zoom percentage stays accurate (snapshots whatever Fit Width
          calculated) and the button click commits to that as the new
          manual zoom baseline. */}
      <button
        type="button"
        aria-label="Zoom out"
        onClick={onZoomOut}
        disabled={atMin}
        className={BUTTON_BASE}
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className="tabular w-10 text-center text-[11px] text-fg-muted"
      >
        {zoomLabel}
      </span>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={onZoomIn}
        disabled={atMax}
        className={BUTTON_BASE}
      >
        <Plus className="h-3 w-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Fit width"
        aria-pressed={fit}
        onClick={onToggleFit}
        className={`${BUTTON_BASE} ${
          fit
            ? 'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-400/40 dark:bg-accent-500/10 dark:text-accent-200'
            : ''
        }`}
      >
        <Maximize className="h-3 w-3" aria-hidden="true" />
        {!compact ? <span className="hidden sm:inline">Fit width</span> : null}
      </button>
      {/* Sprint 23h — Prev/Next page buttons flank the page indicator.
          Only rendered when the parent wires `onPrevPage` / `onNextPage`;
          falls back to indicator-only when the props are omitted (the
          shape the older tests + the no-navigation contexts expect). */}
      {onPrevPage ? (
        <button
          type="button"
          aria-label="Previous page"
          data-testid="pdf-prev-page"
          onClick={onPrevPage}
          disabled={!canGoPrev}
          className={`${BUTTON_BASE} ml-1`}
        >
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      <span
        data-testid="pdf-page-indicator"
        className="tabular ml-1 text-[11px] text-fg-muted"
        aria-live="polite"
      >
        {compact
          ? `Page ${currentPage ?? '—'}`
          : `Page ${currentPage ?? '—'} / ${totalPages > 0 ? totalPages : '—'}`}
      </span>
      {onNextPage ? (
        <button
          type="button"
          aria-label="Next page"
          data-testid="pdf-next-page"
          onClick={onNextPage}
          disabled={!canGoNext}
          className={BUTTON_BASE}
        >
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
