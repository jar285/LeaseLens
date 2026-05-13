// Sprint 13 §3f / Phase 10.5 — right-pane red-flag stream.
//
// Reads tool events from ChatStreamContext and renders one card per
// grade_clause_severity result. Cards are collapsible (header always
// visible, body expands on click); a tiny "View on page N" inline
// action calls pdfViewerRef.current.scrollToPage so the user can jump
// to the cited clause without leaving the chat. Wathan/Schoger styling:
// soft white card, severity-only-coded left bar (no full-card tinting),
// strong title-row hierarchy, low-contrast body text, comfortable
// spacing in a 320px column.
//
// Sprint 15 Phase 8 — items slide in from the right with an 8px offset
// (spring), exit cleanly via AnimatePresence on lease swap, panel
// summary header pulses once when count grows. Severity bars and
// badges move to semantic tokens (danger/warning/info/success).

'use client';

import { ChevronDown, ExternalLink, Paperclip } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStream } from '@/components/chat/ChatStreamContext';
import { EmptyState } from '@/components/states/EmptyState';
import { CitationChip } from './CitationChip';
import {
  clauseLabel,
  type GradingResult,
  isGradingResult,
  SEVERITY_BAR,
  SEVERITY_ORDER,
  type Severity,
} from './grading';
import { RedFlagSkeletonCard } from './RedFlagSkeletonCard';
import { SeverityBadge } from './SeverityBadge';
import { useScanProgress } from './use-scan-progress';

// Phase 10.8 — how long the page-level highlight + active-card ring
// stay on screen after "View on page N" is clicked. Long enough to
// orient (and to read the sticky callout), short enough to fade
// before the next interaction.
const HIGHLIGHT_DURATION_MS = 4000;

