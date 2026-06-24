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
import { ScrollText } from 'lucide-react';
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
import type { HighlightTextItem } from '@/lib/lease/highlight-match';
import {
  buildHighlightLabel,
  buildItemHtml,
  computePageItemMarks,
  type HighlightDrawTarget,
  type ItemMark,
} from './highlight-render';
import { useLeaseParser } from './LeaseParserContext';
import { PdfEvidenceGutter } from './PdfEvidenceGutter';
import { PdfEvidenceOverlay } from './PdfEvidenceOverlay';
import { PdfFocusDialog } from './PdfFocusDialog';
import { useHighlightSettings } from './PdfHighlightContext';
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN } from './PdfReadingControls';
import { PdfViewerHeader } from './PdfViewerHeader';
import { useClauseHighlights } from './use-clause-highlights';

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

// Sprint 46.5 — escape a clause id for use in a [data-clause-id="…"]
// selector. Ids are server slugs, but escape defensively.
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function PdfViewerClient({
  pdfUrl,
  filename,
  pageCount: pageCountProp,
  clauseCount,
  hideFocusToggle = false,
}: PdfViewerClientProps): React.JSX.Element {
  const { pdfViewerRef, activeClauseId, toolEvents } = useLeaseParser();
  // Sprint 46.4 — graded clauses to highlight (per page) + visibility/filter.
  const { byPage, count: highlightCount } = useClauseHighlights();
  const {
    showHighlights,
    severityFilter,
    isSeverityVisible,
    hoveredClauseId,
    setHoveredClauseId,
  } = useHighlightSettings();
  const [numPages, setNumPages] = useState<number>(pageCountProp ?? 0);
  const [containerWidth, setContainerWidth] = useState<number>(FALLBACK_WIDTH);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Pages whose text layer is empty (scanned / image-only) — highlights
  // can't be drawn there, so we surface a graceful "unavailable" notice.
  const [emptyTextPages, setEmptyTextPages] = useState<Set<number>>(
    () => new Set(),
  );
  // Raw text-layer items per page, captured from onGetTextSuccess. A ref
  // (not state) because they don't drive layout — customTextRenderer reads
  // them at call time, and react-pdf populates them before it runs the
  // renderer within the same text-layer pass.
  const pageItemsRef = useRef<Map<number, HighlightTextItem[]>>(new Map());
  // Per-page memo of computed marks, keyed by a signature so the matcher
  // runs once per (page, items, targets, filter) — not once per text item.
  const markCacheRef = useRef<
    Map<number, { sig: string; perItem: Map<number, ItemMark[]> }>
  >(new Map());

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
  // Sprint 50.6 — the imperative scrollToPage records its target here instead
  // of scrolling immediately; the activeClauseId effect performs the single
  // animated scroll (highlight-center if a mark exists, else this page). This
  // is what stops the card's page-scroll from fighting the mark-scroll (the
  // double-scroll that read as a janky, instant jump).
  const pendingClauseScrollPageRef = useRef<number | null>(null);

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
  // Still used to ring the active page; the clause label/§ now live on the
  // floating evidence label (Sprint 47.3), so we no longer derive them here.
  const activePageNumber = activeFinding?.page_number;

  // Sprint 46.4 — draw targets per page (clause text + severity + a
  // prebuilt aria-label), derived from the graded clauses.
  const drawTargetsByPage = useMemo(() => {
    const map = new Map<number, HighlightDrawTarget[]>();
    for (const [page, targets] of byPage) {
      map.set(
        page,
        targets.map((t) => ({
          clauseId: t.clauseId,
          text: t.text,
          severity: t.severity,
          label: buildHighlightLabel({
            clauseType: t.clauseType,
            severity: t.severity,
            pageNumber: page,
          }),
        })),
      );
    }
    return map;
  }, [byPage]);

  // Signature of the visibility state; part of the per-page mark cache key.
  const filterSig = `${showHighlights}|${severityFilter.high}${severityFilter.medium}${severityFilter.low}${severityFilter.ok}`;

  // Compute (and cache) the per-item marks for a page. Reads items from the
  // ref so it picks up the text layer once react-pdf has loaded it; the sig
  // includes items.length so a late text-layer load invalidates the cache.
  const buildPerItem = useCallback(
    (
      pageNumber: number,
      targets: HighlightDrawTarget[],
      isVisible: (s: Parameters<typeof isSeverityVisible>[0]) => boolean,
      sigPrefix: string,
    ): Map<number, ItemMark[]> => {
      const items = pageItemsRef.current.get(pageNumber) ?? [];
      const sig = `${items.length}|${sigPrefix}|${targets
        .map((t) => `${t.clauseId}:${t.severity}`)
        .join(',')}`;
      const cached = markCacheRef.current.get(pageNumber);
      if (cached && cached.sig === sig) return cached.perItem;
      const perItem = computePageItemMarks(items, targets, isVisible);
      markCacheRef.current.set(pageNumber, { sig, perItem });
      return perItem;
    },
    [],
  );

  // Per-page customTextRenderer. Identity changes when the targets, filter,
  // or master toggle change, so react-pdf re-renders the text layer and
  // re-runs the renderer (that's the moment marks appear / disappear).
  const textRenderers = useMemo(() => {
    const map = new Map<
      number,
      (item: { str: string; itemIndex: number }) => string
    >();
    for (let page = 1; page <= numPages; page++) {
      const targets = drawTargetsByPage.get(page) ?? [];
      map.set(page, ({ str, itemIndex }) => {
        if (!showHighlights || targets.length === 0) {
          return buildItemHtml(str, []);
        }
        const perItem = buildPerItem(
          page,
          targets,
          isSeverityVisible,
          filterSig,
        );
        return buildItemHtml(str, perItem.get(itemIndex) ?? []);
      });
    }
    return map;
  }, [
    numPages,
    drawTargetsByPage,
    showHighlights,
    isSeverityVisible,
    filterSig,
    buildPerItem,
  ]);

  // Capture a page's text-layer items + track scanned (empty) pages.
  // pdfjs items are TextItem | TextMarkedContent; the latter has no `str`,
  // so we read defensively (marked-content entries become '' and never
  // match). `unknown[]` sidesteps TS's weak-type check on the union.
  const handleGetTextSuccess = useCallback(
    (pageNumber: number, items: readonly unknown[]) => {
      const normalized: HighlightTextItem[] = items.map((raw) => {
        const i = raw as { str?: unknown; hasEOL?: unknown };
        return {
          str: typeof i.str === 'string' ? i.str : '',
          hasEOL: i.hasEOL === true,
        };
      });
      pageItemsRef.current.set(pageNumber, normalized);
      const usable = normalized.some((i) => i.str.trim().length > 0);
      setEmptyTextPages((prev) => {
        const has = prev.has(pageNumber);
        if (usable && has) {
          const next = new Set(prev);
          next.delete(pageNumber);
          return next;
        }
        if (!usable && !has) {
          const next = new Set(prev);
          next.add(pageNumber);
          return next;
        }
        return prev; // identity-stable: no needless re-render
      });
    },
    [],
  );

  // True when at least one page that SHOULD carry highlights has no text
  // layer — drives the "highlighting unavailable" notice without hiding
  // the page itself (page navigation still works).
  const highlightsUnavailable =
    showHighlights &&
    byPage.size > 0 &&
    Array.from(byPage.keys()).some((page) => emptyTextPages.has(page));

  // Sprint 47.4 — one-shot soft reveal of passive highlights when they first
  // appear (the scan's 0→N transition). Gated on motion; never replays on
  // zoom/filter (count is the graded total, unaffected by those). Replace
  // resets count to 0, so a new lease reveals again.
  const [revealing, setRevealing] = useState(false);
  const prevHighlightCountRef = useRef(0);
  useEffect(() => {
    const prev = prevHighlightCountRef.current;
    prevHighlightCountRef.current = highlightCount;
    if (prev === 0 && highlightCount > 0 && !prefersReducedMotion()) {
      setRevealing(true);
      const timer = window.setTimeout(() => setRevealing(false), 420);
      return () => window.clearTimeout(timer);
    }
  }, [highlightCount]);

  // Sprint 46.5 — emphasize the active clause's highlight. Highlights are
  // persistent, so the marks already exist when a card sets activeClauseId;
  // we scroll the first matched mark into view and pulse it. Scoped to THIS
  // viewer instance's scroll area so the inline + focus viewers don't fight.
  // Reduced motion swaps the pulse for a static outline. The activeClauseId
  // lifecycle (set on click, auto-cleared after 4s) is owned by RedFlagReport
  // — we add NO second timer, just react to the value. When no mark matches
  // (filtered-out severity, no text match, scanned page) the existing
  // scrollToPage from the card click already handled page-level orientation.
  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root || !activeClauseId) return;
    const reduce = prefersReducedMotion();
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    const selector = `mark[data-clause-id="${cssEscape(activeClauseId)}"]`;
    const marks = root.querySelectorAll<HTMLElement>(selector);

    // Sprint 50.6 — single animated scroll per clause jump. The card's
    // scrollToPage no longer scrolls; it records the target page (consumed
    // here), so ALL active-clause scrolling happens in this one place and the
    // page-scroll can't fight the mark-scroll. Prefer the precise highlight;
    // fall back to the recorded page when the clause has no matched mark
    // (filtered severity, no text match, scanned page, or a non-graded clause
    // row). Reduced motion swaps the smooth glide for an instant jump.
    const fallbackPage = pendingClauseScrollPageRef.current;
    pendingClauseScrollPageRef.current = null;

    if (marks.length > 0) {
      const cls = reduce ? 'll-hl--active' : 'll-hl--pulse';
      for (const mark of marks) mark.classList.add(cls);
      marks[0].scrollIntoView({ behavior, block: 'center' });
      return () => {
        for (const mark of marks) {
          mark.classList.remove('ll-hl--pulse', 'll-hl--active');
        }
      };
    }
    if (typeof fallbackPage === 'number') {
      pageRefs.current[fallbackPage - 1]?.scrollIntoView({
        behavior,
        block: 'start',
      });
    }
  }, [activeClauseId]);

  // Sprint 46.6 — PDF→card hover: a delegated listener (react-pdf strips
  // inline handlers, so we read the bubbled event's nearest [data-clause-id])
  // publishes the hovered clause. The card side reacts via hoveredClauseId.
  // Mouse OR keyboard focus over a mark publishes the hovered clause.
  // (Pairing focus with the mouse handler also satisfies a11y and is
  // forward-compatible with keyboard-focusable marks.)
  const handleMarkEnter = useCallback(
    (event: React.SyntheticEvent) => {
      const mark = (event.target as HTMLElement | null)?.closest?.(
        '[data-clause-id]',
      );
      const id = mark?.getAttribute('data-clause-id');
      if (id) setHoveredClauseId(id);
    },
    [setHoveredClauseId],
  );
  const handleMarkLeave = useCallback(
    (event: React.SyntheticEvent) => {
      const mark = (event.target as HTMLElement | null)?.closest?.(
        '[data-clause-id]',
      );
      if (mark) setHoveredClauseId(null);
    },
    [setHoveredClauseId],
  );

  // card→PDF (and PDF→PDF) hover emphasis: toggle a light outline on the
  // hovered clause's marks. No scroll — hover only emphasizes.
  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root || !hoveredClauseId) return;
    const selector = `mark[data-clause-id="${cssEscape(hoveredClauseId)}"]`;
    const marks = root.querySelectorAll<HTMLElement>(selector);
    for (const mark of marks) mark.classList.add('ll-hl--hover');
    return () => {
      for (const mark of marks) mark.classList.remove('ll-hl--hover');
    };
  }, [hoveredClauseId]);

  // Sprint 23g (kept in 23h) — page navigation scroll (prev/next buttons +
  // keyboard). One source of truth for page-level scrolling.
  // Sprint 50.6 — this is now ONLY the page-nav path; the external
  // scrollToPage handle (CitationChip / red-flag cards / clause rows) routes
  // through recordClauseJumpPage so the clause jump animates exactly once.
  const scrollToPageNumber = useCallback((page: number) => {
    if (page < 1 || page > pageRefs.current.length) return;
    const el = pageRefs.current[page - 1];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Sprint 50.6 — the imperative scrollToPage records the target page rather
  // than scrolling. The activeClauseId effect (which the same click sets)
  // performs the single animated scroll: highlight-center if a mark exists,
  // else this recorded page. Recording (not scrolling) is what removes the
  // competing page-scroll the user saw as a janky, instant jump.
  const recordClauseJumpPage = useCallback((page: number) => {
    pendingClauseScrollPageRef.current = page;
  }, []);

  useImperativeHandle(
    pdfViewerRef,
    () => ({
      scrollToPage: recordClauseJumpPage,
    }),
    [recordClauseJumpPage],
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
      {/* Sprint 55.2 — the two-row dock header is a pure presenter
          (PdfViewerHeader). The viewer keeps the <Document> loop, observers,
          refs, and all reading-control state; the header receives derived
          values + callbacks as props (render-phase safe, no react-pdf / parser
          context inside it). */}
      <PdfViewerHeader
        filename={filename}
        loadError={loadError}
        numPages={numPages}
        clauseCount={clauseCount}
        hideFocusToggle={hideFocusToggle}
        onExpand={() => setFocused(true)}
        zoom={zoom}
        fit={fit}
        currentPage={currentPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onToggleFit={handleToggleFit}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
      />

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
        // Sprint 46.6 — delegated hover bridge (marks can't carry inline
        // handlers; react-pdf strips them). Reads the nearest [data-clause-id].
        // focus is paired with mouse so keyboard focus on a mark links too.
        onMouseOver={handleMarkEnter}
        onMouseOut={handleMarkLeave}
        onFocus={handleMarkEnter}
        onBlur={handleMarkLeave}
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
        {/* Sprint 47.3 — the Phase-10.8 top sticky callout was relocated into
            the floating evidence label (PdfEvidenceOverlay), anchored right at
            the clause instead of pinned to the top of the pane. The scanned-
            page fallback below remains. */}

        {/* Sprint 46.4 — graceful fallback: a scanned / no-text-layer page
            can't carry highlights. Say so plainly (Nielsen: visibility of
            system status) without hiding the page or breaking navigation. */}
        {highlightsUnavailable ? (
          <div
            data-testid="pdf-highlights-unavailable"
            role="status"
            className="pointer-events-none sticky top-0 z-raised mb-2 flex justify-center"
          >
            <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-surface-card/95 px-3 py-1 text-[11px] font-medium text-warning-700 shadow-sm backdrop-blur dark:border-warning-500/40 dark:bg-neutral-900/95 dark:text-warning-200">
              <ScrollText className="h-3 w-3" aria-hidden="true" />
              Highlights unavailable on scanned pages (no selectable text).
            </div>
          </div>
        ) : null}

        <div
          ref={pageContainerRef}
          data-testid="pdf-page-container"
          // Sprint 47.4 — `ll-reveal` is added for one beat when highlights
          // first appear, triggering the opacity reveal on the passive marks.
          // Sprint 48.1 — `ll-focus-mode` recedes the non-active passive marks
          // while a clause is selected, so the user focuses on one issue.
          className={`mx-auto flex w-full flex-col gap-3 ${revealing ? 'll-reveal' : ''} ${activeClauseId ? 'll-focus-mode' : ''} ${
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
                    customTextRenderer={textRenderers.get(pageNumber)}
                    onGetTextSuccess={({
                      items,
                    }: {
                      items: readonly unknown[];
                    }) => handleGetTextSuccess(pageNumber, items)}
                  />
                </div>
              );
            })}
          </Document>
        </div>

        {/* Sprint 47.2 — evidence frame overlay. Direct child of the scroll
            section (its containing block + scroll container) so the frames
            scroll with the pages; do NOT wrap in an absolute inset-0 box. */}
        <PdfEvidenceOverlay
          scrollAreaRef={scrollAreaRef}
          effectivePageWidth={effectivePageWidth}
        />

        {/* Sprint 48.2 — Turnitin-style gutter markers, also direct children
            of the scroll section so they scroll with the pages. */}
        <PdfEvidenceGutter
          scrollAreaRef={scrollAreaRef}
          effectivePageWidth={effectivePageWidth}
        />
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
