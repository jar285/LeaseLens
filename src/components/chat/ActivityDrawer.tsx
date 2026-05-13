'use client';

/*
 * S19.7 — inline ActivityDrawer.
 *
 * Tenant-mode affordance that reveals the raw tool trace behind the
 * conversational ScanTimeline. The drawer is a plain region (NOT a
 * modal) — it expands inline below the timeline so the user can keep
 * the surrounding chat context visible while they peek at the steps.
 *
 * Pure presentation. No business logic. Receives the invocations and
 * the open flag from ScanTimeline; the toggle button + open-state
 * useState live on the parent so a future "auto-expand on error" rule
 * can drive the same drawer without touching this file.
 *
 * Accessibility: role="region" + aria-label so screen readers
 * announce the expansion; the parent provides aria-controls →ID
 * wiring; reduced-motion is honoured by ScanTimeline at the animation
 * layer.
 */

import type { ToolInvocation } from './ChatMessage';
import { ToolCard } from './ToolCard';

export interface ActivityDrawerProps {
  open: boolean;
  invocations: ToolInvocation[];
  id: string;
}

export function ActivityDrawer({
  open,
  invocations,
  id,
}: ActivityDrawerProps): React.JSX.Element | null {
  if (!open) return null;
  if (invocations.length === 0) return null;

  return (
    <section
      id={id}
      aria-label="Activity — technical details"
      data-testid="activity-drawer"
      className="mt-2 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800"
    >
      {invocations.map((invocation) => (
        <ToolCard key={invocation.id} invocation={invocation} />
      ))}
    </section>
  );
}
