// Sprint 25.2 — role-based access + continue-previous undo.
//
// Covers:
//   T14 — Tenant hitting /cockpit redirects to /
//   T12 — Reviewer cockpit visibility (panels render, Approvals hidden)
//   T13 — Admin audit-feed scope (sees other actors; Reviewer doesn't)
//   T15 — continue-previous undo restores full state

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { openAssistantFab } from './helpers/open-assistant-fab';
import {
  clearUserConversations,
  seedGradedConversation,
  seedLease,
} from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';

function roleId(role: Role): string {
  const u = DEMO_USERS.find((du) => du.role === role);
  if (!u) throw new Error(`${role} demo user not seeded`);
  return u.id;
}

test.beforeEach(async () => {
  // Clear all three demo users' conversations + leftover audit/calendar
  // rows so each test starts from a known empty state.
  clearUserConversations(roleId('Tenant'));
  clearUserConversations(roleId('Reviewer'));
  clearUserConversations(roleId('Admin'));
  // Audit / tool-call / content_calendar rows accumulate across tests;
  // wipe them so audit-row count assertions are deterministic.
  db.prepare('DELETE FROM audit_log').run();
  db.prepare('DELETE FROM tool_calls').run();
  db.prepare('DELETE FROM content_calendar').run();
});

/**
 * Seeds rows in tool_calls (the cockpit's audit-feed source) + audit_log
 * + content_calendar so the AuditFeedPanel renders an audit row. The
 * panel's row testid is `audit-row-${tool_calls.id}` — that's the
 * value returned. actor_role carries the legacy DB literal
 * (Creator/Editor/Admin); the role-codec maps the LeaseLens-facing Role.
 */
function seedAuditRow(actorUserId: string, actorRole: Role): string {
  const dbRole = toDbRole(actorRole);
  const now = Math.floor(Date.now() / 1000) + 7200;
  const scheduleId = randomUUID();
  const auditId = randomUUID();
  const toolCallId = randomUUID();
  const toolUseId = `toolu_${auditId}`;
  const input = {
    document_slug: 'brand-identity',
    scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
    channel: 'twitter',
  };
  const output = {
    schedule_id: scheduleId,
    document_slug: input.document_slug,
    scheduled_for: input.scheduled_for,
    channel: input.channel,
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO content_calendar (
         id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      scheduleId,
      input.document_slug,
      SAMPLE_WORKSPACE.id,
      Math.floor(Date.now() / 1000) + 86_400,
      input.channel,
      actorUserId,
      now,
    );
    // tool_calls is what the cockpit's audit-feed query reads from;
    // tc.id becomes the audit-row-${id} testid.
    db.prepare(
      `INSERT INTO tool_calls (
         id, tool_name, tool_use_id, actor_user_id, actor_role,
         conversation_id, workspace_id, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
    ).run(
      toolCallId,
      'schedule_content_item',
      toolUseId,
      actorUserId,
      dbRole,
      null,
      SAMPLE_WORKSPACE.id,
      now,
    );
    // audit_log links via tool_use_id so the Undo flow can resolve
    // the compensating action.
    db.prepare(
      `INSERT INTO audit_log (
         id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
         workspace_id, input_json, output_json, compensating_action_json,
         status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      auditId,
      'schedule_content_item',
      toolUseId,
      actorUserId,
      dbRole,
      null,
      SAMPLE_WORKSPACE.id,
      JSON.stringify(input),
      JSON.stringify(output),
      JSON.stringify({ schedule_id: scheduleId }),
      'executed',
      now,
    );
  })();

  return toolCallId;
}

test('T14 — Tenant hitting /cockpit redirects to /', async ({
  context,
  page,
}) => {
  await setSessionCookies(context, 'Tenant');
  await page.goto('/cockpit');
  // cockpit/page.tsx redirects non-Admin/Reviewer to /.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/);
  // Sprint 26a — without a rehydrated active lease, / now renders the
  // parser-first landing (Mode A). Sanity-check that.
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();
});

test('T12 — Reviewer cockpit visibility: panels render, Approvals hidden', async ({
  context,
  page,
}) => {
  await setSessionCookies(context, 'Reviewer');
  // Give Reviewer something to view in the audit feed.
  seedAuditRow(roleId('Reviewer'), 'Reviewer');

  await page.goto('/cockpit');

  // Several cockpit panels render (verified by their CockpitPanel titles).
  await expect(
    page.getByRole('heading', { name: /What has the AI done\?/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Lease pipeline/i }),
  ).toBeVisible();
  // ApprovalsPanel is Admin-only — its title "Awaiting sign-off" is
  // not rendered for Reviewer.
  await expect(
    page.getByRole('heading', { name: /Awaiting sign-off/i }),
  ).toHaveCount(0);
});

test('T13 — Admin sees audit rows from other actors; Reviewer sees only own', async ({
  page,
  context,
}) => {
  // Seed an audit row authored by Reviewer.
  const reviewerId = roleId('Reviewer');
  const auditId = seedAuditRow(reviewerId, 'Reviewer');

  // First pass: Admin sees it.
  await setSessionCookies(context, 'Admin');
  await page.goto('/cockpit');
  await expect(page.getByTestId(`audit-row-${auditId}`)).toBeVisible();

  // Switch session: Reviewer sees their OWN row (so this assertion is
  // tautological for this seed — but the point is Tenant/Admin's rows
  // would NOT appear). Seed a second row authored by Admin to make the
  // negative assertion meaningful.
  const adminAuthoredId = seedAuditRow(roleId('Admin'), 'Admin');
  await context.clearCookies();
  await setSessionCookies(context, 'Reviewer');
  await page.goto('/cockpit');

  // Reviewer sees their own row…
  await expect(page.getByTestId(`audit-row-${auditId}`)).toBeVisible();
  // …but NOT the Admin-authored row.
  await expect(page.getByTestId(`audit-row-${adminAuthoredId}`)).toHaveCount(0);
});

test('T15 — "Clear assistant chat" preserves the lease + red-flag cards (parser state survives)', async ({
  context,
  page,
}) => {
  await setSessionCookies(context, 'Tenant');
  const userId = roleId('Tenant');
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: userId,
    filename: 't15-lease.pdf',
  });
  seedGradedConversation({
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    userMessageText: 'Initial scan.',
    gradings: [
      { clauseId: 't15-A', severity: 'high', pageNumber: 1, clauseIndex: 0 },
      { clauseId: 't15-B', severity: 'medium', pageNumber: 2, clauseIndex: 1 },
    ],
  });

  await page.goto('/');

  // Confirm seeded state visible (cards rendered, conversation rehydrated).
  await expect(page.getByTestId('red-flag-card')).toHaveCount(2);

  // Sprint 26c — the New conversation / Continue previous buttons live
  // inside the chat toolbar, which now sits inside the FAB drawer.
  await openAssistantFab(page);
  await page.getByTestId('new-conversation-btn').click();

  // Sprint 28.7 + CLAUDE.md invariant — "Clear assistant chat" stashes the CHAT
  // thread only; the lease + red-flag cards (owned by LeaseParserContext) are
  // intentionally PRESERVED. The Continue-previous undo is gated on having NO
  // active lease (ChatUI: `showContinuePrevious = … && !activeLease`), so with a
  // lease attached the cards simply remain and no undo affordance is offered.
  await expect(page.getByTestId('red-flag-card')).toHaveCount(2);
  await expect(page.getByTestId('continue-previous-btn')).toHaveCount(0);
});
