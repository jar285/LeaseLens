// Sprint 26b — parser-results (Mode B) E2E coverage.
//
// Verifies the new post-upload layout: header strip, PDF on the left,
// results stack on the right (Red Flags + Clauses + temporary chat),
// FAB stub still claims the bottom-right slot. Confirms Replace returns
// to Mode A and that uploaded lease metadata flows through the header.

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  clearUserConversations,
  seedGradedConversation,
  seedLease,
} from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';
import { uploadSampleLease } from './helpers/upload-sample-lease';

const TENANT_ID = DEMO_USERS.find((u) => u.role === 'Tenant')!.id;

test.beforeEach(async ({ context }) => {
  clearUserConversations(TENANT_ID);
  await setSessionCookies(context, 'Tenant');
});

test('post-upload renders the parser-results shell (Mode B), not the legacy three-pane shell', async ({
  page,
}) => {
  await page.goto('/');
  await uploadSampleLease(page);

  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  // The legacy three-pane shell is no longer routed to.
  await expect(page.getByTestId('shell-root')).toHaveCount(0);

  // PDF pane on the left with the loaded data-state.
  const pdfPane = page.getByTestId('results-pdf-pane');
  await expect(pdfPane).toBeVisible();
  await expect(pdfPane).toHaveAttribute('data-state', 'loaded');

  // Sprint 26b — results stack on the right contains the Red Flags
  // section + the Clauses list. Sprint 26c removed the temporary chat
  // slot; the real FAB now hosts chat in its drawer.
  await expect(page.getByTestId('results-stack')).toBeVisible();
  await expect(page.getByTestId('results-red-flags-section')).toBeVisible();
  await expect(page.getByTestId('clauses-list')).toBeVisible();
  await expect(page.getByTestId('results-chat-slot')).toHaveCount(0);

  // The real FAB (not the stub) anchors the bottom-right.
  await expect(page.getByTestId('assistant-fab')).toBeVisible();
  // Sprint 29.6 — the pill's aria-label carries a dynamic state suffix
  // ("Open assistant — Ask about lease" / "— Help" / "— Scanning…").
  await expect(page.getByTestId('assistant-fab')).toHaveAttribute(
    'aria-label',
    /^Open assistant/,
  );
});

test('header strip shows filename and lease metadata', async ({ page }) => {
  await page.goto('/');
  await uploadSampleLease(page);

  const header = page.getByTestId('results-header');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('results-header-filename')).toContainText(
    'sample-nj-residential-lease.pdf',
  );
  // Meta line ("· N pages · M clauses") is hidden below the sm: breakpoint
  // but reachable at the default Playwright viewport (1280×720).
  await expect(page.getByTestId('results-header-meta')).toContainText('pages');
  await expect(page.getByTestId('results-header-meta')).toContainText(
    'clauses',
  );
});

test('Replace returns the workspace to Mode A (parser-first landing)', async ({
  page,
}) => {
  await page.goto('/');
  await uploadSampleLease(page);

  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  await page.getByTestId('results-replace-button').click();
  // Sprint 28.15 — Replace now opens a styled ConfirmDialog (was window.confirm);
  // confirm the destructive reset to return to Mode A.
  await page
    .getByTestId('confirm-dialog')
    .getByRole('button', { name: 'Reset workspace' })
    .click();

  // Back to landing — no results shell, hero dropzone visible.
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();
  await expect(page.getByTestId('parser-results-shell')).toHaveCount(0);
  await expect(page.getByTestId('lease-hero-dropzone')).toBeVisible();
});

test('uploading after Replace restores the results shell', async ({ page }) => {
  await page.goto('/');
  await uploadSampleLease(page);
  await page.getByTestId('results-replace-button').click();
  // Sprint 28.15 — Replace now opens a styled ConfirmDialog (was window.confirm);
  // confirm the destructive reset to return to Mode A.
  await page
    .getByTestId('confirm-dialog')
    .getByRole('button', { name: 'Reset workspace' })
    .click();
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();

  // Re-uploading the same lease should lift back into Mode B cleanly.
  await uploadSampleLease(page);
  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
  );
});

// Sprint 28.13 — inverted from Sprint 26c.10's "no window scroll"
// regression guard. The spec §1.6 invariant "the page itself must not
// scroll" was dropped on user request after Sprints 28.10–28.12; the
// workspace is now a window-scrolled document. This test pins the new
// shape: the document scrolls past the viewport when seeded gradings
// are present, and the sticky header stays at the top of the viewport
// throughout. Catches accidental re-introduction of an outer
// `overflow-hidden` clamp that would silently swallow window scroll
// again.
test('Mode B is window-scrolled — document height grows past viewport and the header stays sticky', async ({
  page,
}) => {
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: TENANT_ID,
    filename: 'window-scroll-lease.pdf',
  });
  seedGradedConversation({
    userId: TENANT_ID,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    userMessageText: 'Scan this lease.',
    gradings: [
      { clauseId: 'ws-1', severity: 'high', pageNumber: 1, clauseIndex: 0 },
      { clauseId: 'ws-2', severity: 'medium', pageNumber: 1, clauseIndex: 1 },
      { clauseId: 'ws-3', severity: 'low', pageNumber: 2, clauseIndex: 2 },
      { clauseId: 'ws-4', severity: 'ok', pageNumber: 2, clauseIndex: 3 },
    ],
  });

  await page.goto('/');
  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  await expect(page.getByTestId('red-flag-card').first()).toBeVisible();
  await page.waitForTimeout(250);

  // The document must exceed the viewport so window scroll is meaningful.
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(innerHeight + 200);

  // Scroll halfway down and confirm the page actually moves (not just
  // an inner pane).
  await page.evaluate(() => window.scrollTo(0, 500));
  const scrolledY = await page.evaluate(() => window.scrollY);
  expect(scrolledY).toBeGreaterThan(0);

  // While the window is scrolled, the sticky header must still be at
  // y=0 in the viewport (its getBoundingClientRect().top stays 0).
  const headerTop = await page.evaluate(() => {
    const h = document.querySelector('header');
    return h ? Math.round(h.getBoundingClientRect().top) : null;
  });
  expect(headerTop).toBe(0);
});
