'use client';

/*
 * Sprint 18 — derived scan-progress state.
 *
 * The chat stream emits two tool-result events that together describe an
 * in-flight standard scan:
 *
 *   1. `extract_clauses` — fires once, returns the full clause list. This
 *      is where we learn N (total clauses to grade).
 *   2. `grade_clause_severity` — fires once per clause, even if the tool
 *      errored. We count the *attempts* (success + error) so a clause
 *      whose grading failed still ticks progress forward — otherwise an
 *      error stream would leave the rail stuck at "Grading 7 of 15" with
 *      hanging skeletons even after the chat has clearly moved on.
 *
 * Re-runs are handled by replacing the most-recent extract_clauses result;
 * tool_results older than that event are excluded so the progress reflects
 * the latest scan only.
 */

import { useMemo } from 'react';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { useLeaseParser } from './LeaseParserContext';

export type ScanPhase = 'idle' | 'extracting' | 'grading' | 'complete';

export interface ScanProgress {
  phase: ScanPhase;
  /** Total clauses in the latest extract_clauses result. 0 when idle. */
  total: number;
  /**
   * Unique clause_ids the model has finished a grade_clause_severity tool
   * call for in the current scan — success OR error. Drives phase, label,
   * and the skeleton-card count.
   */
  attempted: number;
  /** Human-readable label suitable for the right-pane header. */
  label: string;
}

// Exported so scan-stages.ts (Sprint 18 §5) can lookup clause_type by
// clause_id. The typeguard below only requires `clauses: Array`; the
// runtime payload from the extract_clauses tool also carries clause_type,
// clause_index, page_number, etc. (see src/lib/tools/lease-tools.ts:107).
// We expose those fields as optional so consumers can read them when
// present without forcing the guard to validate every clause individually.
export interface ExtractClausesResult {
  clauses: Array<{
    clause_id: string;
    clause_type?: string;
    clause_index?: number;
    page_number?: number;
  }>;
}

function isExtractClausesResult(value: unknown): value is ExtractClausesResult {
  if (!value || typeof value !== 'object') return false;
  const clauses = (value as { clauses?: unknown }).clauses;
  return Array.isArray(clauses);
}

function readInputClauseId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const id = (input as { clause_id?: unknown }).clause_id;
  return typeof id === 'string' ? id : null;
}

/*
 * Sprint 28.5 (Bug 2 follow-up) — read the clause_id from `result` when
 * `input` doesn't carry one. AutoScanRunner pushes tool events with
 * `input: {}` because it only processes `tool_result` envelopes and
 * discards the `tool_use` envelopes that carry the input args; the
 * grade event still has `result.clause_id` populated. Without this
 * fallback, every auto-scan grading was invisible to `countAttemptsSince`,
 * which left the header parked on "Scanning lease — N clauses found"
 * with a spinner even after every clause had finished. AutoScanRunner is
 * being fixed in parallel to preserve the input at the source; this
 * fallback hardens the counter against any future producer that emits
 * input-less grade events.
 */
function readResultClauseId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const id = (result as { clause_id?: unknown }).clause_id;
  return typeof id === 'string' ? id : null;
}

function readGradingClauseId(event: ToolEvent): string | null {
  return readInputClauseId(event.input) ?? readResultClauseId(event.result);
}

/*
 * Find the last extract_clauses event and slice the events that came after
 * it. Anything before is from a prior scan and should not count toward the
 * current progress.
 *
 * Sprint 26c.9 — optional `leaseId` filter. When provided, only consider
 * extract events whose `result.lease_id` matches; this stops stale
 * rehydrated tool events (from a prior conversation's lease) from
 * surfacing as an in-flight scan on a freshly uploaded lease.
 *
 * Exported for `scan-stages.ts` (Sprint 18 §5) so the thematic-stage
 * derivation can share the same "what counts as the current scan" anchor
 * — there should never be two answers to that question.
 */
export function partitionByLatestExtract(
  events: ToolEvent[],
  leaseId?: string | null,
): {
  extract: ExtractClausesResult | null;
  extractIndex: number;
} {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.tool_name !== 'extract_clauses') continue;
    if (!isExtractClausesResult(event.result)) continue;
    if (leaseId !== undefined && leaseId !== null) {
      const eventLeaseId = (event.result as { lease_id?: unknown }).lease_id;
      if (typeof eventLeaseId !== 'string' || eventLeaseId !== leaseId) {
        continue;
      }
    }
    return { extract: event.result, extractIndex: i };
  }
  return { extract: null, extractIndex: -1 };
}

/*
 * Count unique clause_ids attempted via grade_clause_severity tool_results.
 * We read input.clause_id (always populated, even when the tool errored)
 * rather than result.clause_id (only populated on success). This is the
 * key bug fix from the 7-success / 8-error scan that previously left the
 * progress stuck at "8 of 15".
 */
function countAttemptsSince(
  events: ToolEvent[],
  startIndex: number,
): Set<string> {
  const seen = new Set<string>();
  for (let i = startIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.tool_name !== 'grade_clause_severity') continue;
    const clauseId = readGradingClauseId(event);
    if (clauseId === null) continue;
    seen.add(clauseId);
  }
  return seen;
}

export function computeScanProgress(
  events: ToolEvent[],
  leaseId?: string | null,
): ScanProgress {
  const { extract, extractIndex } = partitionByLatestExtract(events, leaseId);

  if (!extract) {
    return { phase: 'idle', total: 0, attempted: 0, label: '' };
  }

  const total = extract.clauses.length;
  const attempted = countAttemptsSince(events, extractIndex).size;

  if (attempted === 0) {
    return {
      phase: 'extracting',
      total,
      attempted: 0,
      label:
        total > 0
          ? `Scanning lease — ${total} clauses found`
          : 'Scanning lease…',
    };
  }

  if (attempted < total) {
    return {
      phase: 'grading',
      total,
      attempted,
      label: `Grading ${attempted} of ${total}…`,
    };
  }

  return {
    phase: 'complete',
    total,
    attempted,
    label: `Scan complete — ${total} clauses processed`,
  };
}

export function useScanProgress(): ScanProgress {
  const { toolEvents, activeLease } = useLeaseParser();
  const leaseId = activeLease?.lease_id ?? null;
  return useMemo(
    () => computeScanProgress(toolEvents, leaseId),
    [toolEvents, leaseId],
  );
}
