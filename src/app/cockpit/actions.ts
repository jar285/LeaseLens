'use server';

import { cookies } from 'next/headers';
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
import type {
  ApprovalRecord,
  CockpitAuditRow,
  EvalHealthSnapshot,
  ScheduledItem,
  SpendSnapshot,
} from '@/lib/cockpit/types';
import { db } from '@/lib/db';

// Note: Next.js 16 disallows non-async exports in `'use server'` modules.
// `export const runtime = 'nodejs'` was specced (spec §16, sprint-QA L6) but
// fails the strict-mode check. Runtime inheritance from the importing route
// segment (cockpit/page.tsx declares 'nodejs') covers this module instead.

interface SessionResult {
  userId: string;
  role: Role;
}

async function resolveSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('contentops_session');
  let userId: string | undefined = DEMO_USERS.find(
    (u) => u.role === 'Creator',
  )?.id;
  let role: Role = 'Creator';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      userId = payload.userId;
      role = payload.role;
    }
  }
  if (!userId) throw new Error('Unauthorized: no demo Creator user seeded');
  return { userId, role };
}

/**
 * Primary security boundary, NOT defense-in-depth (Spec §8 / spec-QA H4).
 * Server actions are POSTable from any authenticated client that knows the
 * action ID; a Creator session cookie + JS console is sufficient to attempt
 * a call. The cockpit page redirect prevents only visual access. This check
 * is the only thing standing between Creator and cross-actor data.
 */
function requireOperator(session: SessionResult): SessionResult {
  if (session.role === 'Creator') {
    throw new Error('Forbidden: cockpit is not available to Creator role');
  }
  return session;
}

/** Admin-only gate (Approvals panel) — Spec §4.5. */
function requireAdmin(session: SessionResult): SessionResult {
  if (session.role !== 'Admin') {
    throw new Error('Forbidden: action is Admin-only');
  }
  return session;
}

export async function refreshAuditFeed(opts: {
  since?: number;
  limit?: number;
}): Promise<{ entries: CockpitAuditRow[]; nextSince: number | null }> {
  const session = requireOperator(await resolveSession());
  const limit = opts.limit ?? 50;
  const entries = listRecentAuditRows(db, {
    actorUserId: session.role === 'Admin' ? undefined : session.userId,
    limit,
  });
  const nextSince =
    entries.length === limit ? entries[entries.length - 1].created_at : null;
  return { entries, nextSince };
}

export async function refreshSchedule(opts: {
  limit?: number;
}): Promise<{ items: ScheduledItem[] }> {
  const session = requireOperator(await resolveSession());
  return {
    items: listScheduledItems(db, {
      scheduledBy: session.role === 'Admin' ? undefined : session.userId,
      limit: opts.limit ?? 50,
    }),
  };
}

export async function refreshApprovals(opts: {
  limit?: number;
}): Promise<{ items: ApprovalRecord[] }> {
  // Admin-only — Spec §4.5. Editor calling this is UI drift or probe;
  // refuse rather than empty-array. requireAdmin throws for non-Admin.
  requireAdmin(await resolveSession());
  return {
    items: listRecentApprovals(db, {
      approvedBy: undefined,
      limit: opts.limit ?? 50,
    }),
  };
}

export async function refreshSpend(): Promise<{ spend: SpendSnapshot }> {
  requireOperator(await resolveSession());
  return { spend: getTodaySpend(db) };
}

export async function refreshEvalHealth(): Promise<{
  snapshot: EvalHealthSnapshot | null;
}> {
  requireOperator(await resolveSession());
  return { snapshot: getLatestEvalReport() };
}
