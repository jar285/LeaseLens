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
      name: 'leaselens_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
});

test('home renders the parser-first landing with sample workspace when no workspace cookie is present', async ({
  page,
}) => {
  await page.goto('/');
  // Sprint 11 (revised): no redirect — middleware sets sample cookie and the
  // parser-first landing (Sprint 26a Mode A) renders directly. URL stays at /.
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/);

  // The header carries the active (sample) workspace name.
  // Sprint 25.2: renamed from "Side Quest Syndicate" → SAMPLE_WORKSPACE.name.
  await expect(page.getByText(/LeaseLens — NJ Tenant Law/)).toBeVisible();

  // Sprint 26a — the homepage now opens on the parser-first landing. The
  // chat composer is no longer in the main flow; the assistant lives in
  // a FAB (stubbed in 26a, real in 26c).
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();
  await expect(page.getByTestId('lease-hero-headline')).toBeVisible();
  await expect(page.getByTestId('lease-upload-dropzone')).toBeVisible();
});
