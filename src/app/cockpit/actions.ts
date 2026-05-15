'use server';

import { cookies } from 'next/headers';
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
import type {
  ApprovalRecord,
  CockpitToolCallRow,
  EvalHealthSnapshot,
  LeaseGradingSnapshot,
  LeasePipelineStats,
  PerToolStat,
  ScheduledItem,
  SeverityDistribution,
  SpendSnapshot,
} from '@/lib/cockpit/types';
import { db } from '@/lib/db';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';

// Note: Next.js 16 disallows non-async exports in `'use server'` modules.
// `export const runtime = 'nodejs'` was specced (spec §16, sprint-QA L6) but
// fails the strict-mode check. Runtime inheritance from the importing route
// segment (cockpit/page.tsx declares 'nodejs') covers this module instead.

interface SessionResult {
  userId: string;
  role: Role;
  /** Sprint 11: every cockpit action requires an active workspace. */
  workspaceId: string;
}

async function resolveSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('leaselens_session');
  let userId: string | undefined = DEMO_USERS.find(
    (u) => u.role === 'Tenant',
  )?.id;
  let role: Role = 'Tenant';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      userId = payload.userId;
      role = payload.role;
    }
  }
  if (!userId) throw new Error('Unauthorized: no demo Creator user seeded');

  // Sprint 11 — workspace cookie. Each cockpit action requires it.
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
  const workspacePayload = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  if (!workspacePayload) {
    throw new Error('Forbidden: no workspace selected');
  }
  const workspace = getActiveWorkspace(db, workspacePayload.workspace_id);
  if (!workspace) {
    throw new Error('Forbidden: workspace expired');
  }
  return { userId, role, workspaceId: workspace.id };
}

/**
 * Primary security boundary, NOT defense-in-depth (Spec §8 / spec-QA H4).
 * Server actions are POSTable from any authenticated client that knows the
 * action ID; a Creator session cookie + JS console is sufficient to attempt
 * a call. The cockpit page redirect prevents only visual access. This check
 * is the only thing standing between Creator and cross-actor data.
 */
function requireOperator(session: SessionResult): SessionResult {
  if (session.role === 'Tenant') {
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
}): Promise<{ entries: CockpitToolCallRow[]; nextSince: number | null }> {
  // Sprint 24.5 — `refreshAuditFeed` now returns the unified tool-call
  // feed (every invocation, joined to audit_log for the Undo affordance)
  // so the cockpit panel reflects the agent's real activity, not just
  // its mutations.
  const session = requireOperator(await resolveSession());
  const limit = opts.limit ?? 50;
  const entries = listRecentToolCalls(db, {
    workspaceId: session.workspaceId,
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
      workspaceId: session.workspaceId,
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
  const session = requireAdmin(await resolveSession());
  return {
    items: listRecentApprovals(db, {
      workspaceId: session.workspaceId,
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
  leaseGrading: LeaseGradingSnapshot | null;
}> {
  requireOperator(await resolveSession());
  return {
    snapshot: getLatestEvalReport(),
    leaseGrading: getLatestLeaseGradingReport(),
  };
}

const TWENTY_FOUR_HOURS_S = 86_400;

/*
 * Sprint 24 — three new operator-observability actions. All gated by
 * requireOperator (Reviewer + Admin only). All workspace-scoped via the
 * cookie. The `since` window is computed at the action boundary so a
 * single render fixes one timestamp for all queries that share it.
 */

export async function refreshPerToolStats(): Promise<{
  stats: PerToolStat[];
}> {
  const session = requireOperator(await resolveSession());
  const since = Math.floor(Date.now() / 1000) - TWENTY_FOUR_HOURS_S;
  return {
    stats: listPerToolStats(db, {
      workspaceId: session.workspaceId,
      since,
      limit: 20,
    }),
  };
}

export async function refreshLeasePipeline(): Promise<{
  stats: LeasePipelineStats;
}> {
  const session = requireOperator(await resolveSession());
  const since = Math.floor(Date.now() / 1000) - TWENTY_FOUR_HOURS_S;
  return {
    stats: getLeasePipelineStats(db, {
      workspaceId: session.workspaceId,
      since,
    }),
  };
}

export async function refreshSeverityDistribution(): Promise<{
  distribution: SeverityDistribution;
}> {
  const session = requireOperator(await resolveSession());
  return {
    distribution: getSeverityDistribution(db, {
      workspaceId: session.workspaceId,
    }),
  };
}
