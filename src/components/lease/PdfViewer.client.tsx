// Sprint 13 §3f / Phase 10 hotfix — real PdfViewer implementation.
//
// Imports react-pdf at module top, so this file MUST be loaded only on
// the client (react-pdf touches DOMMatrix / Worker at module-init time
// and would crash during Next.js server rendering). The thin wrapper
// in `./PdfViewer.tsx` uses `next/dynamic({ ssr: false })` to enforce
// that boundary.
//
// The scrollToPage handle is published into ChatStreamContext.pdfViewerRef
// instead of being forwarded through a `ref` prop. Going through context
// keeps the dynamic wrapper free of ref-forwarding plumbing and matches
// how RedFlagReport already consumes the ref (Phase 9).
//
// Phase 10.5 — added a header chrome row (filename + page count + status
// pill), a paper-card per page with shadow, and a responsive Page width
// driven by ResizeObserver so the rendered PDF always fills the available
// pane width without overflow. The wrapper uses the canonical
// `flex-1 min-h-0 overflow-y-auto` scroll chain (Ordo pattern), so the
// pane scrolls independently of the chat and right rails.

'use client';

// Sprint 13 / Phase 10 hotfix — polyfill MUST import before react-pdf
// so URL.parse exists when pdfjs's `getUrlProp` runs. ES module
// imports are evaluated in source order; this side-effect import
// patches the global before the next import line touches pdfjs.
import './url-parse-polyfill';
import { MapPin, Maximize2, ScrollText } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useLeaseParser } from './LeaseParserContext';
import { PdfFocusDialog } from './PdfFocusDialog';
import {
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  PdfReadingControls,
} from './PdfReadingControls';

// Worker is served as a static asset from /public. The
// `new URL('pdfjs-dist/...', import.meta.url)` pattern that
// react-pdf's README recommends does not resolve reliably under
// Turbopack for deep package paths — the URL is silently 404 and
// pdfjs hangs on "Loading PDF…". Pointing at /public sidesteps
// bundler asset detection entirely. The file is kept in sync with
// node_modules by the `postinstall` npm script.
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

const MIN_PAGE_WIDTH = 280;
// S20.1 — let the page canvas grow to ~1100 px so a widened left
// pane (or full-viewport Focus mode in S20.2) can actually render
// the document at a comfortable reading width.
const MAX_PAGE_WIDTH = 1100;
const FALLBACK_WIDTH = 560;

// Phase 10.8 — keep these in sync with the operator-facing labels
// in RedFlagReport so the sticky callout reads the same.
const CLAUSE_TYPE_LABEL: Record<string, string> = {
  security_deposit: 'Security deposit',
  late_fee: 'Late fee',
  early_termination: 'Early termination',
  sublet: 'Subletting',
  repair: 'Repairs',
  entry: 'Landlord entry',
  retaliation: 'Retaliation',
  automatic_renewal: 'Auto-renewal',
  attorneys_fees: "Attorneys' fees",
  indemnification: 'Indemnification',
  jury_waiver: 'Jury trial waiver',
  pet: 'Pets',
  parking: 'Parking',
  unknown: 'Other clause',
};

export interface PdfViewerClientProps {
  pdfUrl: string | null;
  filename?: string | null;
  pageCount?: number | null;
  clauseCount?: number | null;
  /**
   * S20.2 — when true the viewer omits its own Expand button. Set by
   * the inner viewer rendered inside PdfFocusDialog so the focused
   * surface doesn't offer a "focus inside focus" recursion.
   */
  hideFocusToggle?: boolean;
}

