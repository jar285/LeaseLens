import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { encodeWorkspace } from '@/lib/workspaces/cookie';

function seedExecutedAuditRow(actorUserId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const scheduleId = randomUUID();
  const auditId = randomUUID();
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

    db.prepare(
      `INSERT INTO audit_log (
         id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
         workspace_id,
         input_json, output_json, compensating_action_json, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      auditId,
      'schedule_content_item',
      `toolu_${auditId}`,
      actorUserId,
      'Admin',
      null,
      SAMPLE_WORKSPACE.id,
      JSON.stringify(input),
      JSON.stringify(output),
      JSON.stringify({ schedule_id: scheduleId }),
      'executed',
      now,
    );
  })();

  return auditId;
}

let seededAuditId = '';

test.beforeEach(async ({ context, page }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin');
  if (!admin) throw new Error('Admin demo user not found');
  const token = await encrypt({
    userId: admin.id,
    role: 'Admin',
    displayName: admin.display_name,
  });
  // Sprint 11: workspace cookie required by chat / cockpit routes.
  const workspaceToken = await encodeWorkspace({
    workspace_id: SAMPLE_WORKSPACE.id,
    created_workspace_ids: [],
  });
  await context.addCookies([
    {
      name: 'contentops_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'contentops_workspace',
      value: workspaceToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // Seed an executed audit row directly so cockpit clickability tests isolate
  // cockpit layout, not chat/model behavior.
  seededAuditId = seedExecutedAuditRow(admin.id);
});

test('cockpit dashboard renders panels and supports Undo on audit row', async ({
  page,
}) => {
  await page.goto('/cockpit');

  // Diagnostic: confirm URL didn't redirect away (Admin should pass).
  await expect(page).toHaveURL(/\/cockpit$/);

  // Panel headers visible. Approvals appears for Admin sessions.
  // Use heading-role queries so we don't catch panel content text that
  // happens to include the same words (e.g., "scheduled_for" in audit
  // input summaries matches the bare "Scheduled" panel header otherwise).
  await expect(page.getByText('Operator Cockpit')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent actions' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Spend/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Eval health' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Scheduled' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent approvals' }),
  ).toBeVisible();

  // Click Undo on the first executed audit row (the row created in beforeEach).
  const undo = page
    .getByTestId(`audit-row-${seededAuditId}`)
    .getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeVisible();
  await undo.scrollIntoViewIfNeeded();
  await undo.click();
  await expect(page.getByText('Rolled back', { exact: true }).first()).toBeVisible(
    { timeout: 5000 },
  );
});

test('cockpit dashboard keeps audit actions clickable on mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cockpit');

  await expect(page).toHaveURL(/\/cockpit$/);
  await expect(page.getByText('Operator Cockpit')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent actions' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /Spend/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Eval health' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Scheduled' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Recent approvals' }),
  ).toBeVisible();

  const undo = page
    .getByTestId(`audit-row-${seededAuditId}`)
    .getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeVisible();
  await undo.scrollIntoViewIfNeeded();
  await undo.click();
  await expect(page.getByText('Rolled back', { exact: true }).first()).toBeVisible(
    { timeout: 5000 },
  );
});
