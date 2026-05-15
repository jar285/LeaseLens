import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import { ThemeToggle } from '@/components/auth/ThemeToggle';
import { CockpitDashboard } from '@/components/cockpit/CockpitDashboard';
import { SampleWorkspaceSwitcher } from '@/components/cockpit/SampleWorkspaceSwitcher';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import {
  getLatestEvalReport,
  getLatestLeaseGradingReport,
} from '@/lib/cockpit/eval-reports';
import {
  getLeasePipelineStats,
  getSeverityDistribution,
  getTodaySpend,
  listPerToolStats,
  listRecentApprovals,
  listRecentToolCalls,
  listScheduledItems,
} from '@/lib/cockpit/queries';
import type { CockpitInitialData } from '@/lib/cockpit/types';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

export default async function CockpitPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('leaselens_session');
  const payload = sessionCookie ? await decrypt(sessionCookie.value) : null;
  const role: Role = payload?.role ?? 'Tenant';
  const userId =
    payload?.userId ?? DEMO_USERS.find((u) => u.role === 'Tenant')?.id;

  if (role === 'Tenant' || !userId) {
    redirect('/');
  }

  // Sprint 11 (revised) — workspace cookie. Middleware always issues a
  // sample-workspace cookie, so cookie should be present. If decode fails
  // or the workspace is gone (TTL purge race), fall back to sample and
  // clear the stale cookie so middleware re-issues on the next request.
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
  const workspacePayload = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  let workspace = workspacePayload
    ? getActiveWorkspace(db, workspacePayload.workspace_id)
    : null;
  if (!workspace) {
    if (workspaceCookie) cookieStore.delete(WORKSPACE_COOKIE_NAME);
    workspace = {
      id: SAMPLE_WORKSPACE.id,
      name: SAMPLE_WORKSPACE.name,
      description: SAMPLE_WORKSPACE.description,
      is_sample: 1,
      created_at: 0,
      expires_at: null,
    };
  }

  const isAdmin = role === 'Admin';
  const actorFilter = isAdmin ? undefined : userId;

  // Sprint 24 — `since` for the 24h-windowed KPIs is computed once at
  // render so the per-tool stats + lease-pipeline panels share the same
  // window snapshot (avoids the rare case where the two queries fall
  // on opposite sides of a second boundary).
  const TWENTY_FOUR_HOURS_S = 86_400;
  const since = Math.floor(Date.now() / 1000) - TWENTY_FOUR_HOURS_S;

  const initialData: CockpitInitialData = {
    recentAudit: listRecentToolCalls(db, {
      workspaceId: workspace.id,
      actorUserId: actorFilter,
      limit: 50,
    }),
    scheduled: listScheduledItems(db, {
      workspaceId: workspace.id,
      scheduledBy: actorFilter,
      limit: 50,
    }),
    approvals: isAdmin
      ? listRecentApprovals(db, {
          workspaceId: workspace.id,
          approvedBy: undefined,
          limit: 50,
        })
      : [],
    evalHealth: getLatestEvalReport(),
    leaseGrading: getLatestLeaseGradingReport(),
    spend: getTodaySpend(db),
    // Sprint 24 — three new agent-observability KPIs.
    perToolStats: listPerToolStats(db, {
      workspaceId: workspace.id,
      since,
      limit: 20,
    }),
    leasePipeline: getLeasePipelineStats(db, {
      workspaceId: workspace.id,
      since,
    }),
    severityDistribution: getSeverityDistribution(db, {
      workspaceId: workspace.id,
    }),
    role,
    userId,
  };

  return (
    <>
      {/*
        Sprint 17.1 — header is sticky so the LeaseLens identity + role
        switcher + theme toggle stay reachable while the dashboard panels
        scroll. The chat page header is pinned by its h-dvh + flex-col
        layout; cockpit uses natural document scroll and needs sticky.
      */}
      <header className="sticky top-0 z-raised flex shrink-0 items-center justify-between border-b border-neutral-200 bg-surface-card px-8 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-md px-1 text-sm text-fg-muted transition-colors hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
          >
            ← Chat
          </Link>
          <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-fg-default">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-white">
              <Layers
                className="h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={2.5}
              />
            </span>
            Operator Cockpit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <RoleSwitcher currentRole={role} />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            What your team sees while the AI works on behalf of{' '}
            <span className="font-medium text-fg-default">
              {workspace.name}
            </span>
            .
          </p>
          {/* Sprint 24.3 — sample-workspace switcher. Renders only when
              the cockpit is currently rendering one of the two seeded
              sample workspaces; absent on uploaded workspaces where the
              "other sample" comparison isn't the right affordance. */}
          <SampleWorkspaceSwitcher currentWorkspaceId={workspace.id} />
        </div>
        <CockpitDashboard initialData={initialData} />
      </div>
    </>
  );
}
