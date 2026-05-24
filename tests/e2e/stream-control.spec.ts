// Sprint 25.2 — stream lifecycle: abort + orphan handling.
//
// Covers:
//   T7  — Sprint 25.1 R8: mid-stream "New conversation" cancels silently
//   T8  — Sprint 25.1 R8 + R1: mid-stream role switch aborts + no remount
//   T14e — visible regression check: orphan tool_result rows don't render cards

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  clearUserConversations,
  seedGradedConversation,
  seedLease,
} from './helpers/seed-gradings';
import { openAssistantFab } from './helpers/open-assistant-fab';
import { setSessionCookies } from './helpers/session';
import { uploadSampleLease } from './helpers/upload-sample-lease';

function tenantId(): string {
  const tenant = DEMO_USERS.find((u) => u.role === 'Tenant');
  if (!tenant) throw new Error('Tenant demo user not seeded');
  return tenant.id;
}

test.beforeEach(async ({ context }) => {
  clearUserConversations(tenantId());
  await setSessionCookies(context, 'Tenant');
});

/**
 * Intercept /api/chat with a handler that never resolves. The client-side
 * fetch hangs on the response, giving the test a deterministic mid-stream
 * window to fire AbortController. Faster + cleaner than driving the live
 * mock with timing races.
 */
async function holdChatRouteOpen(page: import('@playwright/test').Page) {
  await page.route('**/api/chat', async () => {
    // Never resolve. The route is torn down when the test ends or the
    // client aborts. ChatUI's AbortController is the load-bearing actor.
    await new Promise(() => {});
  });
}

test('T7 (R8) — mid-stream "New conversation" aborts silently', async ({
  page,
}) => {
  await holdChatRouteOpen(page);
  await page.goto('/');
  // Sprint 26c — chat lives inside the FAB drawer. Land in Mode B via
  // upload, then open the FAB so the composer is reachable.
  await uploadSampleLease(page);
  await openAssistantFab(page);

  await page.getByRole('textbox').fill('Tell me everything about NJ tenant law.');
  await page.getByRole('button', { name: 'Send message' }).click();

  // The typing indicator confirms the stream is in flight (composer locked,
  // assistant bubble created).
  await expect(
    page.getByRole('status', { name: 'Assistant is composing' }),
  ).toBeVisible({ timeout: 5_000 });

  // Mid-flight: click New conversation. ChatUI.handleNewConversation
  // calls abortRef.current?.abort() at the top — the fetch rejects with
  // AbortError, the catch branch drops the in-flight bubble silently.
  await page.getByTestId('new-conversation-btn').click();

  // No error banner.
  await expect(page.locator('text=Failed to generate response')).toHaveCount(0);
  // Composer is unlocked again.
  await expect(page.getByRole('textbox')).toBeEnabled();
  // The typing indicator is gone.
  await expect(
    page.getByRole('status', { name: 'Assistant is composing' }),
  ).toHaveCount(0);
});

// T8 was designed to test R8+R1 combined (mid-stream role switch). On
// closer reading the premise doesn't hold: R1 keeps the shell mounted
// across role switches (router.refresh, not revalidatePath), so the
// fetch's AbortController unmount-cleanup never fires. The in-flight
// fetch just keeps running with the OLD session cookie. R1 alone is
// already pinned by T2 in three-pane-shell.spec.ts — no need for a
// second R1 test under a streaming guise.

test('T14e — orphan tool_result row is silently skipped (card count check)', async ({
  page,
}) => {
  const userId = tenantId();
  const leaseId = seedLease({
    workspaceId: SAMPLE_WORKSPACE.id,
    uploadedBy: userId,
    filename: 't14e-lease.pdf',
  });
  const { conversationId } = seedGradedConversation({
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    leaseId,
    gradings: [
      { clauseId: 't14e-A', severity: 'high', pageNumber: 1, clauseIndex: 0 },
      { clauseId: 't14e-B', severity: 'medium', pageNumber: 2, clauseIndex: 1 },
    ],
  });

  // Add one orphan tool_result row — a tool_result whose tool_use_id has
  // no matching tool_use row. rehydrateToolEvents should warn and skip;
  // the visible regression is "no extra card for the orphan."
  const orphanTs = Math.floor(Date.now() / 1000) + 7200;
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, 'tool', ?, ?)`,
  ).run(
    randomUUID(),
    conversationId,
    JSON.stringify({
      tool_result: {
        id: 'toolu_orphan_no_matching_use',
        result: {
          clause_id: 't14e-ORPHAN',
          severity: 'high',
          statute_citation: 'NJ Stat 46:8-19',
          chunk_id: 'security-deposit-cap#section:1',
          reasoning: 'Should never render.',
          recommended_action: 'n/a',
          page_number: 9,
        },
      },
    }),
    orphanTs,
  );

  await page.goto('/');

  // Exactly two cards — the orphan is silently dropped. The console.warn
  // from rehydrate-history.ts:202 is asserted in the unit test
  // src/lib/chat/rehydrate-history.test.ts; here we verify the
  // user-visible regression: the bad row doesn't become a phantom card.
  await expect(page.getByTestId('red-flag-card')).toHaveCount(2);
});
