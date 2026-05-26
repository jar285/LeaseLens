'use client';

import { type ReactNode, useState } from 'react';
import { RefreshButton } from './RefreshButton';

/**
 * Sprint 24 — shared cockpit panel chrome.
 *
 * Composite-pattern shell: every cockpit panel renders one of these.
 * The card frame (`rounded-lg border bg-surface-card shadow-hairline`)
 * and the header row (`title` + optional `subtitle` + optional
 * `RefreshButton`) are hoisted here so the visual language is one
 * decision made once. Each panel passes its body in via `children`.
 *
 * The refresh state machine is encapsulated: callers pass an async
 * `onRefresh()` that does whatever data-fetch + state-update work
 * they need. The panel toggles `isRefreshing` around the await, so
 * panels stop carrying the boilerplate `useState<boolean>` + try/finally.
 * When `onRefresh` is omitted, the refresh button is not rendered.
 *
 * `testId` is mandatory so panel-level tests can locate the root via
 * `screen.getByTestId(...)` — same pattern as every existing panel.
 *
 * Existing panels migrate by replacing the inline `<section>` chrome
 * with `<CockpitPanel>` and dropping their local `isRefreshing` state.
 */

export interface CockpitPanelProps {
  title: string;
  subtitle?: ReactNode;
  /**
   * Async refresh handler. The panel manages `isRefreshing` for the
   * duration of the awaited call. Omit to render a panel without a
   * refresh button (e.g. fully derived / read-only panels).
   */
  onRefresh?: () => Promise<void>;
  /** Required — propagated as `data-testid` on the root `<section>`. */
  testId: string;
  children: ReactNode;
}

export function CockpitPanel({
  title,
  subtitle,
  onRefresh,
  testId,
  children,
}: CockpitPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = onRefresh
    ? async () => {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
    : null;

  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-fg-default">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        {handleRefreshClick ? (
          <RefreshButton
            isRefreshing={isRefreshing}
            onClick={handleRefreshClick}
          />
        ) : null}
      </header>
      {children}
    </section>
  );
}
