// Sprint 26b — standalone list of extracted clauses.
//
// Reads tool events from ChatStreamContext. Unions clauses from
// `extract_clauses` results (canonical clause list) with graded clauses
// from `grade_clause_severity` results (decoration + fallback when no
// extract event is present). Each row is a real button that triggers
// the same PDF-jump flow RedFlagReport uses.
//
// Pairs with RedFlagReport, which surfaces only graded high/medium/low
// rows as detailed cards. ClausesList shows EVERY extracted clause so
// the user can see what's been parsed at a glance — including ungraded
// rows pending the next grade event.

'use client';

import { MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useAssistantFab } from '@/components/chat/AssistantFabContext';
import { useChatStream } from '@/components/chat/ChatStreamContext';
import {
  clauseLabel,
  type GradingResult,
  isGradingResult,
  type Severity,
} from './grading';
import { SeverityBadge } from './SeverityBadge';
import { partitionByLatestExtract } from './use-scan-progress';

// Sprint 26c — Explain-prompt template for the clauses list. Centralized
// so the wording is testable in isolation and the row + FAB stay in sync.
function explainPromptForClause(row: {
  clause_type: string;
  clause_index: number;
}): string {
  const label = clauseLabel({
    clause_type: row.clause_type,
    clause_index: row.clause_index,
  });
  return `Explain ${label} in plain English and call out anything a tenant should watch for.`;
}

// Minimum row shape — populated from extract_clauses, or synthesized
// from a grading event when no extract is present.
interface ClauseRow {
  clause_id: string;
  clause_index: number;
  clause_type: string;
  page_number: number;
  severity: Severity | null;
}

// Sprint 26c.9 — local row shape mirrors the extract tool result's
// clause shape. We no longer validate the result shape here because
// `partitionByLatestExtract` already typeguards via its own helper.
interface ExtractedClause {
  clause_id: string;
  clause_index: number;
  clause_type: string;
  page_number: number;
  text?: string;
}

export function ClausesList(): React.JSX.Element {
  const { toolEvents, pdfViewerRef, setActiveClauseId, activeLease } =
    useChatStream();
  const fab = useAssistantFab();

  const rows = useMemo<ClauseRow[]>(() => {
    // Sprint 26c.9 — lease-aware extract resolution. Use the latest
    // extract_clauses event whose lease_id matches the active lease;
    // ignore events from prior leases that the conversation
    // rehydrated. When no extract is found for the active lease, fall
    // through to the gradings-only fallback path so seeded test
    // conversations still render rows.
    const activeLeaseId = activeLease?.lease_id ?? null;
    const { extract } = partitionByLatestExtract(toolEvents, activeLeaseId);
    const extracted: ExtractedClause[] | null = extract
      ? (extract.clauses as ExtractedClause[])
      : null;

    const allowedClauseIds = extracted
      ? new Set(extracted.map((c) => c.clause_id))
      : null;

    const gradings = new Map<string, GradingResult>();
    for (const event of toolEvents) {
      if (event.tool_name !== 'grade_clause_severity') continue;
      if (!isGradingResult(event.result)) continue;
      if (allowedClauseIds && !allowedClauseIds.has(event.result.clause_id)) {
        continue;
      }
      gradings.set(event.result.clause_id, event.result);
    }

    // Primary source: extracted clauses, decorated with latest grading.
    if (extracted) {
      return extracted
        .map<ClauseRow>((c) => ({
          clause_id: c.clause_id,
          clause_index: c.clause_index,
          clause_type: c.clause_type,
          page_number: c.page_number,
          severity: gradings.get(c.clause_id)?.severity ?? null,
        }))
        .sort((a, b) => a.clause_index - b.clause_index);
    }

    // Fallback: seeded conversations that carry only gradings (no
    // extract event for the active lease). Synthesize rows from the
    // gradings themselves so the user still sees the analyzed surface
    // area in tests + Tenant flows that seed data directly.
    if (gradings.size > 0) {
      return Array.from(gradings.values())
        .map<ClauseRow>((g) => ({
          clause_id: g.clause_id,
          clause_index: g.clause_index ?? 0,
          clause_type: g.clause_type ?? 'unknown',
          page_number: g.page_number ?? 0,
          severity: g.severity,
        }))
        .sort((a, b) => a.clause_index - b.clause_index);
    }

    return [];
  }, [toolEvents, activeLease?.lease_id]);

  if (rows.length === 0) {
    return (
      <section
        data-testid="clauses-list"
        aria-labelledby="clauses-list-heading"
        className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface-card p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h3
          id="clauses-list-heading"
          className="text-[13px] font-semibold text-fg-default"
        >
          Clauses
        </h3>
        <p
          data-testid="clauses-list-empty"
          className="text-xs text-fg-muted leading-relaxed"
        >
          No clauses extracted yet. Run the standard scan and clauses will
          appear here as they're parsed.
        </p>
      </section>
    );
  }

  function handleRowClick(row: ClauseRow): void {
    setActiveClauseId(row.clause_id);
    if (typeof row.page_number === 'number' && row.page_number > 0) {
      pdfViewerRef.current?.scrollToPage(row.page_number);
    }
  }

  return (
    <section
      data-testid="clauses-list"
      aria-labelledby="clauses-list-heading"
      className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface-card p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-baseline justify-between">
        <h3
          id="clauses-list-heading"
          className="text-[13px] font-semibold text-fg-default"
        >
          Clauses
        </h3>
        <span className="text-[11px] text-fg-subtle">{rows.length} total</span>
      </header>
      <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map((row) => {
          const label = clauseLabel({
            clause_type: row.clause_type,
            clause_index: row.clause_index,
          });
          return (
            <li key={row.clause_id} className="flex items-center gap-1">
              <button
                type="button"
                data-testid="clauses-list-row"
                data-clause-id={row.clause_id}
                data-severity={row.severity ?? 'pending'}
                onClick={() => handleRowClick(row)}
                className="flex flex-1 items-center justify-between gap-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:bg-neutral-800"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] text-fg-default">
                    {label}
                  </span>
                  {row.page_number > 0 ? (
                    <span className="text-[11px] text-fg-subtle">
                      p. {row.page_number}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0">
                  {row.severity ? (
                    <SeverityBadge severity={row.severity} size="sm" />
                  ) : (
                    <span
                      title="Not graded yet"
                      className="inline-flex h-4 min-w-4 items-center justify-center text-[12px] text-fg-subtle"
                    >
                      <span className="sr-only">Not graded yet</span>
                      <span aria-hidden="true">—</span>
                    </span>
                  )}
                </span>
              </button>
              {/* Sprint 26c — sibling Explain button. Outside the row
                  button so nested-button HTML invalidity is avoided
                  (same pattern RedFlagReport uses for CitationChip).
                  Clicking it opens the FAB drawer with a clause-aware
                  prefill instead of scrolling the PDF. */}
              <button
                type="button"
                data-testid="clauses-list-row-explain"
                data-clause-id={row.clause_id}
                aria-label={`Explain ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  fab.openWith({
                    initialPrompt: explainPromptForClause(row),
                    clauseId: row.clause_id,
                    severity: row.severity ?? undefined,
                  });
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:hover:bg-neutral-800"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
