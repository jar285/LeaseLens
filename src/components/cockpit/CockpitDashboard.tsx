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
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-1">
        <AuditFeedPanel initialRows={recentAudit} role={role} userId={userId} />
      </div>
      <div className="flex flex-col gap-4">
        <SpendPanel initialSnapshot={spend} />
        <EvalHealthPanel initialSnapshot={evalHealth} />
        <SchedulePanel initialItems={scheduled} />
        {isAdmin && <ApprovalsPanel initialItems={approvals} />}
      </div>
    </div>
  );
}
