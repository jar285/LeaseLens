'use client';

/*
 * Sprint 27 — six-stage scan-lifecycle panel for the red-flags column.
 *
 * Replaces the bare skeleton stack that used to render while the
 * standard scan was in flight. The new pane narrates the parser's
 * work so the user always knows what's happening (Jakob Nielsen:
 * visibility of system status) and what comes next (Don Norman:
 * predictable interaction):
 *
 *   1. Upload received
 *   2. Reading the lease
 *   3. Extracting clauses
 *   4. Checking clauses against NJ tenant-law rules
 *   5. Preparing red flags
 *   6. Review ready
 *
 * Each row carries a status indicator (complete / active / pending),
 * the stage label, and — for the currently active row only — an
 * optional subtext line carrying live counts ("Grading 7 of 12").
 *
 * Purely presentational: parent computes the snapshot via
 * `useScanLifecycle()` and passes it in. This isolates the timer-
 * driven side of the lifecycle from the visual contract.
 *
 * Motion: 220ms stagger on the row reveal. Honors `prefers-reduced-
 * motion` — animation collapses to instant state updates.
 */

import { Check, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  LIFECYCLE_STAGES,
  type ScanLifecycleSnapshot,
  type ScanLifecycleStage,
  stageLabel,
} from './scan-lifecycle';

type RowStatus = 'complete' | 'active' | 'pending';

function statusFor(
  rowStage: ScanLifecycleStage,
  currentIndex: number,
): RowStatus {
  const rowIndex = LIFECYCLE_STAGES.indexOf(rowStage);
  if (rowIndex < currentIndex) return 'complete';
  if (rowIndex === currentIndex) return 'active';
  return 'pending';
}

export interface RedFlagsLoadingStateProps {
  snapshot: ScanLifecycleSnapshot;
}

export function RedFlagsLoadingState({
  snapshot,
}: RedFlagsLoadingStateProps): React.JSX.Element | null {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  if (snapshot.stage === 'idle') return null;

  const currentIndex = snapshot.index;
  const completed = Math.max(0, currentIndex);
  const totalSteps = LIFECYCLE_STAGES.length;
  // Inclusive of the current row, so the bar reads "in this stage" not
  // "after this stage" — matches how the rows above it look complete.
  const progressPct = Math.min(
    100,
    Math.round(((completed + 1) / totalSteps) * 100),
  );

  return (
    <section
      data-testid="red-flag-loading-state"
      aria-label="Lease scan progress"
      className="flex flex-col gap-3"
    >
      {/* Thin progress rail — calm, single-channel hint of overall
          completeness. The labeled stage list below is the primary
          signal; the bar is a glanceable secondary cue. */}
      <div
        aria-hidden="true"
        className="relative h-1 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent-500/80 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol
        data-testid="red-flag-lifecycle"
        aria-live="polite"
        className="flex flex-col gap-2.5 rounded-lg border border-neutral-100 bg-surface-card p-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {LIFECYCLE_STAGES.map((stage, i) => {
          const status = statusFor(stage, currentIndex);
          const isActive = status === 'active';
          const detail = isActive ? snapshot.detail : null;
          // Stagger reveal — keeps the panel calm. Reduced motion
          // collapses to instant.
          const delay = animate ? i * 0.05 : 0;

          const Row = animate ? motion.li : 'li';
          const motionProps = animate
            ? ({
                initial: { opacity: 0, x: -4 },
                animate: { opacity: 1, x: 0 },
                transition: { duration: 0.22, delay, ease: 'easeOut' },
              } as const)
            : {};

          return (
            <Row
              key={stage}
              data-status={status}
              data-stage={stage}
              className="flex items-start gap-2.5"
              {...motionProps}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                  status === 'complete'
                    ? 'bg-accent-500/15 text-accent-700 dark:text-accent-300'
                    : status === 'active'
                      ? 'bg-accent-500/20 text-accent-700 dark:text-accent-300'
                      : 'bg-neutral-100 text-fg-subtle dark:bg-neutral-800'
                }`}
              >
                {status === 'complete' ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                ) : status === 'active' ? (
                  <Loader2
                    className={`h-3 w-3 ${animate ? 'animate-spin' : ''}`}
                    strokeWidth={2.5}
                  />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[12px] leading-snug ${
                    status === 'pending'
                      ? 'text-fg-subtle'
                      : status === 'active'
                        ? 'font-medium text-fg-default'
                        : 'text-fg-muted'
                  }`}
                >
                  {stageLabel(stage)}
                </p>
                {detail ? (
                  <p
                    data-testid="red-flag-lifecycle-detail"
                    className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-subtle"
                  >
                    {detail}
                  </p>
                ) : null}
              </div>
            </Row>
          );
        })}
      </ol>
    </section>
  );
}
