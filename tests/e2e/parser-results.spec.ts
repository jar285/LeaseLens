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
  await expect(page.getByTestId('assistant-fab')).toHaveAttribute(
    'aria-label',
    'Open assistant',
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

  // Back to landing — no results shell, hero dropzone visible.
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();
  await expect(page.getByTestId('parser-results-shell')).toHaveCount(0);
  await expect(page.getByTestId('lease-hero-dropzone')).toBeVisible();
});

test('uploading after Replace restores the results shell', async ({ page }) => {
  await page.goto('/');
  await uploadSampleLease(page);
  await page.getByTestId('results-replace-button').click();
  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();

  // Re-uploading the same lease should lift back into Mode B cleanly.
  await uploadSampleLease(page);
  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
  );
});

// Sprint 26c.10 — regression guard for "window scrolls past viewport".
// The post-upload Mode B layout was leaking past 100dvh because the
// `<main className="flex h-dvh flex-col overflow-hidden">` chain wasn't
// constraint-rigid enough for children with intrinsic-height demands
// (RedFlagSkeletonCard stacks, react-pdf, motion.div). Switching <main>
// to CSS grid (`grid-rows-[auto_minmax(0,1fr)]`) enforces the body row
// can never grow past `1fr` of remaining viewport space. This test
// pins that invariant: after upload, the document body equals viewport
// height — no window-level scroll.
test('Mode B does not introduce window scroll past viewport with seeded red-flag cards (no extra empty space)', async ({
  page,
}) => {
  // Seed a graded conversation so the post-upload page rehydrates with
  // a populated RedFlagReport + ClausesList — that's the state that
  // exposed the scroll bug in live testing. A bare-upload page may
  // not stress the layout enough to reveal the overflow.
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: TENANT_ID,
    filename: 'scroll-regression-lease.pdf',
  });
  seedGradedConversation({
    userId: TENANT_ID,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    userMessageText: 'Scan this lease.',
    gradings: [
      { clauseId: 'sr-1', severity: 'high', pageNumber: 1, clauseIndex: 0 },
      { clauseId: 'sr-2', severity: 'medium', pageNumber: 1, clauseIndex: 1 },
      { clauseId: 'sr-3', severity: 'low', pageNumber: 2, clauseIndex: 2 },
      { clauseId: 'sr-4', severity: 'ok', pageNumber: 2, clauseIndex: 3 },
    ],
  });

  await page.goto('/');
  await expect(page.getByTestId('parser-results-shell')).toBeVisible();
  // Wait for at least one red-flag card to render so the layout is
  // populated with real content (not just skeleton placeholders).
  await expect(page.getByTestId('red-flag-card').first()).toBeVisible();

  // Let the layout settle after PdfViewer hydration + motion entrance.
  await page.waitForTimeout(250);

  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  // Allow 1px of slack for sub-pixel rounding.
  expect(Math.abs(scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
});
