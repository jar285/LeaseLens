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
import { MapPin, ScrollText } from 'lucide-react';
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useChatStream } from '@/components/chat/ChatStreamContext';

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
const MAX_PAGE_WIDTH = 760;
const PADDING_AROUND_PAGE = 32; // px taken by viewport horizontal padding
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
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function PdfViewerClient({
  pdfUrl,
  filename,
  pageCount: pageCountProp,
  clauseCount,
}: PdfViewerClientProps): React.JSX.Element {
  const { pdfViewerRef, activeClauseId, toolEvents } = useChatStream();
  const [numPages, setNumPages] = useState<number>(pageCountProp ?? 0);
  const [containerWidth, setContainerWidth] = useState<number>(FALLBACK_WIDTH);
  const [loadError, setLoadError] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

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

  useImperativeHandle(
    pdfViewerRef,
    () => ({
      scrollToPage(page: number) {
        if (page < 1 || page > pageRefs.current.length) return;
        const el = pageRefs.current[page - 1];
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }),
    [],
  );

  // Responsive Page width — measure the scroll viewport and pass an
  // appropriate `width` prop to <Page> so the rendered canvas fills
  // the available space without horizontal overflow.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = () => {
      const el = scrollAreaRef.current;
      if (!el) return;
      const next = Math.max(
        MIN_PAGE_WIDTH,
        Math.min(MAX_PAGE_WIDTH, el.clientWidth - PADDING_AROUND_PAGE),
      );
      setContainerWidth(next);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (scrollAreaRef.current) ro.observe(scrollAreaRef.current);
    return () => ro.disconnect();
  }, []);

  if (!pdfUrl) {
    return (
      <div
        data-testid="pdf-viewer-empty"
        className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-gray-50/60 p-8 text-center"
      >
        <p className="text-sm text-gray-500">
          Upload a NJ lease PDF to view it here.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="pdf-viewer"
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-gray-50/80"
    >
      {/* Header chrome — filename, page count, status pill. */}
      <header
        data-testid="pdf-viewer-header"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600"
          >
            <ScrollText className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p
              data-testid="pdf-viewer-filename"
              className="truncate text-[13px] font-medium leading-tight text-gray-900"
            >
              {filename ?? 'Lease document'}
            </p>
            <p className="mt-0.5 text-[11px] leading-tight text-gray-500">
              {numPages > 0 ? pluralize(numPages, 'page') : 'Loading…'}
              {typeof clauseCount === 'number'
                ? ` · ${pluralize(clauseCount, 'clause')}`
                : null}
            </p>
          </div>
        </div>
        {loadError ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            Failed
          </span>
        ) : numPages > 0 ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            Parsed
          </span>
        ) : null}
      </header>

      {/* Scrollable pages area — canonical Ordo-style scroll chain.
          flex-1 + min-h-0 + overflow-y-auto on the same node so the
          parent flex grants it height and the child gets its own
          independent scrollbar. overscroll-contain prevents the
          chat pane from rubber-band-scrolling when this hits its end. */}
      <div
        ref={scrollAreaRef}
        data-testid="pdf-viewer-scroll-area"
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4"
      >
        {/* Phase 10.8 — sticky callout. Pinned to the top of the
            scroll area while a clause is active, fades out with the
            highlight. Communicates the connection between the right-
            pane card and the left-pane page without a redesign. */}
        {activeClauseId && activePageNumber ? (
          <div
            data-testid="pdf-viewer-active-callout"
            className="pointer-events-none sticky top-0 z-10 mb-2 flex justify-center"
          >
            <div className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white/95 px-3 py-1 text-[11px] font-medium text-indigo-700 shadow-sm backdrop-blur">
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

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
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
              <div className="flex items-center justify-center rounded-md border border-dashed border-gray-200 bg-white px-6 py-12 text-sm text-gray-500">
                Loading PDF…
              </div>
            }
            error={
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Failed to load PDF.
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => {
              const pageNumber = i + 1;
              const isActivePage = activePageNumber === pageNumber;
              return (
                <div
                  key={pageNumber}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                  data-page-number={pageNumber}
                  data-active-page={isActivePage ? 'true' : 'false'}
                  className={`overflow-hidden rounded-md bg-white shadow-sm transition-all duration-300 ${
                    isActivePage
                      ? 'ring-4 ring-indigo-300 ring-offset-2'
                      : 'ring-1 ring-gray-200'
                  }`}
                >
                  <Page
                    pageNumber={pageNumber}
                    width={containerWidth}
                    renderAnnotationLayer={false}
                  />
                </div>
              );
            })}
          </Document>
        </div>
      </div>
    </div>
  );
}
