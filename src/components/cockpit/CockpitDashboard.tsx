'use client';

import type { CockpitInitialData } from '@/lib/cockpit/types';
import { ApprovalsPanel } from './ApprovalsPanel';
import { AuditFeedPanel } from './AuditFeedPanel';
import { EvalHealthPanel } from './EvalHealthPanel';
import { LeasePipelinePanel } from './LeasePipelinePanel';
import { PerToolStatsPanel } from './PerToolStatsPanel';
import { SchedulePanel } from './SchedulePanel';
import { SeverityDistributionPanel } from './SeverityDistributionPanel';
import { SpendPanel } from './SpendPanel';

export interface CockpitDashboardProps {
  initialData: CockpitInitialData;
}

/**
 * Sprint 24 — operator-observability layout. Left column carries the
 * raw audit feed (the "what happened" log); the right column stacks
 * aggregate KPIs top-to-bottom in priority order:
 *   1. SpendPanel — money today
 *   2. PerToolStatsPanel — how the agent is behaving
 *   3. LeasePipelinePanel — is the agent getting clean data
 *   4. SeverityDistributionPanel — shape of the risk surfaced
 *   5. EvalHealthPanel — system quality (Tier 1 + Tier 2)
 *   6. SchedulePanel + ApprovalsPanel (Admin) — legacy ContentOps
 *      surfaces; retained per Sprint 24 invariant 12 pending a
 *      stakeholder repurpose decision.
 *
 * The three new panels (PerToolStats, LeasePipeline,
 * SeverityDistribution) are wired through optional `CockpitInitialData`
 * fields, so the dashboard tolerates a server hydration that omits
 * them (renders the empty / zero state inside the panel).
 */
export function CockpitDashboard({ initialData }: CockpitDashboardProps) {
  const {
    recentAudit,
    scheduled,
    approvals,
    evalHealth,
    leaseGrading,
    spend,
    perToolStats,
    leasePipeline,
    severityDistribution,
    role,
    userId,
  } = initialData;
  const isAdmin = role === 'Admin';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 lg:col-span-1">
        <AuditFeedPanel
          initialRows={recentAudit}
          viewerRole={role}
          userId={userId}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <SpendPanel initialSnapshot={spend} />
        <PerToolStatsPanel initialStats={perToolStats ?? []} />
        <LeasePipelinePanel
          initialStats={
            leasePipeline ?? {
              uploads_24h: 0,
              total_clauses_24h: 0,
              avg_clauses_per_lease: 0,
              lifetime_uploads: 0,
            }
          }
        />
        <SeverityDistributionPanel
          initialDistribution={
            severityDistribution ?? {
              high: 0,
              medium: 0,
              low: 0,
              ok: 0,
              total: 0,
            }
          }
        />
        <EvalHealthPanel
          initialSnapshot={evalHealth}
          initialLeaseGradingSnapshot={leaseGrading}
        />
        <SchedulePanel initialItems={scheduled} />
        {isAdmin && <ApprovalsPanel initialItems={approvals} />}
      </div>
    </div>
  );
}
