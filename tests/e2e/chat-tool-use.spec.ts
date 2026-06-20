import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { encodeWorkspace } from '@/lib/workspaces/cookie';
import { openAssistantFab } from './helpers/open-assistant-fab';
import { openThreadMenu } from './helpers/open-thread-menu';
import { uploadSampleLease } from './helpers/upload-sample-lease';

async function startFreshConversation(page: import('@playwright/test').Page) {
  // Sprint 52.2 — the Clear control lives behind the chat-thread overflow (⋯)
  // menu. The trigger only renders once a thread/stash exists, so guard on it.
  const trigger = page.getByTestId('assistant-thread-menu-trigger');
  if (await trigger.isVisible()) {
    await openThreadMenu(page);
    await page.getByTestId('new-conversation-btn').click();
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

  // Sprint 11: also set the workspace cookie so the chat route doesn't
  // redirect to /onboarding before the test prompt fires.
  const workspaceToken = await encodeWorkspace({
    workspace_id: SAMPLE_WORKSPACE.id,
    created_workspace_ids: [],
  });

  await context.addCookies([
    {
      name: 'leaselens_workspace',
      value: workspaceToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
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

test('chat round-trip renders the extract_clauses ToolCard for Admin viewers', async ({
  page,
}) => {
  await page.goto('/');
  // Sprint 26c — homepage opens on Mode A; uploading lifts to Mode B
  // (ParserResultsShell). Chat now lives inside the FAB drawer, so the
  // spec opens the FAB before driving the composer.
  await uploadSampleLease(page);
  await openAssistantFab(page);
  await startFreshConversation(page);

  // The dev server runs with LEASELENS_E2E_MOCK=1; the mock client at
  // src/lib/anthropic/e2e-mock.ts ignores prompt content and returns a
  // deterministic extract_clauses tool_use. (Pre-Sprint 14 it returned
  // schedule_content_item; the rename happened when the project pivoted
  // from ContentOps to LeaseLens.) extract_clauses is read-only, so
  // there's no Undo button — Undo coverage requires a mutating-tool
  // mock that the suite doesn't currently provide.
  await page.getByRole('textbox').fill('Scan this lease.');
  await page.getByRole('button', { name: 'Send message' }).click();

  // Typing indicator visible between submit and first chunk.
  const indicator = page.getByRole('status', {
    name: 'Assistant is composing',
  });
  await expect(indicator).toBeVisible({ timeout: 5000 });

  // Wait for the ToolCard. Admin viewers see inline tool cards (Sprint
  // 18 §5); Tenants would see <ScanTimeline /> instead. .last() picks
  // the most recently rendered card under shared dev-server state.
  const toolCard = page
    .locator('button', { hasText: 'extract_clauses' })
    .last();
  await expect(toolCard).toBeVisible({ timeout: 30_000 });
});
