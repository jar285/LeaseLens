// Sprint 25.2 — red-flag card interactions.
//
// All tests use direct DB seeding (via helpers/seed-gradings.ts) instead of
// driving the chat through the live mock — the e2e-mock at
// src/lib/anthropic/e2e-mock.ts only emits extract_clauses, not gradings.
// Seeding through the messages table exercises the same SSR rehydration
// path users hit on every refresh / role-switch / cockpit-RT.
//
// Covers:
//   T11 — Tenant golden path: cards visible, expand toggles, jump-to-page
//   T6  — Sprint 25.1 R7: rapid citation clicks; most recent owns full ring
//   T18 — reduced-motion rendering of the active ring

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  clearUserConversations,
  seedGradedConversation,
  seedLease,
} from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';

function tenantId(): string {
  const tenant = DEMO_USERS.find((u) => u.role === 'Tenant');
  if (!tenant) throw new Error('Tenant demo user not seeded');
  return tenant.id;
}

test.beforeEach(async ({ context }) => {
  clearUserConversations(tenantId());
  await setSessionCookies(context, 'Tenant');
});

test('T11 — Tenant golden path: seeded gradings render, expand, jump-to-page', async ({
  page,
}) => {
  const userId = tenantId();
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: userId,
    filename: 't11-lease.pdf',
  });
  seedGradedConversation({
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    userMessageText: 'Scan this lease.',
    gradings: [
      {
        clauseId: 't11-clause-high',
        severity: 'high',
        pageNumber: 3,
        clauseIndex: 0,
        clauseType: 'security_deposit',
        statuteCitation: 'NJ Stat 46:8-19',
        reasoning: 'Two months exceeds the 1.5-month cap.',
        recommendedAction: 'Request a reduction to 1.5 months.',
      },
      {
        clauseId: 't11-clause-med',
        severity: 'medium',
        pageNumber: 5,
        clauseIndex: 1,
        clauseType: 'late_fee',
      },
    ],
  });

  await page.goto('/');

  const cards = page.getByTestId('red-flag-card');
  await expect(cards).toHaveCount(2);

  // RedFlagReport sorts by severity, then by clause_index. high → medium.
  await expect(cards.nth(0)).toHaveAttribute('data-severity', 'high');
  await expect(cards.nth(1)).toHaveAttribute('data-severity', 'medium');

  // Expand the first card.
  await cards.nth(0).getByTestId('red-flag-card-toggle').click();
  await expect(cards.nth(0)).toHaveAttribute('data-expanded', 'true');
  await expect(cards.nth(0).getByTestId('red-flag-jump-to-page')).toBeVisible();

  // Click "View on page N" — triggers activeClauseId broadcast.
  await cards.nth(0).getByTestId('red-flag-jump-to-page').click();
  await expect(cards.nth(0)).toHaveAttribute('data-active', 'true');
});

test('T6 (R7) — rapid citation clicks: most recent owns full 4s ring', async ({
  page,
}) => {
  // Install Playwright's clock BEFORE navigation so the page's first
  // render sees the fake clock from the start.
  await page.clock.install();

  const userId = tenantId();
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: userId,
    filename: 't6-lease.pdf',
  });
  seedGradedConversation({
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    gradings: [
      { clauseId: 't6-A', severity: 'high', pageNumber: 2, clauseIndex: 0 },
      { clauseId: 't6-B', severity: 'high', pageNumber: 4, clauseIndex: 1 },
      { clauseId: 't6-C', severity: 'high', pageNumber: 6, clauseIndex: 2 },
    ],
  });

  await page.goto('/');

  const cards = page.getByTestId('red-flag-card');
  await expect(cards).toHaveCount(3);

  // Expand the first two so their jump-to-page buttons are visible.
  await cards.nth(0).getByTestId('red-flag-card-toggle').click();
  await cards.nth(1).getByTestId('red-flag-card-toggle').click();

  // t=0: click card A → activeClauseId=A, timer scheduled at t=4000.
  await cards.nth(0).getByTestId('red-flag-jump-to-page').click();
  await expect(cards.nth(0)).toHaveAttribute('data-active', 'true');

  await page.clock.fastForward(400);

  // t=400: click card B → A's timer cleared, B's timer at t=4400.
  await cards.nth(1).getByTestId('red-flag-jump-to-page').click();
  await expect(cards.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(cards.nth(0)).toHaveAttribute('data-active', 'false');

  // Advance to t=3900 — neither timer has fired yet. B should still glow.
  // Pre-R7 fix: A's stale timer (originally at t=4000) would have fired
  // and cleared B early. The fix wires `clearTimeout` on every replace.
  await page.clock.fastForward(3500);
  await expect(cards.nth(1)).toHaveAttribute('data-active', 'true');

  // Advance to t=4600 — past B's t=4400 timeout. Ring should clear.
  await page.clock.fastForward(700);
  await expect(cards.nth(1)).toHaveAttribute('data-active', 'false');
});

test('T18 — reduced-motion: active ring renders static fallback (data-motion="off")', async ({
  page,
}) => {
  // emulateMedia must run BEFORE goto so the page's first paint sees the
  // reduced-motion preference. useReducedMotion() from motion/react reads
  // window.matchMedia('(prefers-reduced-motion: reduce)') at mount.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const userId = tenantId();
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: userId,
    filename: 't18-lease.pdf',
  });
  seedGradedConversation({
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    gradings: [
      { clauseId: 't18-A', severity: 'high', pageNumber: 2, clauseIndex: 0 },
    ],
  });

  await page.goto('/');

  const card = page.getByTestId('red-flag-card').nth(0);
  await card.getByTestId('red-flag-card-toggle').click();
  await card.getByTestId('red-flag-jump-to-page').click();

  // RedFlagReport's <ActiveRing /> renders a static <span> (no motion)
  // under reduced-motion. data-motion="off" identifies the fallback path.
  await expect(card.getByTestId('red-flag-active-ring')).toBeVisible();
  await expect(card.getByTestId('red-flag-active-ring')).toHaveAttribute(
    'data-motion',
    'off',
  );
});
