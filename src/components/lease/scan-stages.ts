'use client';

/*
 * Sprint 18 §5 — thematic scan stages.
 *
 * The chat stream emits two raw event kinds during a standard scan:
 * one `extract_clauses` result and one `grade_clause_severity` event
 * per clause. That's enough trace for a Reviewer/Admin to audit, but
 * for a Tenant we want narrative: "Extracting clauses → Checking
 * security deposit terms → Reviewing fees and penalties → …".
 *
 * This module converts the same `toolEvents` slice that `useScanProgress`
 * already reads into an ordered list of `ScanStage` rows. Pure derivation
 * — no extra state, no parallel machine. Same source of truth.
 *
 * Reveal rules:
 *   - The `extract` stage appears immediately when extract_clauses returns.
 *   - A `grade:<clause_type>` stage appears the first time a clause of
 *     that type is graded (success OR error — we count attempts so an
 *     erroring scan still advances the timeline).
 *   - The `report` synthetic stage appears once every extracted clause
 *     has at least one tool_result for it.
 *
 * The stage order in the returned array matches the order in which each
 * stage was first observed. We sort by `firstSeenIndex` explicitly to
 * defend against any future re-ordering of the toolEvents array.
 */

import { useMemo } from 'react';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { useChatStream } from '@/components/chat/ChatStreamContext';
import { isGradingResult, STAGE_LABEL, STAGE_LABEL_FALLBACK } from './grading';
import { partitionByLatestExtract } from './use-scan-progress';

export type StageStatus = 'pending' | 'active' | 'complete' | 'error';

export interface ScanStage {
  /**
   * `'extract'`, `'report'`, or `'grade:<clause_type>'`. Stable identity
   * across renders — React keys can use this directly.
   */
  stageId: string;
  /** Human-readable stage label, e.g. "Checking security deposit terms". */
  label: string;
  status: StageStatus;
  /**
   * Number of clauses in this stage's bucket. 0 for the synthetic
   * `extract` and `report` stages (they don't have a per-clause counter).
   */
  clausesTotal: number;
  /**
   * Number of clauses in this bucket that have a tool_result (success or
   * error). Mirrors the attempt-counting in `useScanProgress` so an
   * errored grading still ticks progress.
   */
  clausesGraded: number;
  /**
   * S19.6 — number of clauses in this bucket whose latest tool_result
   * was an error (no successful retry overrode it). When this equals
   * `clausesGraded` and `clausesGraded === clausesTotal`, the stage
   * status becomes `'error'`. When > 0 but < clausesGraded, the stage
   * stays `'complete'` and the row can surface a "(N skipped)"
   * annotation.
   */
  clausesErrored: number;
  /** Position in toolEvents where this stage was first observed. */
  firstSeenIndex: number;
}

const STAGE_ID_EXTRACT = 'extract';
const STAGE_ID_REPORT = 'report';
const STAGE_LABEL_EXTRACT = 'Extracting clauses';
const STAGE_LABEL_REPORT = 'Preparing red flag report';
const UNKNOWN_CLAUSE_TYPE = 'unknown';

function labelForClauseType(clauseType: string): string {
  return STAGE_LABEL[clauseType] ?? STAGE_LABEL_FALLBACK;
}

function readInputClauseId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const id = (input as { clause_id?: unknown }).clause_id;
  return typeof id === 'string' ? id : null;
}

/*
 * Pure derivation. Takes the full toolEvents array (which may contain
 * events from prior scans) and returns the ordered stage list for the
 * current scan only.
 */
