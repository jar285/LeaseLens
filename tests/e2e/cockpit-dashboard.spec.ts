import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

test.beforeEach(async ({ context, page }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin');
  if (!admin) throw new Error('Admin demo user not found');
  const token = await encrypt({
    userId: admin.id,
    role: 'Admin',
    displayName: admin.display_name,
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
  ]);

  // Seed at least one executed audit row by routing through the chat tool flow.
  // The dev server runs with CONTENTOPS_E2E_MOCK=1 so the mock client at
  // src/lib/anthropic/e2e-mock.ts deterministically returns a
  // schedule_content_item tool_use against the seeded `brand-identity` slug.
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('Schedule a brand-identity post for twitter tomorrow.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page
      .getByRole('button')
      .filter({ hasText: 'schedule_content_item' })
      .last(),
  ).toBeVisible({ timeout: 30_000 });
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
  // Use force-click — at narrower viewports the SpendPanel below the audit
  // feed can intercept pointer events during scroll-into-view. The button
  // itself is visible+enabled per Playwright's own log; force bypasses the
  // pointer-event intercept check.
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
  await expect(undo).toBeVisible();
  await undo.scrollIntoViewIfNeeded();
  await undo.click({ force: true });
  await expect(page.getByText('Rolled back', { exact: true }).first()).toBeVisible(
    { timeout: 5000 },
  );
});
