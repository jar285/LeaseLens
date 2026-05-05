import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import { CockpitDashboard } from '@/components/cockpit/CockpitDashboard';
import { WorkspaceHeader } from '@/components/cockpit/WorkspaceHeader';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { getLatestEvalReport } from '@/lib/cockpit/eval-reports';
import {
  getTodaySpend,
  listRecentApprovals,
  listRecentAuditRows,
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
  const sessionCookie = cookieStore.get('contentops_session');
  const payload = sessionCookie ? await decrypt(sessionCookie.value) : null;
  const role: Role = payload?.role ?? 'Creator';
  const userId =
    payload?.userId ?? DEMO_USERS.find((u) => u.role === 'Creator')?.id;

  if (role === 'Creator' || !userId) {
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

  const initialData: CockpitInitialData = {
    recentAudit: listRecentAuditRows(db, {
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
    spend: getTodaySpend(db),
    role,
    userId,
  };

  return (
    <>
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-3.5">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-md px-1 text-sm text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            ← Chat
          </Link>
          <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-gray-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Layers
                className="h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={2.5}
              />
            </span>
            Operator Cockpit
          </span>
          <WorkspaceHeader workspace={workspace} />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-6 text-sm text-gray-500">
          What your team sees while the AI works on behalf of{' '}
          <span className="font-medium text-gray-700">{workspace.name}</span>.
        </p>
        <CockpitDashboard initialData={initialData} />
      </div>
      <RoleSwitcher currentRole={role} />
    </>
  );
}
