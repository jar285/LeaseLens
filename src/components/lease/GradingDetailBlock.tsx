'use client';

/*
 * Sprint 18 §3 — tenant-friendly grading detail.
 *
 * Renders a polished severity card body inside a chat ToolCard for
 * `grade_clause_severity` results. Mirrors the visual hierarchy of
 * the right-pane RedFlagReport card (severity bar, badge, clause
 * label, reasoning, citation, recommended action, jump-to-page) so
 * the tenant gets the same surface in both places.
 *
 * Replaces the raw JSON view inside the chat ToolCard's expanded body
 * when the tool name is `grade_clause_severity` AND the result
 * matches the `isGradingResult` typeguard. Errored or malformed
 * results fall back to JSON (ToolCard's existing path).
 *
 * Wiring:
 *
 *   - Reads `pdfViewerRef` + `setActiveClauseId` from ChatStreamContext
 *     so the "View on page N" button drives the same cross-pane
 *     highlight + PDF scroll as the right-pane card.
 *   - Active-clause ring auto-clears after HIGHLIGHT_DURATION_MS,
 *     matching RedFlagReport's behaviour.
 */

import { ExternalLink } from 'lucide-react';
import { CitationChip } from './CitationChip';
import {
  clauseLabel,
  type GradingResult,
  SEVERITY_BADGE,
  SEVERITY_BAR,
  SEVERITY_LABEL,
} from './grading';
import { useLeaseParser } from './LeaseParserContext';

const HIGHLIGHT_DURATION_MS = 4000;

// S19.8 — verbosity tiers. Tenant is the default; Reviewer adds a
// corpus-source line so an auditor can verify which chunk grounded the
// grading; Admin additionally exposes the full grading payload behind
// a collapsed <details> disclosure for raw debugging.
export type GradingDetailVerbosity = 'tenant' | 'reviewer' | 'admin';

export interface GradingDetailBlockProps {
  grading: GradingResult;
  verbosity?: GradingDetailVerbosity;
}

export function GradingDetailBlock({
  grading,
  verbosity = 'tenant',
}: GradingDetailBlockProps): React.JSX.Element {
  const { pdfViewerRef, setActiveClauseId } = useLeaseParser();

  function handleJumpToPage(): void {
    if (typeof grading.page_number !== 'number') return;
    setActiveClauseId(grading.clause_id);
    window.setTimeout(() => setActiveClauseId(null), HIGHLIGHT_DURATION_MS);
    pdfViewerRef.current?.scrollToPage(grading.page_number);
  }

  return (
    <article
      data-testid="grading-detail-block"
      data-severity={grading.severity}
      className="relative overflow-hidden rounded-md border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Left severity bar */}
      <span
        aria-hidden="true"
        className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[grading.severity]}`}
      />
      <div className="space-y-3 px-4 py-3 pl-5">
        {/* Header row: severity pill + clause label */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-testid="grading-detail-severity"
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${SEVERITY_BADGE[grading.severity]}`}
          >
            {SEVERITY_LABEL[grading.severity]}
          </span>
          <span className="text-[13px] font-semibold text-fg-default">
            {clauseLabel(grading)}
          </span>
        </div>

        {/* Reasoning — full text, not clamped (in chat we have the room) */}
        {grading.reasoning ? (
          <p
            data-testid="grading-detail-reasoning"
            className="text-[13px] leading-snug text-fg-muted"
          >
            {grading.reasoning}
          </p>
        ) : null}

        {/* Citation chip — clickable when we have a page number to jump to;
            otherwise renders as a presentational span. Either way drives
            the same activeClauseId broadcast as the jump-to-page button
            below, so the right-pane card pulses on either entry point. */}
        {grading.statute_citation ? (
          <div data-testid="grading-detail-citation">
            <CitationChip
              statuteCitation={grading.statute_citation}
              pageNumber={grading.page_number}
              onClick={
                typeof grading.page_number === 'number'
                  ? handleJumpToPage
                  : undefined
              }
            />
          </div>
        ) : null}

        {/* Recommended action — labelled, separated by hairline so it
            reads as a distinct "what to do next" beat */}
        {grading.recommended_action ? (
          <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              Recommended action
            </p>
            <p
              data-testid="grading-detail-action"
              className="mt-1 text-[13px] leading-relaxed text-fg-default"
            >
              {grading.recommended_action}
            </p>
          </div>
        ) : null}

        {/* Jump-to-page — only when the grading carries a page reference */}
        {typeof grading.page_number === 'number' ? (
          <button
            type="button"
            data-testid="grading-detail-jump-to-page"
            onClick={handleJumpToPage}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-2.5 py-1 text-[11px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            View on page {grading.page_number}
          </button>
        ) : null}

        {/* S19.8 — Reviewer & Admin: which corpus chunk grounded the
            grading. The chunk_id is opaque to a tenant but invaluable
            to an auditor verifying that the statute citation came from
            an actual NJ source rather than the model paraphrasing. */}
        {verbosity !== 'tenant' && grading.chunk_id ? (
          <div
            data-testid="grading-detail-source"
            className="border-t border-neutral-100 pt-2 dark:border-neutral-800"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              Source chunk
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
              {grading.chunk_id}
            </p>
          </div>
        ) : null}

        {/* S19.8 — Admin only: collapsed raw-JSON disclosure. The
            <details> element is HTML-native, keyboard-accessible, and
            announces "expanded/collapsed" to screen readers without
            any custom ARIA wiring. */}
        {verbosity === 'admin' ? (
          <details
            data-testid="grading-detail-raw-json"
            className="border-t border-neutral-100 pt-2 dark:border-neutral-800"
          >
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              Raw grading payload
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 font-mono text-[11px] text-fg-default dark:bg-neutral-800">
              {JSON.stringify(grading, null, 2)}
            </pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}
