// Sprint 26c — helper for chat-dependent specs.
//
// After Sprint 26c, chat lives inside the FAB drawer. Specs that send
// a chat message need to open the drawer first. This helper clicks the
// pill, picks the "Help me understand a citation" chip (always
// enabled), then clears the prefilled prompt so the test can type its
// own message.

import { expect, type Page } from '@playwright/test';

export interface OpenAssistantOptions {
  /**
   * If set, leave the chip's prefill text in the composer instead of
   * clearing it. Defaults to false — most chat-flow specs want a
   * blank composer to type into.
   */
  keepPrefill?: boolean;
}

export async function openAssistantFab(
  page: Page,
  opts: OpenAssistantOptions = {},
): Promise<void> {
  await page.getByTestId('assistant-fab').click();
  await expect(page.getByTestId('assistant-fab-menu')).toBeVisible();
  await page
    .getByTestId('assistant-fab-chip')
    .filter({ hasText: /citation/i })
    .click();
  await expect(page.getByTestId('assistant-fab-drawer')).toBeVisible();
  if (!opts.keepPrefill) {
    await page.getByLabel('Type a message').fill('');
  }
}
