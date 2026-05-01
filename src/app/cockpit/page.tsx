import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import { CockpitDashboard } from '@/components/cockpit/CockpitDashboard';
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

  const isAdmin = role === 'Admin';
  const actorFilter = isAdmin ? undefined : userId;

  const initialData: CockpitInitialData = {
    recentAudit: listRecentAuditRows(db, {
      actorUserId: actorFilter,
      limit: 50,
    }),
    scheduled: listScheduledItems(db, {
      scheduledBy: actorFilter,
      limit: 50,
    }),
    approvals: isAdmin
      ? listRecentApprovals(db, { approvedBy: undefined, limit: 50 })
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
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
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
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <CockpitDashboard initialData={initialData} />
      </div>
      <RoleSwitcher currentRole={role} />
    </>
  );
}
