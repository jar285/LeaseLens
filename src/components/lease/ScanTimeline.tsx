'use client';

/*
 * Sprint 18 §5 — tenant-facing scan timeline.
 *
 * Replaces the linear stack of ToolCards inside the assistant bubble
 * when the viewer is in Tenant mode (DB role `Creator`). Renders the
 * stages produced by `useScanStages()` — one row per stage, revealing
 * in order as events arrive.
 *
 * Phase 1 ships the timeline + a *disabled* "Show what I did" button
 * that signals more is coming in Phase 2 (the ActivityDrawer). The
 * button is rendered but inert so users learn the affordance exists
 * without the implementation lag feeling like a bug.
 */

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ScanTimelineRow } from './ScanTimelineRow';
import type { ScanStage } from './scan-stages';
import { useScanStages } from './scan-stages';

const STAGE_REVEAL_DURATION_S = 0.22;
const STAGE_REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export interface ScanTimelineProps {
  /**
   * Number of underlying tool invocations in this scan turn. Surfaces
   * as "Show what I did (N steps)" on the drawer toggle so the user
   * knows what's behind the curtain even before they open it.
   */
  invocationCount: number;
}

export function ScanTimeline({
  invocationCount,
}: ScanTimelineProps): React.JSX.Element | null {
  const stages = useScanStages();
  const reduced = useReducedMotion() ?? false;

  if (stages.length === 0) {
    // No extract event yet — nothing to render. ChatMessage's role-gated
    // branch keeps the tool-card list visible during this pre-scan
    // window (no race; this branch fires only AFTER tool events arrive).
    return null;
  }

  return (
    <section
      data-testid="scan-timeline"
      aria-label="Scan progress"
      className="my-2 rounded-xl border border-neutral-200 bg-surface-card px-4 py-3 shadow-hairline dark:border-neutral-800 dark:bg-neutral-900"
    >
      <ol className="m-0 list-none p-0">
        <AnimatePresence initial={false}>
          {stages.map((stage) =>
            reduced ? (
              <ScanTimelineRow key={stage.stageId} stage={stage} />
            ) : (
              <motion.div
                key={stage.stageId}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: STAGE_REVEAL_DURATION_S,
                  ease: STAGE_REVEAL_EASE,
                }}
              >
                <ScanTimelineRow stage={stage} />
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </ol>
      {/*
        Activity-drawer toggle. Phase 1 ships disabled — Phase 2 wires
        it to <ActivityDrawer />. Rendering the button now (with a clear
        "disabled" affordance) signals the surface exists so users learn
        the pattern before it lights up.
      */}
      <div
        data-testid="scan-timeline-drawer-toggle-wrap"
        className="mt-3 border-t border-neutral-100 pt-2.5 dark:border-neutral-800"
      >
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="scan-timeline-drawer-toggle"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-subtle"
        >
          Show what I did
          <span aria-hidden="true" className="tabular">
            ({invocationCount} {invocationCount === 1 ? 'step' : 'steps'})
          </span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {/*
        SR-only live region announces stage completions to assistive
        tech without making sighted users hear them. Renders the most-
        recently-completed label; aria-live="polite" handles repeat
        announcements.
      */}
      <span
        data-testid="scan-timeline-announce"
        aria-live="polite"
        className="sr-only"
      >
        {lastCompletedAnnouncement(stages)}
      </span>
    </section>
  );
}

function lastCompletedAnnouncement(stages: ScanStage[]): string {
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].status === 'complete') {
      return `${stages[i].label} complete.`;
    }
  }
  return '';
}
