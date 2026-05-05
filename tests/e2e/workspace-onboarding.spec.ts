import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

/**
 * Sprint 11 (revised) — workspace onboarding smoke test.
 *
 * Sets a session cookie but NOT a workspace cookie. The middleware should
 * issue a default sample-workspace cookie on the first request, so the
 * home page renders chat directly with the sample workspace label visible.
 * No redirect to /onboarding (that route is gone).
 */
test.beforeEach(async ({ context }) => {
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
});

test('home renders chat with sample workspace when no workspace cookie is present', async ({
  page,
}) => {
  await page.goto('/');
  // Sprint 11 (revised): no redirect — middleware sets sample cookie and the
  // chat UI renders directly. URL stays at /.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/);

  // The header carries the active (sample) workspace name.
  await expect(page.getByText(/Side Quest Syndicate/)).toBeVisible();

  // The chat input is reachable (empty state).
  await expect(page.getByLabel('Type a message')).toBeVisible();
});
