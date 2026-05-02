'use client';

import type { CockpitInitialData } from '@/lib/cockpit/types';
import { ApprovalsPanel } from './ApprovalsPanel';
import { AuditFeedPanel } from './AuditFeedPanel';
import { EvalHealthPanel } from './EvalHealthPanel';
import { SchedulePanel } from './SchedulePanel';
import { SpendPanel } from './SpendPanel';

export interface CockpitDashboardProps {
  initialData: CockpitInitialData;
}

export function CockpitDashboard({ initialData }: CockpitDashboardProps) {
  const { recentAudit, scheduled, approvals, evalHealth, spend, role, userId } =
    initialData;
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
        <EvalHealthPanel initialSnapshot={evalHealth} />
        <SchedulePanel initialItems={scheduled} />
        {isAdmin && <ApprovalsPanel initialItems={approvals} />}
      </div>
    </div>
  );
}
