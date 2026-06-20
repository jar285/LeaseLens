'use client';

// Sprint 46.2 — derive per-page highlight targets from scan tool events.
//
// Highlights are only meaningful once a scan is complete and clauses are
// graded. This joins the latest extract_clauses result (clause text +
// page) with the latest grade_clause_severity result (severity), keeps
// only graded clauses (the red flags), and groups them by page in
// clause_index order — exactly what the customTextRenderer matcher needs.
//
// It reuses the same "current scan" anchor (partitionByLatestExtract) and
// the same last-wins grading scan + lease filter that RedFlagReport uses,
// so the highlights can never disagree with the cards (one source of
// truth for "what was graded on this lease").

import { useMemo } from 'react';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { isGradingResult, type Severity } from './grading';
import { useLeaseParser } from './LeaseParserContext';
import {
  computeScanProgress,
  partitionByLatestExtract,
} from './use-scan-progress';

export interface ClauseHighlightTarget {
  clauseId: string;
  pageNumber: number;
  /** The clause text to match against the page's text layer. */
  text: string;
  severity: Severity;
  clauseIndex: number;
  /** clause_type (e.g. 'security_deposit') — drives the highlight's aria-label. */
  clauseType?: string;
}

export interface ClauseHighlights {
  /** Graded clauses for the active lease, grouped by 1-based page. */
  byPage: Map<number, ClauseHighlightTarget[]>;
  /** Total graded targets across all pages. */
  count: number;
}

const EMPTY: ClauseHighlights = { byPage: new Map(), count: 0 };

// extract_clauses clauses carry more than use-scan-progress's typeguard
// asserts (it only requires `clauses: Array`); read the extra fields
// defensively here rather than widening the shared guard.
function readText(clause: unknown): string | null {
  const t = (clause as { text?: unknown }).text;
  return typeof t === 'string' && t.length > 0 ? t : null;
}

function readPage(clause: unknown): number | null {
  const p = (clause as { page_number?: unknown }).page_number;
  return typeof p === 'number' && p >= 1 ? p : null;
}

function readType(clause: unknown): string | undefined {
  const t = (clause as { clause_type?: unknown }).clause_type;
  return typeof t === 'string' ? t : undefined;
}

export function computeClauseHighlights(
  events: ToolEvent[],
  leaseId: string | null,
): ClauseHighlights {
  // Gate on scan-complete: partial highlighting would flicker as grades
  // land, and the spec shows highlights only after the scan finishes.
  if (computeScanProgress(events, leaseId).phase !== 'complete') return EMPTY;

  const { extract } = partitionByLatestExtract(events, leaseId);
  if (!extract) return EMPTY;

  const allowed = new Set(extract.clauses.map((c) => c.clause_id));
  const severityById = new Map<string, Severity>();
  for (const event of events) {
    if (event.tool_name !== 'grade_clause_severity') continue;
    if (!isGradingResult(event.result)) continue;
    if (!allowed.has(event.result.clause_id)) continue;
    severityById.set(event.result.clause_id, event.result.severity);
  }

  const byPage = new Map<number, ClauseHighlightTarget[]>();
  let count = 0;
  for (const clause of extract.clauses) {
    const severity = severityById.get(clause.clause_id);
    if (!severity) continue; // ungraded clauses are not red flags
    const text = readText(clause);
    const pageNumber = readPage(clause);
    if (!text || pageNumber === null) continue;
    const target: ClauseHighlightTarget = {
      clauseId: clause.clause_id,
      pageNumber,
      text,
      severity,
      clauseIndex: clause.clause_index ?? 0,
      clauseType: readType(clause),
    };
    const list = byPage.get(pageNumber);
    if (list) list.push(target);
    else byPage.set(pageNumber, [target]);
    count += 1;
  }

  // Forward-cursor matching depends on clause_index order within a page.
  for (const list of byPage.values()) {
    list.sort((a, b) => a.clauseIndex - b.clauseIndex);
  }

  return { byPage, count };
}

export function useClauseHighlights(): ClauseHighlights {
  const { toolEvents, activeLease } = useLeaseParser();
  const leaseId = activeLease?.lease_id ?? null;
  return useMemo(
    () => computeClauseHighlights(toolEvents, leaseId),
    [toolEvents, leaseId],
  );
}