export function RedFlagReport(): React.JSX.Element {
  const { toolEvents, pdfViewerRef, activeClauseId, setActiveClauseId } =
    useChatStream();
  const scan = useScanProgress();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  // Latest grading per clause wins (re-runs replace prior results).
  const gradings = useMemo(() => {
    const byClauseId = new Map<string, GradingResult>();
    for (const event of toolEvents) {
      if (event.tool_name !== 'grade_clause_severity') continue;
      if (!isGradingResult(event.result)) continue;
      byClauseId.set(event.result.clause_id, event.result);
    }
    return Array.from(byClauseId.values()).sort((a, b) => {
      const sevDelta =
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (sevDelta !== 0) return sevDelta;
      return (a.clause_index ?? 0) - (b.clause_index ?? 0);
    });
  }, [toolEvents]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, ok: 0 };
    for (const g of gradings) c[g.severity] += 1;
    return c;
  }, [gradings]);

  // Sprint 15 Phase 8 — pulse the summary row once each time the count
  // grows. previousCountRef sees the last-rendered length; if the new
  // length is larger, bump pulseKey to retrigger the animation.
  const previousCountRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (gradings.length > previousCountRef.current) {
      setPulseKey((k) => k + 1);
    }
    previousCountRef.current = gradings.length;
  }, [gradings.length]);

  // Sprint 18 §2 — when the scan has started but no clauses have been
  // graded yet, show one skeleton per known clause instead of the static
  // examples list. The examples are only for the truly-idle state (no
  // scan ever started in this session).
  if (gradings.length === 0 && scan.phase === 'extracting' && scan.total > 0) {
    return (
      <div
        className="flex flex-col gap-3"
        data-testid="red-flag-report-scanning"
      >
        {Array.from({ length: scan.total }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are interchangeable until real cards land
          <RedFlagSkeletonCard key={`skeleton-${i}`} delay={i * 0.08} />
        ))}
      </div>
    );
  }

  if (gradings.length === 0) {
    return (
      <EmptyState
        testId="red-flag-report-empty"
        align="top"
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-fg-subtle dark:bg-neutral-800 dark:text-neutral-500">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </div>
        }
        title={
          <p className="text-[12px] text-fg-muted">
            Red flags will appear here as I grade each clause.
          </p>
        }
        actions={
          // Sprint 17 §5.5 — concrete examples so a first-time visitor
          // knows what LeaseLens looks for, not just that "something
          // will appear here". Token-driven, low-emphasis, no severity
          // colours yet (those land when real cards arrive).
          <div
            data-testid="red-flag-report-empty-examples"
            className="mt-6 w-full"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
              Examples
            </p>
            <ul className="space-y-1 text-left text-[11px] leading-tight text-fg-muted">
              <li className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                />
                <span>Security-deposit overcharges</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                />
                <span>One-way attorney's-fee clauses</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                />
                <span>Unenforceable late-fee structures</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                />
                <span>Blanket sublet bans</span>
              </li>
            </ul>
          </div>
        }
      />
    );
  }

  const summaryInner = (
    <>
      {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s, i, arr) => (
        <span
          key={s}
          className={`inline-flex items-center gap-1 ${
            i < arr.length - 1
              ? "after:ml-1.5 after:text-fg-subtle after:content-['·']"
              : ''
          }`}
        >
          <span className="tabular text-fg-default">{counts[s]}</span>
          <SeverityBadge severity={s} size="sm" />
        </span>
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-3" data-testid="red-flag-report">
      {/* Summary row — at-a-glance severity counts. */}
      {animate ? (
        <motion.div
          key={pulseKey}
          data-testid="red-flag-summary"
          className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted"
          animate={{ opacity: [1, 0.7, 1] }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
        >
          {summaryInner}
        </motion.div>
      ) : (
        <div
          data-testid="red-flag-summary"
          className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted"
        >
          {summaryInner}
        </div>
      )}

      {/* Cards — slide in from the right with an 8px offset. AnimatePresence
          wraps the list so removed cards exit cleanly when a new lease is
          uploaded. */}
      <AnimatePresence initial={false}>
        {gradings.map((g) => {
          const isExpanded = expandedIds.has(g.clause_id);
          const isActive = activeClauseId === g.clause_id;
          const toggle = () => {
            setExpandedIds((prev) => {
              const next = new Set(prev);
              if (next.has(g.clause_id)) next.delete(g.clause_id);
              else next.add(g.clause_id);
              return next;
            });
          };

          // Sprint 18 §4 — single jump-to-page handler shared by the
          // CitationChip (above the fold) and the in-body
          // "View on page N" button (expanded view). Both surfaces drive
          // the same activeClauseId broadcast + PDF scroll so the ring
          // animation kicks off identically regardless of entry point.
          const jumpToClausePage = (clause: GradingResult) => {
            if (typeof clause.page_number !== 'number') return;
            setActiveClauseId(clause.clause_id);
            window.setTimeout(
              () => setActiveClauseId(null),
              HIGHLIGHT_DURATION_MS,
            );
            pdfViewerRef.current?.scrollToPage(clause.page_number);
          };

          // Sprint 18 §4 — the active-card ring used to be a class swap
          // that snapped on/off. Now the card always carries a neutral
          // border; a separately-rendered <ActiveRing /> overlay handles
          // the highlight with a 200ms fade-in → 3.6s hold → 200ms
          // fade-out (driven by HIGHLIGHT_DURATION_MS in the setTimeout).
          const cardClass =
            'relative overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline transition-shadow hover:shadow-lift dark:border-neutral-800 dark:bg-neutral-900';

          const cardInner = (
            <>
              <span
                aria-hidden="true"
                className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[g.severity]}`}
              />
              <ActiveRing isActive={isActive} reduced={reduced ?? false} />

              {/* Always-visible header. Click anywhere to expand/collapse. */}
              {/* Sprint 18 §4 — the expand toggle covers the severity row +
                  reasoning but NOT the citation. The citation now lives
                  outside this button so it can be its own real <button>
                  (nested buttons are invalid HTML), giving the user a
                  one-click jump-to-page without having to expand the card
                  first. */}
              <button
                type="button"
                onClick={toggle}
                aria-expanded={isExpanded}
                data-testid="red-flag-card-toggle"
                className="flex w-full items-start gap-2 py-3 pr-3 pl-4 text-left transition-colors hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 focus-visible:outline-none dark:hover:bg-neutral-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {/* Sprint 23d Phase 2 — SeverityBadge replaces the
                        inline pill so severity is communicated by icon
                        + text + colour (handoff §19). */}
                    <SeverityBadge severity={g.severity} size="md" />
                    <span className="truncate text-[11px] font-medium text-fg-default">
                      {clauseLabel(g)}
                    </span>
                  </div>
                  <p
                    className={`mt-1.5 text-[12px] leading-snug text-fg-muted ${
                      isExpanded ? '' : 'line-clamp-2'
                    }`}
                  >
                    {g.reasoning}
                  </p>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {/* Citation row — sibling of the toggle, click-isolated.
                  When page_number is set the chip becomes clickable and
                  drives the same activeClauseId + scrollToPage flow as
                  the in-body "View on page N" button below. */}
              <div data-testid="red-flag-citation-row" className="px-4 pb-3">
                <CitationChip
                  statuteCitation={g.statute_citation}
                  pageNumber={g.page_number}
                  onClick={
                    typeof g.page_number === 'number'
                      ? () => jumpToClausePage(g)
                      : undefined
                  }
                />
              </div>

              {/* Expanded body — recommended action + jump-to-page. */}
              {isExpanded ? (
                <div
                  data-testid="red-flag-card-body"
                  className="border-t border-neutral-100 bg-surface-muted/40 px-4 py-3 pl-5 dark:border-neutral-800 dark:bg-neutral-800/30"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                    Recommended action
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-fg-default">
                    {g.recommended_action}
                  </p>
                  {typeof g.page_number === 'number' ? (
                    <button
                      type="button"
                      data-testid="red-flag-jump-to-page"
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToClausePage(g);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-2.5 py-1 text-[11px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      View on page {g.page_number}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          );

          return animate ? (
            <motion.article
              key={g.clause_id}
              data-testid="red-flag-card"
              data-severity={g.severity}
              data-expanded={isExpanded ? 'true' : 'false'}
              data-active={isActive ? 'true' : 'false'}
              className={cardClass}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {cardInner}
            </motion.article>
          ) : (
            <article
              key={g.clause_id}
              data-testid="red-flag-card"
              data-severity={g.severity}
              data-expanded={isExpanded ? 'true' : 'false'}
              data-active={isActive ? 'true' : 'false'}
              className={cardClass}
            >
              {cardInner}
            </article>
          );
        })}
      </AnimatePresence>

      {/*
        Sprint 18 §2 — trailing skeletons for clauses the scan hasn't yet
        attempted. We base the count on `scan.attempted` (success + error)
        rather than `gradings.length` (success only) so a clause whose
        grading errored doesn't leave a permanent ghost skeleton in the
        rail. Once the phase reaches 'complete' (every clause processed),
        no skeletons render even if some gradings failed — the user sees
        only the cards we actually have data for.
      */}
      {scan.phase === 'grading' && scan.total > scan.attempted
        ? Array.from({ length: scan.total - scan.attempted }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are interchangeable until real cards land
            <RedFlagSkeletonCard key={`pending-${i}`} delay={i * 0.08} />
          ))
        : null}
    </div>
  );
}

/*
 * Sprint 18 §4 — active-card ring overlay.
 *
 * Replaces the className-swap snap with a true cross-fade. The overlay
 * is absolutely positioned, pointer-events:none (clicks pass through to
 * the card), and aria-hidden (purely decorative — the active-card state
 * is already conveyed by the card border + scroll behaviour). With
 * reduced motion, the overlay still shows when active but skips the
 * fade — the user sees the same on/off behaviour as before the polish.
 *
 * Duration math: HIGHLIGHT_DURATION_MS (4000ms) is split as
 * ~200ms fade-in (motion default) + ~3600ms hold + ~200ms fade-out.
 * The hold + fade-out are gated by the parent's setTimeout that clears
 * activeClauseId; once cleared, AnimatePresence runs the exit transition.
 */
function ActiveRing({
  isActive,
  reduced,
}: {
  isActive: boolean;
  reduced: boolean;
}): React.JSX.Element {
  // Reduced motion: render the static overlay directly (no fade), to
  // preserve the visual cue without animation. The exit / enter is
  // instant because we conditionally render the element itself.
  if (reduced) {
    return (
      <>
        {isActive ? (
          <span
            aria-hidden="true"
            data-testid="red-flag-active-ring"
            data-motion="off"
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent-300 ring-inset dark:ring-accent-400/50"
          />
        ) : null}
      </>
    );
  }
  return (
    <AnimatePresence>
      {isActive ? (
        <motion.span
          aria-hidden="true"
          data-testid="red-flag-active-ring"
          data-motion="on"
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent-300 ring-inset dark:ring-accent-400/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        />
      ) : null}
    </AnimatePresence>
  );
}
