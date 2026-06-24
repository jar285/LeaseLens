// Sprint 26a — parser-first landing (Mode A) E2E coverage.
//
// Verifies the new homepage experience for an empty workspace: hero
// dropzone is dominant, no chat composer in the main flow, FAB stub
// claims the bottom-right slot, and uploading a PDF transitions the
// router into Mode B (legacy three-pane shell in 26a; replaced by
// ParserResultsShell in 26b).

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { clearUserConversations } from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';
import { uploadSampleLease } from './helpers/upload-sample-lease';

const TENANT_ID = DEMO_USERS.find((u) => u.role === 'Tenant')!.id;

test.beforeEach(async ({ context }) => {
  clearUserConversations(TENANT_ID);
  await setSessionCookies(context, 'Tenant');
});

test('renders the parser-first landing on first visit', async ({ page }) => {
  await page.goto('/');

  // Mode A composition root.
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();

  // Editorial hero copy with italic emphasis preserved.
  const headline = page.getByTestId('lease-hero-headline');
  await expect(headline).toBeVisible();
  await expect(headline).toContainText('Find what to');
  await expect(headline).toContainText('negotiate');
  await expect(headline).toContainText('before you sign');

  // Hero dropzone is the visual focus.
  await expect(page.getByTestId('lease-hero-dropzone')).toBeVisible();
  await expect(page.getByTestId('lease-upload-dropzone')).toBeVisible();

  // Flow strip + trust metrics + disclaimer are present.
  await expect(page.getByTestId('parser-flow-strip')).toBeVisible();
  await expect(page.getByTestId('parser-trust-metrics')).toBeVisible();
  await expect(page.getByTestId('parser-landing-disclaimer')).toBeVisible();

  // Sprint 26c — the real FAB claims the bottom-right slot. Chat lives
  // exclusively inside the FAB drawer; no in-layout chat composer.
  await expect(page.getByTestId('assistant-fab')).toBeVisible();
  await expect(page.getByTestId('chat-composer')).toHaveCount(0);
});

test('FAB pill is keyboard reachable and has the right aria semantics', async ({
  page,
}) => {
  await page.goto('/');

  const fab = page.getByTestId('assistant-fab');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveAttribute('type', 'button');
  // Sprint 26c — the FAB is dynamically imported. The loading placeholder
  // is disabled while the chunk hydrates; wait for the real (enabled) pill
  // before asserting its semantics and focusing.
  await expect(fab).toBeEnabled();
  // Sprint 55 — assert the accessible-name PREFIX, not the exact placeholder
  // label. The hydrated pill's name carries a state suffix ("Open assistant —
  // Help" with no lease attached); asserting the bare placeholder label
  // ("Open assistant") raced the placeholder→pill swap and flaked under CI
  // load. The prefix is stable across both the loading and hydrated labels.
  await expect(fab).toHaveAttribute('aria-label', /^Open assistant\b/);

  await fab.focus();
  await expect(fab).toBeFocused();
});

test('uploading from Mode A lifts the router into Mode B (parser-results shell)', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();

  await uploadSampleLease(page);

  // Sprint 26b — the post-upload shell is now ParserResultsShell. Mode A
  // is gone; results-pdf-pane carries the loaded data-state.
  await expect(page.getByTestId('parser-landing-shell')).toHaveCount(0);
  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(page.getByTestId('pdf-viewer-filename')).toContainText(
    'sample-nj-residential-lease.pdf',
  );
});
