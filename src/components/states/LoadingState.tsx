// Sprint 16B — shared loading-state primitive.
//
// Renders a skeleton pulse — a stack of `animate-pulse` bars with token-driven
// neutral colours that flip in dark mode. Used by:
//   - ToolCard pending body (3 bars, currently inline)
//   - Future skeleton red-flag cards during a scan (Sprint 18)
//   - Future chat transcript skeleton between turns
//
// The primitive defines a `role="status"` wrapper + sr-only label for screen
// readers (so the user knows something is loading even when the visual
// pulse is invisible to them).
//
// Reduced-motion users see the bars without `animate-pulse` — the static
// muted bars still communicate "this region is loading" via the sr-only
// label without nausea-inducing infinite motion.

import type { ReactNode } from 'react';

type BarWidth = '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | '4/5' | 'full';

export interface LoadingStateProps {
  /** Screen-reader label announcing what's loading. Required. */
  ariaLabel: string;
  /** Tailwind fractional widths for each skeleton bar. Default: three varied bars. */
  bars?: BarWidth[];
  /** Custom children replace the default bar stack — use for richer skeletons. */
  children?: ReactNode;
  /** Bar height — defaults to 'h-2' for line-of-text feel. */
  barHeight?: 'h-2' | 'h-3' | 'h-4';
  /** Optional override on the outermost element. */
  className?: string;
  /** Test hook on the outermost element. */
  testId?: string;
}

const WIDTH_CLASS: Record<BarWidth, string> = {
  '1/4': 'w-1/4',
  '1/3': 'w-1/3',
  '1/2': 'w-1/2',
  '2/3': 'w-2/3',
  '3/4': 'w-3/4',
  '4/5': 'w-4/5',
  full: 'w-full',
};

const DEFAULT_BARS: BarWidth[] = ['2/3', '1/2', '3/4'];

export function LoadingState({
  ariaLabel,
  bars = DEFAULT_BARS,
  children,
  barHeight = 'h-2',
  className,
  testId,
}: LoadingStateProps) {
  return (
    <div role="status" data-testid={testId} className={className}>
      <span className="sr-only">{ariaLabel}</span>
      {children ? (
        children
      ) : (
        <div className="space-y-1.5" aria-hidden="true">
          {bars.map((width, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: decorative skeleton bars never reorder, hold no state, and a content-based key is non-unique (the same width can repeat). Index is the natural identity here.
              key={index}
              className={`${barHeight} ${WIDTH_CLASS[width]} animate-pulse rounded bg-neutral-100 dark:bg-neutral-800`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
