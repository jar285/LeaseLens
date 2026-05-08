'use client';

import { useState } from 'react';
import { refreshSchedule } from '@/app/cockpit/actions';
import type { ScheduledItem } from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface SchedulePanelProps {
  initialItems: ScheduledItem[];
}

function formatScheduledFor(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function SchedulePanel({ initialItems }: SchedulePanelProps) {
  const [items, setItems] = useState<ScheduledItem[]>(initialItems);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const { items: next } = await refreshSchedule({ limit: 50 });
      setItems(next);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-fg-default">
            What&rsquo;s queued to publish?
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Posts the AI has scheduled across channels
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-fg-muted">
          Nothing scheduled.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid min-w-[600px] grid-cols-[180px_100px_minmax(0,1fr)_120px] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs dark:border-neutral-800"
              >
                <span className="tabular text-fg-default">
                  {formatScheduledFor(item.scheduled_for)}
                </span>
                <span className="text-fg-muted">{item.channel}</span>
                <span className="truncate font-mono text-fg-default">
                  {item.document_slug}
                </span>
                <span className="truncate text-fg-muted">
                  {item.scheduled_by}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