const ZOOM_STEP = 0.25;

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function PdfViewerClient({
  pdfUrl,
  filename,
  pageCount: pageCountProp,
  clauseCount,
  hideFocusToggle = false,
}: PdfViewerClientProps): React.JSX.Element {
  const { pdfViewerRef, activeClauseId, toolEvents } = useLeaseParser();
  const [numPages, setNumPages] = useState<number>(pageCountProp ?? 0);
  const [containerWidth, setContainerWidth] = useState<number>(FALLBACK_WIDTH);
  const [loadError, setLoadError] = useState<string | null>(null);

  // S20.2 — reading-control state.
  const [zoom, setZoom] = useState<number>(1);
  const [fit, setFit] = useState<boolean>(true);
  const [focused, setFocused] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);

  const scrollAreaRef = useRef<HTMLElement | null>(null);
  // Sprint 23h fix — separate ref for the inner page container (the
  // <div className="mx-auto flex w-full flex-col gap-3 max-w-5xl">).
  // Measuring this directly gives the exact width pages should render
  // at; measuring the outer <section> instead (which has px-4 padding
  // + a max-w-5xl child cap) under-counted by 16 px and overcounted by
  // up to 76 px depending on viewport, causing the canvas to render
  // wider than its <div className="overflow-hidden ..."> wrapper and
  // clip the right edge of the text layer.
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  // S20.7 — smart zoom: clicking +/- auto-disables Fit Width so the
  // user gets the zoom change in one click instead of two. Without
  // this, the buttons sat disabled-looking while Fit Width was on and
  // the displayed "75%" looked unresponsive.
  const handleZoomIn = useCallback(() => {
    setFit(false);
    setZoom((z) => Math.min(PDF_ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  }, []);
  const handleZoomOut = useCallback(() => {
    setFit(false);
    setZoom((z) => Math.max(PDF_ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  }, []);
  const handleToggleFit = useCallback(() => {
    setFit((f) => !f);
  }, []);

  // Phase 10.8 — resolve the active clause's page + label from the
  // most-recent grade_clause_severity event for that clause_id. We
  // derive these here (instead of plumbing them into context) so the
  // context stays minimal and one source of truth remains the tool
  // event stream.
  const activeFinding = useMemo(() => {
    if (!activeClauseId) return null;
    for (let i = toolEvents.length - 1; i >= 0; i--) {
      const e = toolEvents[i];
      if (e.tool_name !== 'grade_clause_severity') continue;
      const r = e.result as
        | {
            clause_id?: string;
            page_number?: number;
            clause_type?: string;
            clause_index?: number;
          }
        | null
        | undefined;
      if (r && r.clause_id === activeClauseId) return r;
    }
    return null;
  }, [activeClauseId, toolEvents]);
  const activePageNumber = activeFinding?.page_number;
  const activeLabel = activeFinding?.clause_type
    ? (CLAUSE_TYPE_LABEL[activeFinding.clause_type] ??
      CLAUSE_TYPE_LABEL.unknown)
    : null;
  const activeClauseIndex = activeFinding?.clause_index;

  // Sprint 23g (kept in 23h) — extracted into a callback so both the
  // imperative handle (for external scrollToPage calls from CitationChip
  // / red-flag cards) AND the new prev/next buttons + keyboard navigation
  // share the exact same scroll behaviour. One source of truth.
  const scrollToPageNumber = useCallback((page: number) => {
    if (page < 1 || page > pageRefs.current.length) return;
    const el = pageRefs.current[page - 1];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useImperativeHandle(
    pdfViewerRef,
    () => ({
      scrollToPage: scrollToPageNumber,
    }),
    [scrollToPageNumber],
  );

  // Sprint 23h — page-navigation derived state. `currentPage` is set by
  // the IntersectionObserver further down; before the user has scrolled
  // (or in test environments where IO doesn't fire), it can be null.
  // Treat null as "page 1" so the Next button is enabled on a fresh
  // upload — ArrowRight / clicking Next should advance to page 2 from
  // the initial state.
  const effectiveCurrentPage = currentPage ?? 1;
  const canGoPrev = effectiveCurrentPage > 1;
  const canGoNext = effectiveCurrentPage < numPages;
  const handlePrevPage = useCallback(() => {
    if (effectiveCurrentPage > 1) scrollToPageNumber(effectiveCurrentPage - 1);
  }, [effectiveCurrentPage, scrollToPageNumber]);
  const handleNextPage = useCallback(() => {
    if (effectiveCurrentPage < numPages)
      scrollToPageNumber(effectiveCurrentPage + 1);
  }, [effectiveCurrentPage, numPages, scrollToPageNumber]);

  // Sprint 23h — keyboard navigation. ArrowLeft / ArrowRight advance
  // pages when the PDF scroll area has focus. ArrowUp / ArrowDown are
  // deliberately NOT hijacked so the browser's native line-by-line
  // scroll keeps working. We also bail when the user has an active text
  // selection — extending a selection with arrow keys must not trigger
  // page navigation.
  const handleScrollAreaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const selection =
        typeof window !== 'undefined' ? window.getSelection() : null;
      if (selection && selection.toString().length > 0) return;
      if (event.key === 'ArrowLeft' && canGoPrev) {
        event.preventDefault();
        handlePrevPage();
      } else if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        handleNextPage();
      }
    },
    [canGoPrev, canGoNext, handlePrevPage, handleNextPage],
  );

  // Responsive Page width — measure the inner page container directly
  // (the `<div className="mx-auto flex w-full flex-col gap-3 ...">`)
  // and pass its clientWidth straight through as the <Page> `width`
  // prop. This auto-accounts for both the outer <section>'s `px-4`
  // padding AND the `max-w-5xl` cap on the inner container, so the
  // canvas always renders at exactly the width its wrapper will accept.
  // Sprint 23h root-cause fix — the previous version measured the
  // outer scroll <section> and subtracted a hard-coded `16` for
  // padding, but `px-4` is 32 px total (16 each side), so the canvas
  // came out 16 px too wide and got right-clipped by the page card's
  // `overflow-hidden`. See Context7 react-pdf docs: "use ResizeObserver
  // to measure the parent and pass width prop."
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = () => {
      const el = pageContainerRef.current;
      if (!el) return;
      const next = Math.max(
        MIN_PAGE_WIDTH,
        Math.min(MAX_PAGE_WIDTH, el.clientWidth),
      );
      setContainerWidth(next);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (pageContainerRef.current) ro.observe(pageContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // S20.2 — IntersectionObserver drives the "Page N / Total" indicator.
  // The page-element whose intersection ratio is highest at any moment
  // is the page the user is reading.
  useEffect(() => {
    if (typeof window === 'undefined' || numPages === 0) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the largest intersectionRatio currently
        // visible. If none intersect at all, leave currentPage alone.
        let best: { page: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = (entry.target as HTMLElement).dataset.pageNumber;
          const page = raw ? Number(raw) : Number.NaN;
          if (Number.isFinite(page)) {
            if (!best || entry.intersectionRatio > best.ratio) {
              best = { page, ratio: entry.intersectionRatio };
            }
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root: scrollAreaRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [numPages]);

  // Effective page width: fit-to-container by default, multiplied by
  // the user-selected zoom otherwise. The MAX_PAGE_WIDTH clamp still
  // applies so zooming on a wide viewport doesn't produce a 2200 px
  // canvas — pdfjs would still render it but performance degrades.
  const effectivePageWidth = fit
    ? containerWidth
    : Math.min(
        MAX_PAGE_WIDTH,
        Math.max(MIN_PAGE_WIDTH, Math.round(containerWidth * zoom)),
      );

  if (!pdfUrl) {
    return (
      <div
        data-testid="pdf-viewer-empty"
        className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-surface-muted p-8 text-center dark:bg-neutral-900"
      >
        <p className="text-sm text-fg-muted">
          Upload a NJ lease PDF to view it here.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="pdf-viewer"
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-surface-muted dark:bg-neutral-950"
    >
      {/* Sprint 23b Phase 3 — two-row dock header.
          Row 1: brand icon + filename + parsed/failed pill + expand button.
          Row 2: page/clause meta + reading controls (secondary),
          set on `bg-surface-sunken` so the two visual registers separate
          cleanly.
          Sprint 23b Phase 6.1 — Expand moved from row 2 to row 1 and
          row 2 takes flex-wrap so reading controls reflow under the
          metadata at very narrow pane widths instead of overlapping. */}
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
                onClick={() => setFocused(true)}
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
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onToggleFit={handleToggleFit}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            canGoPrev={canGoPrev}
            canGoNext={canGoNext}
            compact={!hideFocusToggle}
          />
        </div>
      </header>

      {/* Scrollable pages area — canonical Ordo-style scroll chain.
          flex-1 + min-h-0 + overflow-y-auto on the same node so the
          parent flex grants it height and the child gets its own
          independent scrollbar. overscroll-contain prevents the
          chat pane from rubber-band-scrolling when this hits its end. */}
      {/* Sprint 23h — semantic <section> + aria-label gives screen readers
          a landmark identity, tabIndex + onKeyDown enable ArrowLeft /
          ArrowRight page navigation when the region has keyboard focus.
          The biome-ignore below carves out the WAI-ARIA "scrollable
          region with keyboard nav" pattern that doesn't map to a built-in
          interactive element (same precedent as the resize-handle pattern
          in ResizableSplitLayout — handoff §21 "biome-ignore-all" note). */}
      <section
        ref={scrollAreaRef}
        data-testid="pdf-viewer-scroll-area"
        aria-label="Lease document. Use arrow left and arrow right to navigate pages."
        // biome-ignore lint/a11y/noNoninteractiveTabindex: tabIndex is required so the <section> can receive keyboard focus for ArrowLeft/Right page nav.
        tabIndex={0}
        onKeyDown={handleScrollAreaKeyDown}
        // Sprint 23h root-cause fix — `overflow-auto` (was
        // `overflow-y-auto`) allows the section to scroll both axes.
        // When the user zooms past fit-width, the page canvases become
        // wider than the visible content area; this lets them pan
        // horizontally to see the right edge of every page. At
        // fit-width the page canvas is now exactly container-width
        // (see measure() above), so no horizontal scrollbar appears
        // until the user actually zooms in.
        className="relative flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-inset"
      >
        {/* Phase 10.8 — sticky callout. Pinned to the top of the
            scroll area while a clause is active, fades out with the
            highlight. Communicates the connection between the right-
            pane card and the left-pane page without a redesign. */}
        {activeClauseId && activePageNumber ? (
          <div
            data-testid="pdf-viewer-active-callout"
            className="pointer-events-none sticky top-0 z-raised mb-2 flex justify-center"
          >
            <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-surface-card/95 px-3 py-1 text-[11px] font-medium text-accent-700 shadow-sm backdrop-blur dark:border-accent-500/40 dark:bg-neutral-900/95 dark:text-accent-300">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {activeLabel ?? 'Clause'}
              {typeof activeClauseIndex === 'number'
                ? ` · §${activeClauseIndex + 1}`
                : null}
              {' · page '}
              {activePageNumber}
            </div>
          </div>
        ) : null}

        <div
          ref={pageContainerRef}
          className={`mx-auto flex w-full flex-col gap-3 ${
            // S20.7 — inline mode caps page-container width at
            // max-w-5xl (1024px) so the lease doesn't render wider
            // than is comfortable in the side pane. Focus mode (the
            // recursive instance) drops the cap so pages can fill
            // up to MAX_PAGE_WIDTH = 1100px on a wide viewport.
            hideFocusToggle ? '' : 'max-w-5xl'
          }`}
        >
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages: n }: { numPages: number }) => {
              setNumPages(n);
              setLoadError(null);
            }}
            onLoadError={(err: Error) => {
              setLoadError(err.message);
              console.error('[PdfViewer] Document load failed:', err);
            }}
            loading={
              <div className="flex items-center justify-center rounded-md border border-dashed border-neutral-200 bg-surface-card px-6 py-12 text-sm text-fg-muted dark:border-neutral-700 dark:bg-neutral-900">
                Loading PDF…
              </div>
            }
            error={
              <div className="rounded-md border border-danger-100 bg-danger-100/40 px-4 py-3 text-sm text-danger-600 dark:border-danger-600/40 dark:bg-danger-600/10 dark:text-danger-100">
                Failed to load PDF.
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => {
              const pageNumber = i + 1;
              const isActivePage = activePageNumber === pageNumber;
              return (
                // Sprint 23h — restored plain <div> wrapper after the
                // 23g motion.div + drag="x" experiment was found to
                // intercept vertical scroll on macOS trackpads + touch
                // (Framer issues #185 / #429 / #1341). Horizontal page
                // navigation is now provided by Prev/Next buttons in
                // the dock header + ArrowLeft/ArrowRight keys on the
                // scroll area — both pure native scroll-friendly paths.
                <div
                  key={pageNumber}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                  data-page-number={pageNumber}
                  data-active-page={isActivePage ? 'true' : 'false'}
                  // Sprint 23h root-cause fix — pinning the wrapper to
                  // the EXACT page-canvas width prevents `overflow-hidden`
                  // from clipping the text layer's right edge. `self-center`
                  // opts out of the parent column flex's default
                  // `align-items: stretch`, which would otherwise force
                  // the wrapper to match the inner container width and
                  // make the canvas overflow it. When the user zooms past
                  // fit-width, the wrapper grows wider than the inner
                  // container and the outer <section overflow-auto>
                  // takes over for horizontal pan.
                  style={{ width: effectivePageWidth }}
                  className={`self-center overflow-hidden rounded-md bg-white shadow-sm transition-all duration-300 ${
                    isActivePage
                      ? 'ring-4 ring-accent-300 ring-offset-2 ring-offset-surface-muted dark:ring-offset-neutral-950'
                      : 'ring-1 ring-neutral-200 dark:ring-neutral-700'
                  }`}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={effectivePageWidth}
                    renderAnnotationLayer={false}
                  />
                </div>
              );
            })}
          </Document>
        </div>
      </section>
      {!hideFocusToggle ? (
        <PdfFocusDialog
          open={focused}
          onClose={() => setFocused(false)}
          title={filename ?? undefined}
        >
          {/* S20.2 — the dialog body re-renders the viewer recursively
              with hideFocusToggle so the focused surface doesn't show
              a nested Expand button. Each viewer carries its own zoom
              / fit / scroll / IntersectionObserver state. */}
          <PdfViewerClient
            pdfUrl={pdfUrl}
            filename={filename}
            pageCount={pageCountProp}
            clauseCount={clauseCount}
            hideFocusToggle={true}
          />
        </PdfFocusDialog>
      ) : null}
    </div>
  );
}
