'use client';

import { useState } from 'react';
import { refreshPerToolStats } from '@/app/cockpit/actions';
import type { PerToolStat } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

export interface PerToolStatsPanelProps {
  initialStats: PerToolStat[];
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Sprint 24 — per-tool aggregate over the last 24 h. Answers
 * "which tools is the agent calling, and which are failing?" in the
 * 5-second-glance frame from Stephen Few's at-a-glance check.
 *
 * Columns: tool · invocations · success rate · rollback rate. Rates
 * carry semantic colour:
 *   - success: green at 100%, amber below 100%, danger below 80%.
 *   - rollback: green at 0%, amber 1–20%, danger above 20%.
 *
 * Rendered through the shared CockpitPanel shell (Phase-1 composite).
 */
export function PerToolStatsPanel({ initialStats }: PerToolStatsPanelProps) {
  const [stats, setStats] = useState<PerToolStat[]>(initialStats);

  async function handleRefresh() {
    const { stats: next } = await refreshPerToolStats();
    setStats(next);
  }

  return (
    <CockpitPanel
      testId="per-tool-stats-panel"
      title="Per-tool activity"
      subtitle={<>Last 24 hours · success + rollback rates</>}
      onRefresh={handleRefresh}
    >
      {stats.length === 0 ? (
        <div className="px-4 py-6 text-xs text-fg-muted">
          No tool activity in the last 24 hours.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] tracking-wider text-fg-subtle uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Tool</th>
                <th className="px-4 py-2 text-right font-medium">
                  Invocations
                </th>
                <th className="px-4 py-2 text-right font-medium">Success</th>
                <th className="px-4 py-2 text-right font-medium">Rollback</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr
                  key={stat.tool_name}
                  data-testid={`per-tool-stat-${stat.tool_name}`}
                  className="border-t border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-4 py-2 font-mono text-fg-default">
                    {stat.tool_name}
                  </td>
                  <td className="px-4 py-2 text-right tabular font-semibold text-accent-600 dark:text-accent-300">
                    {stat.invocations}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular ${successClass(stat.success_rate)}`}
                  >
                    {pct(stat.success_rate)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular ${rollbackClass(stat.rollback_rate)}`}
                  >
                    {pct(stat.rollback_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CockpitPanel>
  );
}

function successClass(rate: number): string {
  if (rate >= 1) return 'text-success-600 dark:text-success-100';
  if (rate >= 0.8) return 'text-warning-600 dark:text-warning-100';
  return 'text-danger-600 dark:text-danger-100';
}

function rollbackClass(rate: number): string {
  if (rate === 0) return 'text-fg-muted';
  if (rate <= 0.2) return 'text-warning-600 dark:text-warning-100';
  return 'text-danger-600 dark:text-danger-100';
}
