// Sprint 52.2 — chat-thread controls helper.
//
// "Clear assistant chat" / "Continue previous" no longer sit in a persistent
// toolbar strip; they live in a disclosure popover behind a slim floating ⋯
// trigger (`assistant-thread-menu-trigger`). Specs that act on the thread open
// the menu first via this helper, then click the item, so the real
// keyboard/pointer path is exercised (the items are display:none until opened).

import { expect, type Page } from '@playwright/test';

export async function openThreadMenu(page: Page): Promise<void> {
  await page.getByTestId('assistant-thread-menu-trigger').click();
  await expect(page.getByTestId('assistant-thread-menu')).toBeVisible();
}

/** Open the overflow menu and click "Clear assistant chat". */
export async function clearAssistantChat(page: Page): Promise<void> {
  await openThreadMenu(page);
  await page.getByTestId('new-conversation-btn').click();
}
