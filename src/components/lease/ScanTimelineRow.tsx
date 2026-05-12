'use client';

/*
 * Sprint 18 §5 — single row of the ScanTimeline.
 *
 * Pure presentation. Receives a `ScanStage` and renders:
 *   - a status icon (never colour-only — shape carries meaning too)
 *   - the human-readable stage label
 *   - a per-clause sub-counter when applicable ("2 of 3")
 *
 * The active-state pulse animates only when motion is allowed; under
 * `prefers-reduced-motion` the dot is static. The semantic colours
 * (neutral / accent / success) reference the @theme tokens declared in
 * `src/app/globals.css`, so dark-mode flips happen automatically via the
 * `dark:` variant — no per-component overrides.
 */

import { Check } from 'lucide-react';
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

export interface ScanTimelineRowProps {
  stage: ScanStage;
}

export function ScanTimelineRow({
  stage,
}: ScanTimelineRowProps): React.JSX.Element {
  const reduced = useReducedMotion() ?? false;
  const counter = formatCounter(stage);
  return (
    <li
      data-testid="scan-stage-row"
      data-stage-id={stage.stageId}
      data-status={stage.status}
      className="flex items-center gap-2.5 py-1.5"
    >
      <StatusIcon status={stage.status} reduced={reduced} />
      <span
        className={`flex-1 text-[13px] ${
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
    </li>
  );
}
