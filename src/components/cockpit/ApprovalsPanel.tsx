'use client';

import { useState } from 'react';
import { refreshApprovals } from '@/app/cockpit/actions';
import type { ApprovalRecord } from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface ApprovalsPanelProps {
  initialItems: ApprovalRecord[];
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

/**
 * Admin-only panel — Spec §4.5. The render guard lives at the
 * <CockpitDashboard> level (Task 18). The component itself does not
 * enforce its Admin-only nature; the dashboard simply skips rendering it
 * for non-Admin sessions, and the refreshApprovals action throws on
 * non-Admin sessions (defense-in-depth at the data boundary).
 */
export function ApprovalsPanel({ initialItems }: ApprovalsPanelProps) {
  const [items, setItems] = useState<ApprovalRecord[]>(initialItems);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const { items: next } = await refreshApprovals({ limit: 50 });
      setItems(next);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            Awaiting sign-off
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Recent approvals · Admin only
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-gray-500">
          No approvals recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid min-w-[700px] grid-cols-[180px_minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-xs"
              >
                <span className="text-gray-700">
                  {formatTime(item.created_at)}
                </span>
                <span className="truncate font-mono text-gray-600">
                  {item.document_slug}
                </span>
                <span className="truncate text-gray-500">
                  {item.approved_by}
                </span>
                <span
                  className="truncate text-gray-500"
                  title={item.notes ?? ''}
                >
                  {item.notes ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
