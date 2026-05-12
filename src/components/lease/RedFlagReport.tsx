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

type Severity = 'high' | 'medium' | 'low' | 'ok';

interface GradingResult {
  clause_id: string;
  severity: Severity;
  statute_citation: string;
  chunk_id: string;
  reasoning: string;
  recommended_action: string;
  // Phase 10.5 — added on the tool side so the card can show clause
  // type + page number without a second lookup.
  clause_type?: string;
  clause_index?: number;
  page_number?: number;
}

const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low', 'ok'];

// Sprint 15 Phase 8 — semantic token classes for the 1px coloured left bar
// and the inline severity pill. Tailwind v4 generates `bg-danger-600` etc.
// from the @theme color keys defined in globals.css.
const SEVERITY_BAR: Record<Severity, string> = {
  high: 'bg-danger-600',
  medium: 'bg-warning-600',
  low: 'bg-info-600',
  ok: 'bg-success-600',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  high: 'bg-danger-100/80 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100',
  medium:
    'bg-warning-100/80 text-warning-600 dark:bg-warning-600/15 dark:text-warning-100',
  low: 'bg-info-100/80 text-info-600 dark:bg-info-600/15 dark:text-info-100',
  ok: 'bg-success-100/80 text-success-600 dark:bg-success-600/15 dark:text-success-100',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
  ok: 'OK',
};

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

function isGradingResult(value: unknown): value is GradingResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clause_id === 'string' &&
    typeof v.severity === 'string' &&
    typeof v.statute_citation === 'string' &&
    SEVERITY_ORDER.includes(v.severity as Severity)
  );
}

function clauseLabel(g: GradingResult): string {
  const typeLabel = g.clause_type
    ? (CLAUSE_TYPE_LABEL[g.clause_type] ?? CLAUSE_TYPE_LABEL.unknown)
    : 'Clause';
  return typeof g.clause_index === 'number'
    ? `${typeLabel} · §${g.clause_index + 1}`
    : typeLabel;
}

// Phase 10.8 — how long the page-level highlight + active-card ring
// stay on screen after "View on page N" is clicked. Long enough to
// orient (and to read the sticky callout), short enough to fade
// before the next interaction.
const HIGHLIGHT_DURATION_MS = 4000;

export function RedFlagReport(): React.JSX.Element {
  const { toolEvents, pdfViewerRef, activeClauseId, setActiveClauseId } =
    useChatStream();
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
          <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_BAR[s]}`} />
          <span className="tabular">{counts[s]}</span> {SEVERITY_LABEL[s]}
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

          const cardClass = `relative overflow-hidden rounded-lg border bg-surface-card shadow-hairline transition-shadow hover:shadow-lift dark:bg-neutral-900 ${
            isActive
              ? 'border-accent-300 ring-2 ring-accent-200 dark:border-accent-400/40 dark:ring-accent-500/20'
              : 'border-neutral-200 dark:border-neutral-800'
          }`;

          const cardInner = (
            <>
              <span
                aria-hidden="true"
                className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[g.severity]}`}
              />

              {/* Always-visible header. Click anywhere to expand/collapse. */}
              <button
                type="button"
                onClick={toggle}
                aria-expanded={isExpanded}
                data-testid="red-flag-card-toggle"
                className="flex w-full items-start gap-2 py-3 pr-3 pl-4 text-left transition-colors hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 focus-visible:outline-none dark:hover:bg-neutral-800/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SEVERITY_BADGE[g.severity]}`}
                    >
                      {SEVERITY_LABEL[g.severity]}
                    </span>
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
                  <div className="mt-1.5 flex min-w-0 items-center gap-1">
                    <Paperclip
                      className="h-3 w-3 shrink-0 text-accent-500 dark:text-accent-300"
                      aria-hidden="true"
                    />
                    <span
                      data-testid="red-flag-citation"
                      className="truncate text-[11px] font-medium text-accent-600 dark:text-accent-300"
                    >
                      {g.statute_citation}
                    </span>
                  </div>
                </div>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

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
                        // Phase 10.8 — set the active-clause connection
                        // BEFORE scrolling so the receiver pane sees the
                        // id by the time the scroll lands. Auto-clear
                        // after HIGHLIGHT_DURATION_MS so the ring fades
                        // and the user can click another card cleanly.
                        setActiveClauseId(g.clause_id);
                        window.setTimeout(
                          () => setActiveClauseId(null),
                          HIGHLIGHT_DURATION_MS,
                        );
                        pdfViewerRef.current?.scrollToPage(
                          g.page_number as number,
                        );
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
    </div>
  );
}
