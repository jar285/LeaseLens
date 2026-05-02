import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

async function startFreshConversation(page: import('@playwright/test').Page) {
  const newConversation = page.getByTestId('new-conversation-btn');
  if (await newConversation.isVisible()) {
    await newConversation.click();
  }
}

test.beforeEach(async ({ context }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin');
  if (!admin) throw new Error('Admin demo user not found');

  // SessionPayload requires userId + role + displayName — see src/lib/auth/types.ts
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

test('mutating tool flow renders ToolCard with working Undo', async ({
  page,
}) => {
  await page.goto('/');
  await startFreshConversation(page);

  // Send any prompt — the dev server runs with CONTENTOPS_E2E_MOCK=1 so the
  // mock client at src/lib/anthropic/e2e-mock.ts ignores prompt content
  // and deterministically returns a schedule_content_item tool_use.
  // Prompt content is irrelevant — the dev server runs with
  // CONTENTOPS_E2E_MOCK=1 so the mock returns a deterministic tool_use
  // for schedule_content_item against the seeded `brand-identity` slug.
  await page
    .getByRole('textbox')
    .fill('Schedule a brand-identity post for twitter tomorrow.');
  await page.getByRole('button', { name: 'Send message' }).click();

  // Sprint 9 §12.10 — typing indicator visible between submit and first chunk.
  // The indicator unmounts when a tool_use arrives or text streams in.
  // Timing note (sprint-QA M3): if this assertion flakes more than once in
  // 10 local runs, add a setTimeout(150) delay in
  // src/lib/anthropic/e2e-mock.ts before the first tool_use chunk.
  const indicator = page.getByRole('status', {
    name: 'Assistant is composing',
  });
  await expect(indicator).toBeVisible({ timeout: 5000 });

  // Wait for the ToolCard to render with the schedule_content_item tool_use.
  // Use .last() — under shared dev-server state, prior test runs may have
  // persisted ToolCards in the conversation history. The just-submitted card
  // is always the most recent.
  const toolCard = page
    .locator('button', { hasText: 'schedule_content_item' })
    .last();
  await expect(toolCard).toBeVisible({ timeout: 30_000 });

  // The Undo button appears next to the status pill for mutating-tool results.
  // exact: true disambiguates from the outer header button whose accessible
  // name happens to contain the descendant Undo text. .last() picks the
  // most recently rendered Undo (matching the most recent ToolCard).
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).last();
  await expect(undo).toBeVisible();

  // Click Undo and assert the rolled-back state.
  await undo.click();
  await expect(
    page.getByText('Rolled back', { exact: true }).last(),
  ).toBeVisible({ timeout: 5000 });
});
