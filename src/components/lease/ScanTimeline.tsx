'use client';

/*
 * Sprint 18 §5 — tenant-facing scan timeline.
 *
 * Replaces the linear stack of ToolCards inside the assistant bubble
 * when the viewer is in Tenant mode. Renders the stages produced by
 * `useScanStages()` — one row per stage, revealing in order as events
 * arrive.
 *
 * S19.7 — the "Show what I did" affordance is now live. The toggle
 * expands an inline ActivityDrawer below the timeline that shows the
 * raw ToolCards for the same scan turn. The drawer collapses by
 * default; clicking the button flips aria-expanded and reveals the
 * cards. Toggle label flips between "Show what I did" and
 * "Hide technical details" so users always see the inverse action.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import { ActivityDrawer } from '@/components/chat/ActivityDrawer';
import type { ToolInvocation } from '@/components/chat/ChatMessage';
import { ScanTimelineRow } from './ScanTimelineRow';
import type { ScanStage } from './scan-stages';
import { useScanStages } from './scan-stages';

const STAGE_REVEAL_DURATION_S = 0.22;
const STAGE_REVEAL_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export interface ScanTimelineProps {
  /**
   * The raw tool invocations behind the conversational timeline. Used
   * for two things:
   *   1. Drives the "(N steps)" sub-label on the drawer toggle.
   *   2. Renders the ToolCard stack inside ActivityDrawer when the
   *      drawer is expanded.
   */
  invocations: ToolInvocation[];
}

export function ScanTimeline({
  invocations,
}: ScanTimelineProps): React.JSX.Element | null {
  const stages = useScanStages();
  const reduced = useReducedMotion() ?? false;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const invocationCount = invocations.length;

  if (stages.length === 0) {
    // No extract event yet — nothing to render. ChatMessage's role-gated
    // branch keeps the tool-card list visible during this pre-scan
    // window (no race; this branch fires only AFTER tool events arrive).
    return null;
  }

  const toggleLabel = drawerOpen ? 'Hide technical details' : 'Show what I did';
  const ToggleIcon = drawerOpen ? ChevronUp : ChevronDown;

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
      <div
        data-testid="scan-timeline-drawer-toggle-wrap"
        className="mt-3 border-t border-neutral-100 pt-2.5 dark:border-neutral-800"
      >
        <button
          type="button"
          data-testid="scan-timeline-drawer-toggle"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => setDrawerOpen((prev) => !prev)}
          disabled={invocationCount === 0}
          aria-disabled={invocationCount === 0 ? 'true' : undefined}
          // S19.9 — `min-h-11` enforces the 44px touch-target floor on
          // mobile; the toggle is a primary affordance inside the chat
          // column, so it has to clear the iOS minimum.
          className="inline-flex min-h-11 items-center gap-1 text-[11px] font-medium text-fg-subtle transition-colors hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {toggleLabel}
          {invocationCount > 0 && !drawerOpen ? (
            <span aria-hidden="true" className="tabular">
              ({invocationCount} {invocationCount === 1 ? 'step' : 'steps'})
            </span>
          ) : null}
          <ToggleIcon className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <ActivityDrawer
        open={drawerOpen}
        invocations={invocations}
        id={drawerId}
      />
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
