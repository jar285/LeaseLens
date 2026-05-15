'use client';

/*
 * Sprint 18 §5 — single row of the ScanTimeline.
 *
 * Pure presentation. Receives a `ScanStage` and renders:
 *   - a status icon (never colour-only — shape carries meaning too)
 *   - the human-readable stage label
 *   - a per-clause sub-counter when applicable ("2 of 3")
 *   - S19.6: an error variant when every grade attempt in this bucket
 *     errored, plus a "(N skipped)" annotation when some but not all
 *     attempts errored. The error variant is paired with friendly text
 *     so severity is never colour-only.
 *
 * The active-state pulse animates only when motion is allowed; under
 * `prefers-reduced-motion` the dot is static. The semantic colours
 * (neutral / accent / success / warning) reference the @theme tokens
 * declared in `src/app/globals.css`, so dark-mode flips happen
 * automatically via the `dark:` variant — no per-component overrides.
 */

import { AlertTriangle, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ScanStage } from './scan-stages';

interface StatusIconProps {
  status: ScanStage['status'];
  reduced: boolean;
}

function StatusIcon({ status, reduced }: StatusIconProps): React.JSX.Element {
  if (status === 'complete') {
    return (
      <span
        aria-hidden="true"
        data-testid="scan-stage-icon-complete"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-600 text-white"
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        aria-hidden="true"
        data-testid="scan-stage-icon-error"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-600 dark:bg-warning-600/15 dark:text-warning-100"
      >
        <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'active') {
    if (reduced) {
      return (
        <span
          aria-hidden="true"
          data-testid="scan-stage-icon-active"
          className="block h-4 w-4 shrink-0 rounded-full bg-accent-500 dark:bg-accent-400"
        />
      );
    }
    return (
      <motion.span
        aria-hidden="true"
        data-testid="scan-stage-icon-active"
        className="block h-4 w-4 shrink-0 rounded-full bg-accent-500 dark:bg-accent-400"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{
          duration: 1.4,
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      />
    );
  }
  // pending
  return (
    <span
      aria-hidden="true"
      data-testid="scan-stage-icon-pending"
      className="block h-4 w-4 shrink-0 rounded-full border-2 border-neutral-300 bg-transparent dark:border-neutral-600"
    />
  );
}

function formatCounter(stage: ScanStage): string | null {
  if (stage.clausesTotal === 0) return null;
  return `${stage.clausesGraded} of ${stage.clausesTotal}`;
}

// S19.6 — friendly summary for an all-errored stage. Keeps the
// information that a section was *attempted* (rather than skipped
// silently) so the tenant doesn't think a clause was missed.
function errorMessage(stage: ScanStage): string {
  if (stage.clausesErrored === 1) {
    return 'I had trouble grading this one — I skipped it and kept going.';
  }
  return `I had trouble grading ${stage.clausesErrored} clauses in this section — I skipped them and kept going.`;
}

export interface ScanTimelineRowProps {
  stage: ScanStage;
}

export function ScanTimelineRow({
  stage,
}: ScanTimelineRowProps): React.JSX.Element {
  const reduced = useReducedMotion() ?? false;
  const counter = formatCounter(stage);
  const isError = stage.status === 'error';
  const partial =
    stage.status === 'complete' && stage.clausesErrored > 0
      ? stage.clausesErrored
      : 0;

  return (
    <li
      data-testid="scan-stage-row"
      data-stage-id={stage.stageId}
      data-status={stage.status}
      className="flex flex-col gap-0.5 py-1.5"
    >
      <div className="flex items-center gap-2.5">
        <StatusIcon status={stage.status} reduced={reduced} />
        {/* Sprint 23c Phase 4 — stage label tightens with font-medium +
            tracking-tight so the scan rhythm reads as a deliberate
            progress strip rather than an event log. */}
        <span
          className={`flex-1 text-[13px] font-medium tracking-tight ${
            stage.status === 'pending' ? 'text-fg-subtle' : 'text-fg-default'
          }`}
        >
          {stage.label}
        </span>
        {counter ? (
          <span
            data-testid="scan-stage-counter"
            className="tabular text-[11px] font-medium text-fg-muted"
          >
            {counter}
          </span>
        ) : null}
        {partial > 0 ? (
          <span
            data-testid="scan-stage-partial"
            className="tabular text-[11px] font-medium text-warning-600 dark:text-warning-100"
          >
            {partial} skipped
          </span>
        ) : null}
      </div>
      {isError ? (
        <span
          data-testid="scan-stage-error-message"
          className="ml-6.5 text-[12px] leading-snug text-fg-subtle"
        >
          {errorMessage(stage)}
        </span>
      ) : null}
    </li>
  );
}
