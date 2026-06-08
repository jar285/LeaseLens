// Sprint 26c — FAB assistant E2E coverage.
//
// Verifies the new floating-assistant flow:
//   - Pill is keyboard-reachable; click expands the quick-action menu.
//   - Clicking a chip opens the drawer with a prefilled prompt.
//   - Escape closes the drawer; focus returns to the pill.
//   - Red-flag "Explain" / "Draft email" buttons open the drawer with
//     a clause-aware prefill.
//   - Clause-row "Explain" opens the drawer with a clause-aware prefill.

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  clearUserConversations,
  seedGradedConversation,
  seedLease,
} from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';

const TENANT_ID = DEMO_USERS.find((u) => u.role === 'Tenant')!.id;

test.beforeEach(async ({ context }) => {
  clearUserConversations(TENANT_ID);
  await setSessionCookies(context, 'Tenant');
});

test('pill opens the assistant drawer directly, with suggested prompts inside', async ({
  page,
}) => {
  // Sprint 27.1 — the standalone quick-action MENU is gone: the pill opens the
  // drawer directly, and the chips moved inside as `chat-suggested-prompt`
  // suggestions (shown while the thread is empty). No lease needed — the
  // landing (Mode A) mounts the FAB with the always-enabled onboarding chips.
  await page.goto('/');

  const pill = page.getByTestId('assistant-fab');
  await expect(pill).toBeVisible();
  // The aria-label now carries a dynamic state suffix ("— Help" / "— Ask…").
  await expect(pill).toHaveAttribute('aria-label', /^Open assistant/);
  await pill.click();

  // Opens the drawer directly (no intermediate menu).
  await expect(page.getByTestId('assistant-fab-drawer')).toBeVisible();
  // Quick-action chips live inside the drawer now.
  await expect(page.getByTestId('chat-suggested-prompt').first()).toBeVisible();
  // (The card-driven prefill path — fab.openWith — is covered by the
  // red-flag / clause-row "Explain" tests below.)
});

test('Escape closes the drawer and returns focus to the pill', async ({
  page,
}) => {
  await page.goto('/');

  const pill = page.getByTestId('assistant-fab');
  await pill.click();

  const drawer = page.getByTestId('assistant-fab-drawer');
  await expect(drawer).toBeVisible();
  await drawer.press('Escape');

  // The drawer STAYS MOUNTED (drafts persist, CLAUDE.md invariant) — it closes
  // via state, not unmount — so assert the closed state + focus return, not
  // removal from the DOM.
  await expect(drawer).toHaveAttribute('data-state', 'closed');
  await expect(pill).toBeFocused();
});

test('red-flag "Explain" opens the FAB drawer with a clause-aware prompt', async ({
  page,
}) => {
  // Seed a graded conversation so the red-flag cards exist on first paint.
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: TENANT_ID,
    filename: 'fab-spec-lease.pdf',
  });
  seedGradedConversation({
    userId: TENANT_ID,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    userMessageText: 'Scan this lease.',
    gradings: [
      {
        clauseId: 'fab-high-deposit',
        severity: 'high',
        pageNumber: 2,
        clauseIndex: 0,
        clauseType: 'security_deposit',
        statuteCitation: 'NJ Stat 46:8-19',
      },
    ],
  });

  await page.goto('/');
  // The page rehydrates initialActiveLease + initialToolEvents so we
  // land directly in Mode B with the card visible.
  const card = page.getByTestId('red-flag-card');
  await expect(card).toBeVisible();

  await card.getByTestId('red-flag-card-toggle').click();
  await card.getByTestId('red-flag-explain').click();

  await expect(page.getByTestId('assistant-fab-drawer')).toBeVisible();
  await expect(page.getByLabel('Type a message')).toHaveValue(/explain/i);
  await expect(page.getByLabel('Type a message')).toHaveValue(
    /NJ Stat 46:8-19/,
  );
});

test('clause-row "Explain" opens the FAB drawer with a row-aware prompt', async ({
  page,
}) => {
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: TENANT_ID,
    filename: 'fab-clauses-lease.pdf',
  });
  seedGradedConversation({
    userId: TENANT_ID,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    gradings: [
      {
        clauseId: 'row-explain-1',
        severity: 'medium',
        pageNumber: 4,
        clauseIndex: 2,
        clauseType: 'late_fee',
      },
    ],
  });

  await page.goto('/');
  const explain = page.getByTestId('clauses-list-row-explain').first();
  await expect(explain).toBeVisible();
  await explain.click();

  await expect(page.getByTestId('assistant-fab-drawer')).toBeVisible();
  await expect(page.getByLabel('Type a message')).toHaveValue(/explain/i);
});
