'use client';

/*
 * Sprint 18 §2 — placeholder card while a clause is being graded.
 *
 * Mirrors the real RedFlagReport card silhouette (severity bar, header
 * row, reasoning lines, citation chip) using neutral placeholder bars,
 * so the rail keeps its visual rhythm during the scan instead of jumping
 * from "empty state" to "cards" with no in-between cue. The pulse is a
 * shared 1.4s opacity sine wave (offset slightly per row so the rows
 * don't all blink at the same instant). `prefers-reduced-motion` users
 * see a static low-contrast card.
 */

import { motion, useReducedMotion } from 'motion/react';

const PULSE_DURATION_S = 1.4;
const PULSE_RANGE = [0.55, 1, 0.55] as const;

interface PulseBarProps {
  className: string;
  delay?: number;
  reduced: boolean;
}

function PulseBar({
  className,
  delay = 0,
  reduced,
}: PulseBarProps): React.JSX.Element {
  if (reduced) {
    return <span aria-hidden="true" className={`${className} opacity-60`} />;
  }
  return (
    <motion.span
      aria-hidden="true"
      className={className}
      animate={{ opacity: PULSE_RANGE as unknown as number[] }}
      transition={{
        duration: PULSE_DURATION_S,
        ease: 'easeInOut',
        repeat: Infinity,
        delay,
      }}
    />
  );
}

export function RedFlagSkeletonCard({
  delay = 0,
}: {
  /** Stagger offset (seconds) so a list of skeletons doesn't pulse in lock-step. */
  delay?: number;
}): React.JSX.Element {
  const reduced = useReducedMotion() ?? false;

  return (
    <article
      data-testid="red-flag-skeleton-card"
      aria-hidden="true"
      className="relative overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Left severity-bar placeholder — neutral, no severity colour leaks */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 h-full w-1 bg-neutral-200 dark:bg-neutral-700"
      />
      <div className="flex items-start gap-2 py-3 pr-3 pl-4">
        <div className="min-w-0 flex-1 space-y-2">
          {/* Severity badge + clause label row.
              Sprint 23d Phase 3 — added a circle placeholder where the
              SeverityBadge icon will live so the skeleton mirrors the
              new real-card silhouette (icon + label + colour). */}
          <div className="flex items-center gap-1.5">
            <PulseBar
              className="block h-3 w-3 rounded-full bg-neutral-200 dark:bg-neutral-700"
              delay={delay}
              reduced={reduced}
            />
            <PulseBar
              className="block h-3 w-12 rounded-full bg-neutral-200 dark:bg-neutral-700"
              delay={delay + 0.03}
              reduced={reduced}
            />
            <PulseBar
              className="block h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-700"
              delay={delay + 0.05}
              reduced={reduced}
            />
          </div>
          {/* Reasoning placeholder — two lines */}
          <div className="space-y-1.5">
            <PulseBar
              className="block h-2.5 w-full rounded bg-neutral-150 dark:bg-neutral-800"
              delay={delay + 0.1}
              reduced={reduced}
            />
            <PulseBar
              className="block h-2.5 w-3/4 rounded bg-neutral-150 dark:bg-neutral-800"
              delay={delay + 0.15}
              reduced={reduced}
            />
          </div>
          {/* Citation placeholder */}
          <PulseBar
            className="block h-2.5 w-20 rounded bg-neutral-150 dark:bg-neutral-800"
            delay={delay + 0.2}
            reduced={reduced}
          />
        </div>
      </div>
    </article>
  );
}
