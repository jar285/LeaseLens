'use client';

/*
 * Sprint 18 §1 — right-pane header for the red-flag rail.
 *
 * Replaces the inline `<header>` that LeaseLensWorkspaceShell used to
 * render. It shows the "Red flags" eyebrow and, when a scan is in flight,
 * a live progress label fed by useScanProgress. The label phases through
 * `extracting → grading clause N of M → complete`; when complete or idle
 * the label is dropped and only the eyebrow is shown, so the static
 * resting header is identical to the pre-Sprint-18 baseline.
 *
 * A small spinning ring sits next to the label while the scan is in
 * flight — visible status, no layout shift. Reduced motion swaps the ring
 * for a static dot.
 */

import { motion, useReducedMotion } from 'motion/react';
import { HighlightControls } from './HighlightControls';
import { useScanProgress } from './use-scan-progress';

export function RedFlagsPaneHeader(): React.JSX.Element {
  const progress = useScanProgress();
  const reduced = useReducedMotion();

  const inFlight =
    progress.phase === 'extracting' || progress.phase === 'grading';

  return (
    <header
      data-testid="shell-right-pane-header"
      className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-surface-card px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Sprint 23d Phase 5 — tightened tracking from 0.14em to 0.12em
          so the eyebrow reads as a dense risk-radar label rather than
          a marketing strap-line. The font size and weight are
          unchanged. */}
      <h2 className="text-[11px] font-semibold tracking-[0.12em] text-fg-muted uppercase">
        Red flags
      </h2>
      {inFlight ? (
        <div
          data-testid="scan-progress-label"
          aria-live="polite"
          className="flex min-w-0 items-center gap-1.5 text-[11px] text-fg-muted"
        >
          {reduced ? (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"
            />
          ) : (
            <motion.span
              aria-hidden="true"
              className="block h-3 w-3 shrink-0 rounded-full border-2 border-accent-200 border-t-accent-500"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
            />
          )}
          <span className="truncate tabular">{progress.label}</span>
        </div>
      ) : (
        // Sprint 46.7 — once the scan is done, the right slot carries the
        // highlight controls (it self-gates on whether any clause was
        // graded, so it stays empty during idle / pre-scan).
        <HighlightControls />
      )}
    </header>
  );
}