export function computeScanStages(events: ToolEvent[]): ScanStage[] {
  const { extract, extractIndex } = partitionByLatestExtract(events);

  if (!extract) {
    return [];
  }

  // Build clause_id → clause_type lookup from the extract result. Stages
  // are keyed by the human-readable label, not the raw clause_type, so
  // grouped types (late_fee + attorneys_fees + indemnification → "fees
  // and penalties") naturally collapse into one row.
  const clauseTypeById = new Map<string, string>();
  const clauseTotalsByLabel = new Map<string, number>();
  for (const clause of extract.clauses) {
    const clauseType = clause.clause_type ?? UNKNOWN_CLAUSE_TYPE;
    clauseTypeById.set(clause.clause_id, clauseType);
    const stageLabel = labelForClauseType(clauseType);
    clauseTotalsByLabel.set(
      stageLabel,
      (clauseTotalsByLabel.get(stageLabel) ?? 0) + 1,
    );
  }

  const stages: ScanStage[] = [];

  // Stage 1 — extract is already done by the time this function runs
  // with a non-null extract. The synthetic in-flight state (extracting
  // before extract resolves) is handled by useScanProgress; this module
  // is post-extract only.
  stages.push({
    stageId: STAGE_ID_EXTRACT,
    label: STAGE_LABEL_EXTRACT,
    status: 'complete',
    clausesTotal: 0,
    clausesGraded: 0,
    clausesErrored: 0,
    firstSeenIndex: extractIndex,
  });

  // Walk grade events. The first event for a given stage label promotes
  // that stage to `active`; subsequent events of the same label increment
  // `clausesGraded`. We dedupe per clause_id within a stage by storing
  // the latest outcome (success or error) — a successful retry overrides
  // a prior error so the stage doesn't keep claiming a clause failed.
  const stagesByLabel = new Map<string, ScanStage>();
  // Per stage: clause_id → errored flag (latest outcome).
  const latestOutcomeByLabel = new Map<string, Map<string, boolean>>();

  for (let i = extractIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.tool_name !== 'grade_clause_severity') continue;
    const clauseId = readInputClauseId(event.input);
    if (clauseId === null) continue;

    const clauseType = clauseTypeById.get(clauseId) ?? UNKNOWN_CLAUSE_TYPE;
    const stageLabel = labelForClauseType(clauseType);
    let stage = stagesByLabel.get(stageLabel);
    if (!stage) {
      stage = {
        stageId: `grade:${stageLabel}`,
        label: stageLabel,
        status: 'active',
        clausesTotal: clauseTotalsByLabel.get(stageLabel) ?? 0,
        clausesGraded: 0,
        clausesErrored: 0,
        firstSeenIndex: i,
      };
      stagesByLabel.set(stageLabel, stage);
      latestOutcomeByLabel.set(stageLabel, new Map());
      stages.push(stage);
    }
    const outcomeMap = latestOutcomeByLabel.get(stageLabel) ?? new Map();
    const errored = !isGradingResult(event.result);
    const isNewClause = !outcomeMap.has(clauseId);
    outcomeMap.set(clauseId, errored);
    if (isNewClause) {
      stage.clausesGraded += 1;
    }
  }

  // Second pass — once every event has been visited, recompute each
  // grade stage's clausesErrored + final status from the latest-outcome
  // map. Doing this after the walk (rather than during) lets a later
  // success cleanly override an earlier error without double-counting.
  for (const [label, outcomes] of latestOutcomeByLabel) {
    const stage = stagesByLabel.get(label);
    if (!stage) continue;
    let errored = 0;
    for (const [, isErrored] of outcomes) {
      if (isErrored) errored += 1;
    }
    stage.clausesErrored = errored;
    if (stage.clausesGraded >= stage.clausesTotal) {
      // All attempted. 'error' only when every attempt errored;
      // otherwise 'complete' (the row can still flag partial errors
      // via clausesErrored).
      stage.status =
        errored > 0 && errored === stage.clausesGraded ? 'error' : 'complete';
    }
  }

  // Stage final — synthetic "Preparing red flag report" appears when
  // every clause in the extract has been attempted. Uses the same
  // attempt-counting logic as useScanProgress (input.clause_id-based).
  const attemptedClauseIds = new Set<string>();
  for (let i = extractIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.tool_name !== 'grade_clause_severity') continue;
    const clauseId = readInputClauseId(event.input);
    if (clauseId !== null) attemptedClauseIds.add(clauseId);
  }
  if (
    extract.clauses.length > 0 &&
    attemptedClauseIds.size >= extract.clauses.length
  ) {
    stages.push({
      stageId: STAGE_ID_REPORT,
      label: STAGE_LABEL_REPORT,
      status: 'complete',
      clausesTotal: 0,
      clausesGraded: 0,
      clausesErrored: 0,
      firstSeenIndex: events.length,
    });
  }

  // Stable order by firstSeenIndex — preserves the natural reveal order
  // even if the input is somehow reordered in the future.
  stages.sort((a, b) => a.firstSeenIndex - b.firstSeenIndex);

  return stages;
}

export function useScanStages(): ScanStage[] {
  const { toolEvents } = useChatStream();
  return useMemo(() => computeScanStages(toolEvents), [toolEvents]);
}
