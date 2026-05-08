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

'use client';

import { ChevronDown, ExternalLink, Paperclip } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useChatStream } from '@/components/chat/ChatStreamContext';

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

const SEVERITY_BAR: Record<Severity, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
  ok: 'bg-emerald-500',
};

const SEVERITY_BADGE: Record<Severity, string> = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-sky-50 text-sky-700',
  ok: 'bg-emerald-50 text-emerald-700',
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

  if (gradings.length === 0) {
    return (
      <div
        data-testid="red-flag-report-empty"
        className="flex flex-col items-center justify-center gap-2 px-2 py-12 text-center"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="text-[12px] text-gray-500">
          Red flags will appear here as I grade each clause.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="red-flag-report">
      {/* Summary row — at-a-glance severity counts. */}
      <div
        data-testid="red-flag-summary"
        className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
      >
        {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s, i, arr) => (
          <span
            key={s}
            className={`inline-flex items-center gap-1 ${
              i < arr.length - 1
                ? "after:ml-1.5 after:text-gray-300 after:content-['·']"
                : ''
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_BAR[s]}`} />
            {counts[s]} {SEVERITY_LABEL[s]}
          </span>
        ))}
      </div>

      {/* Cards. */}
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

        return (
          <article
            key={g.clause_id}
            data-testid="red-flag-card"
            data-severity={g.severity}
            data-expanded={isExpanded ? 'true' : 'false'}
            data-active={isActive ? 'true' : 'false'}
            className={`relative overflow-hidden rounded-lg border bg-white shadow-sm transition-all hover:shadow ${
              isActive
                ? 'border-indigo-300 ring-2 ring-indigo-200'
                : 'border-gray-200'
            }`}
          >
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
              className="flex w-full items-start gap-2 py-3 pr-3 pl-4 text-left transition-colors hover:bg-gray-50/60 focus-visible:bg-gray-50/60 focus-visible:outline-none"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${SEVERITY_BADGE[g.severity]}`}
                  >
                    {SEVERITY_LABEL[g.severity]}
                  </span>
                  <span className="truncate text-[11px] font-medium text-gray-700">
                    {clauseLabel(g)}
                  </span>
                </div>
                <p
                  className={`mt-1.5 text-[12px] leading-snug text-gray-600 ${
                    isExpanded ? '' : 'line-clamp-2'
                  }`}
                >
                  {g.reasoning}
                </p>
                <div className="mt-1.5 flex min-w-0 items-center gap-1">
                  <Paperclip
                    className="h-3 w-3 shrink-0 text-indigo-500"
                    aria-hidden="true"
                  />
                  <span
                    data-testid="red-flag-citation"
                    className="truncate text-[11px] font-medium text-indigo-600"
                  >
                    {g.statute_citation}
                  </span>
                </div>
              </div>
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Expanded body — recommended action + jump-to-page. */}
            {isExpanded ? (
              <div
                data-testid="red-flag-card-body"
                className="border-t border-gray-100 bg-gray-50/40 px-4 py-3 pl-5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Recommended action
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-gray-700">
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
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    View on page {g.page_number}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
