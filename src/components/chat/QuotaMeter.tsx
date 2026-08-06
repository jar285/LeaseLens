'use client';

/*
 * Sprint D.17ui (#17, #25) — QuotaMeter: the assistant drawer's usage
 * indicator, sitting in ChatUI's footer directly above the composer (Don
 * Norman: feedback at the site where the cost is incurred).
 *
 * Pure presenter — ChatUI owns the stream state ({quota} events + the
 * budget-pause), this renders it (Robert C. Martin: presentation split from
 * orchestration; same seam as AssistantContextBar, Sprint 55.1).
 *
 * Progressive disclosure (Dieter Rams; the Sage/Caregiver voice — calm,
 * never alarmist; Nielsen: visibility of system status):
 *   AMPLE    → nothing. A gauge for a mostly-full budget is decoration that
 *              manufactures anxiety on a parser-first surface.
 *   LOW      → a slim draining meter + "N questions left this hour". Severity
 *              is carried by text + icon + tone together (WCAG — never color
 *              alone; the SEVERITY_ICON vocabulary is reused so shapes mean
 *              the same thing everywhere).
 *   AT-LIMIT → the calm paused notice (typed {budget} event or an HTTP 429):
 *              names the limit, the reset expectation, and what still works.
 *              Warning tone, not danger red — a reached limit is expected
 *              behavior; red stays reserved for real failures (Nygard /
 *              Google SRE: graceful degradation of one dependency).
 *
 * Motion: the fill animates via transform (scaleX) only — never width (the
 * layout-animation ban) — and is gated by useReducedMotion (house
 * data-motion pattern).
 */

import { useReducedMotion } from 'motion/react';
import { SEVERITY_ICON } from '@/components/lease/SeverityBadge';

/** Show the meter once remaining/limit drops to this fraction (≤ 40%). */
export const QUOTA_LOW_THRESHOLD = 0.4;

/** Legacy demo emit carries no limit; fall back to the old ≤2 gate. */
const LEGACY_LOW_REMAINING = 2;

/**
 * The single low-state predicate — ChatUI uses it for the announce-once
 * crossing and this component for rendering, so the two can never disagree
 * (house rule: status logic lives in pure helpers; components consume).
 */
export function isQuotaLow(quota: {
  remaining: number;
  limit?: number;
}): boolean {
  return typeof quota.limit === 'number' && quota.limit > 0
    ? quota.remaining / quota.limit <= QUOTA_LOW_THRESHOLD
    : quota.remaining <= LEGACY_LOW_REMAINING;
}

export interface QuotaMeterProps {
  /** Latest per-session quota snapshot from the stream, or null before one. */
  quota: { remaining: number; limit?: number } | null;
  /** At-limit pause (typed budget event / 429), or null while running. */
  pause: { scope: 'daily' | 'rate'; retryAfterSeconds?: number } | null;
}

const LowIcon = SEVERITY_ICON.low; // Info — a heads-up, not a warning shout.
const PauseIcon = SEVERITY_ICON.medium; // AlertTriangle — the shared caution shape.

export function QuotaMeter({
  quota,
  pause,
}: QuotaMeterProps): React.JSX.Element | null {
  const reducedMotion = useReducedMotion();

  // At-limit wins over any stale low meter — one message at a time.
  if (pause) {
    return (
      <div
        data-testid="budget-notice"
        role="status"
        className="mx-6 mb-1 mt-2 flex items-start gap-2 rounded-md border border-warning-600/30 bg-warning-100/60 px-3 py-2 text-xs text-fg-default dark:bg-warning-600/10"
      >
        <PauseIcon
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-600"
        />
        <span>
          {pause.scope === 'daily'
            ? 'The assistant is paused for today. Your lease review and red flags stay available.'
            : "You've reached this hour's question limit. It resets within the hour. Your lease review stays available."}
        </span>
      </div>
    );
  }

  if (!quota || !isQuotaLow(quota)) return null;
  const { remaining, limit } = quota;

  const noun = remaining === 1 ? 'question' : 'questions';
  const hasMeter = typeof limit === 'number' && limit > 0;
  const fraction = hasMeter ? Math.max(0, Math.min(1, remaining / limit)) : 0;

  return (
    <div
      data-testid="quota-meter"
      data-motion={reducedMotion ? 'off' : 'on'}
      className="mx-6 mb-1 mt-2 flex flex-col gap-1.5 rounded-md border border-neutral-200 bg-surface-muted px-3 py-2 dark:border-neutral-700"
    >
      <div className="flex items-center gap-2 text-xs text-fg-default">
        <LowIcon
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-warning-600"
        />
        <span className="tabular-nums">
          {remaining} {noun} left this hour.
        </span>
      </div>
      {hasMeter && (
        <div
          role="progressbar"
          aria-label="Assistant questions remaining this hour"
          aria-valuenow={remaining}
          aria-valuemin={0}
          aria-valuemax={limit}
          className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
        >
          <div
            data-testid="quota-meter-fill"
            className={`h-full w-full origin-left rounded-full bg-warning-600 ${
              reducedMotion ? '' : 'transition-transform duration-300 ease-out'
            }`}
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      )}
    </div>
  );
}
