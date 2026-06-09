// Helper for chat-dependent specs.
//
// Chat lives inside the FAB drawer. Sprint 27.1 removed the standalone
// quick-action MENU: the pill now opens the drawer DIRECTLY (the chips moved
// inside the drawer as `chat-suggested-prompt` suggestions). Specs that send a
// chat message just open the drawer and type. This helper clicks the pill,
// waits for the drawer, and (by default) clears the composer so the test can
// type its own message.

import { expect, type Page } from '@playwright/test';

export interface OpenAssistantOptions {
  /**
   * If set, leave whatever text is already in the composer (e.g. a prompt a
   * card pre-seeded via fab.openWith). Defaults to false — most chat-flow
   * specs want a blank composer to type into.
   */
  keepPrefill?: boolean;
}

export async function openAssistantFab(
  page: Page,
  opts: OpenAssistantOptions = {},
): Promise<void> {
  await page.getByTestId('assistant-fab').click();
  await expect(page.getByTestId('assistant-fab-drawer')).toBeVisible();
  if (!opts.keepPrefill) {
    await page.getByLabel('Type a message').fill('');
  }
}
