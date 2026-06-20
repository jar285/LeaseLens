'use client';

/*
 * Sprint 23d Phase 1 — SeverityBadge primitive.
 *
 * Communicates severity through three independent channels:
 *   1. icon (shape)   — AlertOctagon / AlertTriangle / Info / CheckCircle
 *   2. text label     — High / Med / Low / OK
 *   3. colour         — danger / warning / info / success tokens
 *
 * The icon channel closes the handoff §19 accessibility gap: a tenant
 * with red-green colour-blindness sees the same severity through icon
 * shape + text label even when the colour cue is muted. The icon is
 * decorative (aria-hidden); the visible text label is the accessible
 * name.
 *
 * Pure presentation. Props in, JSX out. Consumed by RedFlagReport
 * (card header + summary chips) and the empty-state preview card.
 */

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { SEVERITY_BADGE, SEVERITY_LABEL, type Severity } from './grading';

// Sprint 50.2 — exported so the verdict moment (RedFlagReport) can hang the
// SAME severity glyph beside the headline. One source of truth for
// severity→shape across the badge and the verdict; a tenant never sees a
// different icon for "high" in the two places.
export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  high: AlertOctagon,
  medium: AlertTriangle,
  low: Info,
  ok: CheckCircle,
};

export interface SeverityBadgeProps {
  severity: Severity;
  /**
   * `md` (default) — used inside red-flag card headers.
   * `sm` — used inside the summary count strip where vertical space
   * is tight; reduces text to 10px and tightens padding.
   */
  size?: 'sm' | 'md';
}

const SIZE_CLASS: Record<NonNullable<SeverityBadgeProps['size']>, string> = {
  md: 'px-1.5 py-0.5 text-[11px] gap-1',
  sm: 'px-1 py-0 text-[10px] gap-0.5',
};

const ICON_SIZE_CLASS: Record<
  NonNullable<SeverityBadgeProps['size']>,
  string
> = {
  md: 'h-3 w-3',
  sm: 'h-2.5 w-2.5',
};

export function SeverityBadge({
  severity,
  size = 'md',
}: SeverityBadgeProps): React.JSX.Element {
  const Icon = SEVERITY_ICON[severity];
  return (
    <span
      data-testid="severity-badge"
      data-severity={severity}
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wider ${SIZE_CLASS[size]} ${SEVERITY_BADGE[severity]}`}
    >
      <Icon
        aria-hidden="true"
        className={`${ICON_SIZE_CLASS[size]} shrink-0`}
        strokeWidth={2.5}
      />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
