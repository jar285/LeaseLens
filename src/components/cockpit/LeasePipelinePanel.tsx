'use client';

import { useState } from 'react';
import { refreshLeasePipeline } from '@/app/cockpit/actions';
import type { LeasePipelineStats } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

export interface LeasePipelinePanelProps {
  initialStats: LeasePipelineStats;
}

/**
 * Sprint 24 — lease pipeline KPIs. Answers "are uploads parsing? is
 * the agent even getting clauses to work with?" — Tier-1 KPI #2 from
 * the brainstorm.
 *
 * Three large stats in a row + a small lifetime line, so the operator
 * reads the daily volume and the all-time depth in the same glance.
 */
export function LeasePipelinePanel({ initialStats }: LeasePipelinePanelProps) {
  const [stats, setStats] = useState<LeasePipelineStats>(initialStats);

  async function handleRefresh() {
    const { stats: next } = await refreshLeasePipeline();
    setStats(next);
  }

  // Display the avg with at most one decimal place, but round cleanly
  // when the number is whole (12 vs 12.0 reads better as the former).
  const avgDisplay = Number.isInteger(stats.avg_clauses_per_lease)
    ? stats.avg_clauses_per_lease.toString()
    : stats.avg_clauses_per_lease.toFixed(1);

  return (
    <CockpitPanel
      testId="lease-pipeline-panel"
      title="Lease pipeline"
      subtitle={
        <>
          Last 24 hours · lifetime{' '}
          <span className="tabular">{stats.lifetime_uploads}</span>{' '}
          {stats.lifetime_uploads === 1 ? 'lease' : 'leases'} reviewed
        </>
      }
      onRefresh={handleRefresh}
    >
      <div className="grid grid-cols-3 gap-4 px-4 py-4 text-center">
        <div data-testid="lease-pipeline-uploads-24h">
          <div className="text-xs text-fg-muted">Uploads</div>
          <div className="mt-1 tabular font-semibold text-accent-600 text-lg dark:text-accent-300">
            {stats.uploads_24h}
          </div>
        </div>
        <div data-testid="lease-pipeline-total-clauses">
          <div className="text-xs text-fg-muted">Total clauses</div>
          <div className="mt-1 tabular font-semibold text-fg-default text-lg">
            {stats.total_clauses_24h}
          </div>
        </div>
        <div data-testid="lease-pipeline-avg-clauses">
          <div className="text-xs text-fg-muted">Avg / lease</div>
          <div className="mt-1 tabular font-semibold text-fg-default text-lg">
            {avgDisplay}
          </div>
        </div>
      </div>
    </CockpitPanel>
  );
}
