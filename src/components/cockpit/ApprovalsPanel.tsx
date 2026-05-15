'use client';

import { useState } from 'react';
import { refreshApprovals } from '@/app/cockpit/actions';
import type { ApprovalRecord } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

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

  // Sprint 24 — refresh state moved into CockpitPanel.
  async function handleRefresh() {
    const { items: next } = await refreshApprovals({ limit: 50 });
    setItems(next);
  }

  return (
    <CockpitPanel
      testId="approvals-panel"
      title="Awaiting sign-off"
      subtitle={<>Recent approvals · Admin only</>}
      onRefresh={handleRefresh}
    >
      {items.length === 0 ? (
        <div className="px-4 py-6 text-xs text-fg-muted">
          No approvals recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid min-w-[700px] grid-cols-[180px_minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs dark:border-neutral-800"
              >
                <span className="tabular text-fg-default">
                  {formatTime(item.created_at)}
                </span>
                <span className="truncate font-mono text-fg-default">
                  {item.document_slug}
                </span>
                <span className="truncate text-fg-muted">
                  {item.approved_by}
                </span>
                <span
                  className="truncate text-fg-muted"
                  title={item.notes ?? ''}
                >
                  {item.notes ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </CockpitPanel>
  );
}
