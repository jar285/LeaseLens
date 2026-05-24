'use client';

/*
 * Sprint 27 — high-level scan lifecycle (red-flags panel).
 *
 * `useScanProgress` already exposes a low-level phase machine
 * (idle/extracting/grading/complete) used to drive skeleton counts
 * and the panel header. The new red-flags loading UX (Sprint 27)
 * narrates the same signal as six user-facing stages so the user can
 * always tell what the parser is doing (Jakob Nielsen: visibility of
 * system status; Don Norman: predictable interaction):
 *
 *   1. upload_received       — lease metadata is in, no stream yet
 *   2. reading_lease         — stream has begun, no extract event yet
 *   3. extracting_clauses    — extract_clauses tool result landed
 *   4. checking_clauses      — grade_clause_severity events in flight
 *   5. preparing_red_flags   — all clauses attempted; brief polish pause
 *   6. review_ready          — final stage; list is populated
 *
 * `computeScanLifecycleStage` is a pure function so every transition
 * is exhaustively unit-testable. The `useScanLifecycle` hook layers
 * a single short timer on top to advance preparing_red_flags →
 * review_ready (a calm narrative beat, not a real backend wait).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { type ScanProgress, useScanProgress } from './use-scan-progress';

export type ScanLifecycleStage =
  | 'idle'
  | 'upload_received'
  | 'reading_lease'
  | 'extracting_clauses'
  | 'checking_clauses'
  | 'preparing_red_flags'
  | 'review_ready';

export const LIFECYCLE_STAGES: ScanLifecycleStage[] = [
  'upload_received',
  'reading_lease',
  'extracting_clauses',
  'checking_clauses',
  'preparing_red_flags',
  'review_ready',
];

export interface ScanLifecycleSnapshot {
  /** Current lifecycle stage. `idle` when no lease is active. */
  stage: ScanLifecycleStage;
  /**
   * Index into `LIFECYCLE_STAGES`. `-1` when `stage === 'idle'`. Lets
   * the UI mark earlier rows complete, the current row active, and
   * later rows pending without a manual switch statement.
   */
  index: number;
  /** Short, user-facing label for the current stage. */
  label: string;
  /** Optional subtext (e.g. "12 clauses found", "Grading 7 of 12"). */
  detail: string | null;
  /** Underlying scan progress, exposed for callers that need it. */
  progress: ScanProgress;
}

const STAGE_LABELS: Record<Exclude<ScanLifecycleStage, 'idle'>, string> = {
  upload_received: 'Upload received',
  reading_lease: 'Reading the lease',
  extracting_clauses: 'Extracting clauses',
  checking_clauses: 'Checking clauses against NJ tenant-law rules',
  preparing_red_flags: 'Preparing red flags',
  review_ready: 'Review ready',
};

export interface ScanLifecycleInputs {
  hasActiveLease: boolean;
  toolEvents: ToolEvent[];
  scanProgress: ScanProgress;
  /**
   * True once the brief "preparing red flags" beat has elapsed. The
   * hook layer flips this with a short setTimeout after grading
   * completes; tests pass `false` or `true` directly.
   */
  preparingDone: boolean;
}

export function computeScanLifecycleStage(
  inputs: ScanLifecycleInputs,
): ScanLifecycleSnapshot {
  const { hasActiveLease, toolEvents, scanProgress, preparingDone } = inputs;

  // `idle` means "nothing is happening the user should track". Three
  // cases collapse to idle:
  //   1. No active lease and no scan in flight.
  //   2. Degenerate scan — extract resolved with zero clauses. Showing
  //      the 6-stage panel stuck on "Extracting clauses" forever
  //      would lie to the user (Don Norman: avoid misleading signals);
  //      the empty state with example preview is the right surface.
  // A scan in flight with a non-zero total is authoritative even if
  // `activeLease` is momentarily null (rehydration race, test fixture).
  const isDegenerateExtract =
    scanProgress.phase === 'extracting' && scanProgress.total === 0;
  if (
    (!hasActiveLease && scanProgress.phase === 'idle') ||
    isDegenerateExtract
  ) {
    return {
      stage: 'idle',
      index: -1,
      label: '',
      detail: null,
      progress: scanProgress,
    };
  }

  if (scanProgress.phase === 'idle') {
    const stage: ScanLifecycleStage =
      toolEvents.length === 0 ? 'upload_received' : 'reading_lease';
    return {
      stage,
      index: LIFECYCLE_STAGES.indexOf(stage),
      label: STAGE_LABELS[stage],
      detail: null,
      progress: scanProgress,
    };
  }

  if (scanProgress.phase === 'extracting') {
    return {
      stage: 'extracting_clauses',
      index: LIFECYCLE_STAGES.indexOf('extracting_clauses'),
      label: STAGE_LABELS.extracting_clauses,
      detail:
        scanProgress.total > 0 ? `${scanProgress.total} clauses found` : null,
      progress: scanProgress,
    };
  }

  if (scanProgress.phase === 'grading') {
    return {
      stage: 'checking_clauses',
      index: LIFECYCLE_STAGES.indexOf('checking_clauses'),
      label: STAGE_LABELS.checking_clauses,
      detail: `Grading ${scanProgress.attempted} of ${scanProgress.total}`,
      progress: scanProgress,
    };
  }

  // phase === 'complete' from here down.
  if (!preparingDone) {
    return {
      stage: 'preparing_red_flags',
      index: LIFECYCLE_STAGES.indexOf('preparing_red_flags'),
      label: STAGE_LABELS.preparing_red_flags,
      detail: null,
      progress: scanProgress,
    };
  }

  return {
    stage: 'review_ready',
    index: LIFECYCLE_STAGES.indexOf('review_ready'),
    label: STAGE_LABELS.review_ready,
    detail: scanProgress.total > 0 ? `${scanProgress.total} clauses` : null,
    progress: scanProgress,
  };
}

export function stageLabel(stage: ScanLifecycleStage): string {
  if (stage === 'idle') return '';
  return STAGE_LABELS[stage];
}

// How long the "preparing red flags" beat holds before transitioning
// to "review ready". Long enough to register as a distinct step in
// the user's head; short enough to feel like polish, not a wait.
const PREPARING_HOLD_MS = 650;

export function useScanLifecycle(): ScanLifecycleSnapshot {
  const { toolEvents, activeLease } = useChatStream();
  const scanProgress = useScanProgress();
  const [preparingDone, setPreparingDone] = useState(false);

  useEffect(() => {
    if (scanProgress.phase !== 'complete') {
      setPreparingDone(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPreparingDone(true);
    }, PREPARING_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [scanProgress.phase]);

  return useMemo(
    () =>
      computeScanLifecycleStage({
        hasActiveLease: activeLease !== null,
        toolEvents,
        scanProgress,
        preparingDone,
      }),
    [activeLease, toolEvents, scanProgress, preparingDone],
  );
}
