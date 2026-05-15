'use client';

import { useState } from 'react';
import { refreshAuditFeed } from '@/app/cockpit/actions';
import { useRollback } from '@/lib/audit/use-rollback';
import type { Role } from '@/lib/auth/types';
import type { CockpitToolCallRow } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

export interface AuditFeedPanelProps {
  // Sprint 24.5 — every tool invocation (read-only + mutating).
  initialRows: CockpitToolCallRow[];
  viewerRole: Role;
  userId: string;
}

function formatTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function summarizeInput(json: string | null): string {
  if (!json) return '—';
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
  row: CockpitToolCallRow;
  viewerRole: Role;
  userId: string;
}) {
  // Sprint 24.5 — Undo + rollback affordances only apply to mutating
  // rows (i.e. those with a matching audit_log entry). Read-only rows
  // (search_corpus, extract_clauses, grade_clause_severity, etc.) carry
  // a null audit_id and skip the rollback hook entirely — useRollback
  // is still mounted unconditionally because hooks can't be conditional,
  // but its result is only consulted when audit_id is present.
  const auditId = row.audit_id ?? '';
  const { status: rollbackStatus, rollback } = useRollback(auditId);

  const isMutation = row.audit_id !== null;
  const showUndo =
    isMutation &&
    row.audit_status === 'executed' &&
    (viewerRole === 'Admin' || row.actor_user_id === userId) &&
    rollbackStatus === 'idle';

  const isRolledBack =
    row.audit_status === 'rolled_back' || rollbackStatus === 'rolled_back';

  const isError = row.tool_call_status === 'error';

  const actor = row.actor_display_name ?? row.actor_user_id;

  return (
    <li
      data-testid={`audit-row-${row.id}`}
      className="grid min-w-[760px] grid-cols-[140px_140px_140px_minmax(0,1fr)_100px_84px] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-xs dark:border-neutral-800"
    >
      <span className="tabular text-fg-muted">
        {formatTime(row.created_at)}
      </span>
      {/* Sprint 24 hotfix — `truncate` + `title` on tool_name and actor
          cells so long values (e.g. `draft_negotiation_email` at ~170 px
          inside a 140 px column, or a long display name) don't bleed
          into the adjacent column. Full value still visible on hover. */}
      <span
        className="truncate font-mono text-fg-default"
        title={row.tool_name}
      >
        {row.tool_name}
      </span>
      <span className="truncate text-fg-default" title={actor}>
        {actor}
      </span>
      <span
        className="truncate text-fg-muted"
        title={row.audit_input_json ?? row.error_message ?? ''}
      >
        {/* Sprint 24.5 — input summary now shows audit_log.input_json
            for mutating rows (rich JSON params). Read-only rows have
            no input_json today; we surface the error_message instead
            on failures, or a quiet dash on read-only successes. */}
        {row.audit_input_json
          ? summarizeInput(row.audit_input_json)
          : isError
            ? (row.error_message ?? '—')
            : '—'}
      </span>
      <span>
        {/* Sprint 24.5 — status badge widened to four states:
              Rolled back → mutation undone (gray)
              Executed    → successful mutation (green)
              Error       → tool_call failed (danger)
              Success     → read-only call returned (subtle, neutral) */}
        {isRolledBack ? (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-fg-muted dark:bg-neutral-800">
            Rolled back
          </span>
        ) : isError ? (
          <span className="rounded-full bg-danger-100 px-2 py-0.5 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100">
            Error
          </span>
        ) : isMutation ? (
          <span className="rounded-full bg-success-100 px-2 py-0.5 text-success-600 dark:bg-success-600/15 dark:text-success-100">
            Executed
          </span>
        ) : (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-fg-subtle dark:bg-neutral-800">
            Success
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
  const [rows, setRows] = useState<CockpitToolCallRow[]>(initialRows);
  const [expanded, setExpanded] = useState(false);

  // Sprint 24 — refresh state moved into CockpitPanel.
  async function handleRefresh() {
    const { entries } = await refreshAuditFeed({ limit: 50 });
    setRows(entries);
  }

  const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <CockpitPanel
      testId="audit-feed-panel"
      title="What has the AI done?"
      subtitle={
        <>
          Tool actions logged on this brand ·{' '}
          <span className="tabular">{rows.length}</span> entries
        </>
      }
      onRefresh={handleRefresh}
    >
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
    </CockpitPanel>
  );
}
