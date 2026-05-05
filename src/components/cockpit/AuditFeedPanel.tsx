'use client';

import { useState } from 'react';
import { refreshAuditFeed } from '@/app/cockpit/actions';
import { useRollback } from '@/lib/audit/use-rollback';
import type { Role } from '@/lib/auth/types';
import type { CockpitAuditRow } from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface AuditFeedPanelProps {
  initialRows: CockpitAuditRow[];
  viewerRole: Role;
  userId: string;
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function summarizeInput(json: string): string {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ');
  } catch {
    return json.slice(0, 120);
  }
}

function AuditRowItem({
  row,
  viewerRole,
  userId,
}: {
  row: CockpitAuditRow;
  viewerRole: Role;
  userId: string;
}) {
  const { status: rollbackStatus, rollback } = useRollback(row.id);

  const showUndo =
    row.status === 'executed' &&
    (viewerRole === 'Admin' || row.actor_user_id === userId) &&
    rollbackStatus === 'idle';

  const isRolledBack =
    row.status === 'rolled_back' || rollbackStatus === 'rolled_back';

  const actor = row.actor_display_name ?? row.actor_user_id;

  return (
    <li
      data-testid={`audit-row-${row.id}`}
      className="grid min-w-[760px] grid-cols-[140px_140px_140px_minmax(0,1fr)_100px_84px] items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-xs"
    >
      <span className="text-gray-500">{formatTime(row.created_at)}</span>
      <span className="font-mono text-gray-700">{row.tool_name}</span>
      <span className="text-gray-700">{actor}</span>
      <span className="truncate text-gray-500" title={row.input_json}>
        {summarizeInput(row.input_json)}
      </span>
      <span>
        {isRolledBack ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
            Rolled back
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
            Executed
          </span>
        )}
      </span>
      <span>
        {showUndo && (
          <button
            type="button"
            onClick={rollback}
            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            Undo
          </button>
        )}
        {rollbackStatus === 'rolling_back' && (
          <span className="text-gray-500">…</span>
        )}
        {rollbackStatus === 'rollback_failed' && (
          <button
            type="button"
            onClick={rollback}
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        )}
      </span>
    </li>
  );
}

const COLLAPSED_LIMIT = 5;

export function AuditFeedPanel({
  initialRows,
  viewerRole,
  userId,
}: AuditFeedPanelProps) {
  const [rows, setRows] = useState<CockpitAuditRow[]>(initialRows);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const { entries } = await refreshAuditFeed({ limit: 50 });
      setRows(entries);
    } finally {
      setIsRefreshing(false);
    }
  }

  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            What has the AI done?
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Tool actions logged on this brand · {rows.length} entries
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-xs text-gray-500">
          No tool actions recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ul className="m-0 list-none p-0">
            {visibleRows.map((row) => (
              <AuditRowItem
                key={row.id}
                row={row}
                viewerRole={viewerRole}
                userId={userId}
              />
            ))}
          </ul>
          {(hiddenCount > 0 || expanded) && (
            <div className="border-t border-gray-100 px-4 py-2 text-right">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
              >
                {expanded ? 'Show fewer' : `View all (${rows.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
