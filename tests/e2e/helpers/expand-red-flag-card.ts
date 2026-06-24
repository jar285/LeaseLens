import { expect, type Locator } from '@playwright/test';

// Sprint 55 — hydration-safe red-flag card expand.
//
// The red-flag cards are server-rendered and visible on first paint (SSR
// rehydration from initialToolEvents), but React only attaches the toggle's
// onClick during hydration. On slow CI a toggle click fired before hydration
// lands is a silent no-op, so the card never expands and the expanded-body
// controls (jump-to-page / Explain / Draft email) never appear — the timing
// flake that timed these specs out under load. Retrying the click until
// data-expanded flips makes the expand deterministic regardless of hydration
// timing. Behaviour-only: it asserts the same data-expanded='true' the specs
// already expected, nothing new. Once expanded the toPass stops, so a click
// that DID register never gets a second (collapsing) click.
export async function expandRedFlagCard(card: Locator): Promise<void> {
  const toggle = card.getByTestId('red-flag-card-toggle');
  await expect(async () => {
    await toggle.click({ timeout: 3000 });
    await expect(card).toHaveAttribute('data-expanded', 'true', {
      timeout: 2000,
    });
  }).toPass({ timeout: 15000 });
}
