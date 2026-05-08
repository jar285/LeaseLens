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
      className="grid min-w-[760px] grid-cols-[140px_140px_140px_minmax(0,1fr)_100px_84px] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs dark:border-neutral-800"
    >
      <span className="tabular text-fg-muted">
        {formatTime(row.created_at)}
      </span>
      <span className="font-mono text-fg-default">{row.tool_name}</span>
      <span className="text-fg-default">{actor}</span>
      <span className="truncate text-fg-muted" title={row.input_json}>
        {summarizeInput(row.input_json)}
      </span>
      <span>
        {isRolledBack ? (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-fg-muted dark:bg-neutral-800">
            Rolled back
          </span>
        ) : (
          <span className="rounded-full bg-success-100 px-2 py-0.5 text-success-600 dark:bg-success-600/15 dark:text-success-100">
            Executed
          </span>
        )}
      </span>
      <span>
        {showUndo && (
          <button
            type="button"
            onClick={rollback}
            className="rounded-full border border-warning-100 bg-warning-100/60 px-2 py-0.5 text-warning-600 transition-colors hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-warning-600/40 dark:bg-warning-600/15 dark:text-warning-100"
          >
            Undo
          </button>
        )}
        {rollbackStatus === 'rolling_back' && (
          <span className="text-fg-muted">…</span>
        )}
        {rollbackStatus === 'rollback_failed' && (
          <button
            type="button"
            onClick={rollback}
            className="rounded-full border border-danger-100 bg-danger-100/60 px-2 py-0.5 text-danger-600 transition-colors hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-danger-600/40 dark:bg-danger-600/15 dark:text-danger-100"
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
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-fg-default">
            What has the AI done?
          </h2>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            Tool actions logged on this brand ·{' '}
            <span className="tabular">{rows.length}</span> entries
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-xs text-fg-muted">
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
            <div className="border-t border-neutral-100 px-4 py-2 text-right dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-medium text-accent-600 transition-colors hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:text-accent-300 dark:hover:text-accent-200"
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
