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
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Scheduled</h2>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-gray-500">
          Nothing scheduled.
        </div>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[180px_100px_minmax(0,1fr)_120px] items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-xs"
            >
              <span className="text-gray-700">
                {formatScheduledFor(item.scheduled_for)}
              </span>
              <span className="text-gray-500">{item.channel}</span>
              <span className="font-mono text-gray-600">
                {item.document_slug}
              </span>
              <span className="text-gray-500">{item.scheduled_by}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
