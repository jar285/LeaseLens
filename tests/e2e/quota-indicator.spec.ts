// Sprint D.17ui (#17, #25) — QuotaMeter e2e: the drawer's usage indicator.
//
// Drives the three user-visible states end-to-end through the real dev server
// (demo profile — the e2e webServer runs LEASELENS_DEMO_MODE=true, where
// guardrailsEnforced() is also true, so the rate limit, the daily spend
// ceiling, and both notice paths are all live):
//   LOW      — the demo limiter emits {quota:{remaining,limit:10}} at ≤2 left
//              → draining meter + "N questions left this hour".
//   RATE 429 — limiter exhausted → calm question-limit notice, NEVER the red
//              "Failed to generate response" banner (the regression this
//              sprint fixed).
//   DAILY    — spend ceiling exceeded → typed {budget:{scope:'daily'}} event
//              → calm "paused for today" notice.
// Public-anon-only behavior (composite tiers, per-visitor isolation) is
// pinned by the vitest integration suites — a public-anon Playwright project
// is future CI work (see docs/_specs/sprint-backend-hardening/impl.md).
//
// STATE HYGIENE: these tests seed the SHARED guardrail tables (rate_limit,
// spend_log). Both are wiped before AND after every test — a leaked
// exhausted window would 429 every later chat spec in the suite.

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { db } from '@/lib/db';
import { openAssistantFab } from './helpers/open-assistant-fab';
import { setSessionCookies } from './helpers/session';

const TENANT = DEMO_USERS.find((u) => u.role === 'Tenant');
if (!TENANT) throw new Error('No seeded demo Tenant — run npm run db:seed');
const TENANT_ID = TENANT.id;

function wipeGuardrailState(): void {
  db.prepare('DELETE FROM rate_limit').run();
  db.prepare("DELETE FROM spend_log WHERE date = date('now')").run();
}

/** Seed the demo limiter so the NEXT turn leaves `remainingAfterTurn`. */
function seedRateWindow(countSoFar: number): void {
  db.prepare(
    'INSERT OR REPLACE INTO rate_limit (session_id, window_start, count) VALUES (?, ?, ?)',
  ).run(TENANT_ID, Math.floor(Date.now() / 1000), countSoFar);
}

function seedSpendOverCeiling(): void {
  // 2M in + 500k out ≈ $3.60 > the $2 default LEASELENS_DAILY_SPEND_CEILING_USD.
  db.prepare(
    "INSERT INTO spend_log (date, tokens_in, tokens_out) VALUES (date('now'), 2000000, 500000)",
  ).run();
}

test.describe('QuotaMeter — usage indicator states (sD.17ui)', () => {
  test.beforeEach(async ({ context, page }) => {
    wipeGuardrailState();
    await setSessionCookies(context, 'Tenant');
    await page.goto('/');
  });

  test.afterEach(() => {
    wipeGuardrailState();
  });

  test('low window → draining meter with count text + progressbar semantics', async ({
    page,
  }) => {
    // Demo limiter caps at 10/hour and emits quota once remaining ≤ 2.
    // 7 already used → this turn increments to 8 → remaining 2 → meter.
    seedRateWindow(7);

    await openAssistantFab(page);
    await page.getByLabel('Type a message').fill('Is my late fee legal?');
    await page.getByLabel('Type a message').press('Enter');

    const meter = page.getByTestId('quota-meter');
    await expect(meter).toBeVisible();
    await expect(meter).toContainText('2 questions left this hour.');
    const bar = page.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '2');
    await expect(bar).toHaveAttribute('aria-valuemax', '10');
    // The retired raw-amber banner copy must never render.
    await expect(page.getByText(/Demo quota:/i)).toHaveCount(0);
  });

  test('exhausted window (429) → calm question-limit notice, never the red error banner', async ({
    page,
  }) => {
    seedRateWindow(10); // at the cap — the next turn is refused

    await openAssistantFab(page);
    await page.getByLabel('Type a message').fill('And my security deposit?');
    await page.getByLabel('Type a message').press('Enter');

    const notice = page.getByTestId('budget-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("this hour's question limit");
    await expect(notice).toContainText('Your lease review stays available.');
    // The regression this sprint fixed: a reached limit is not a failure.
    await expect(page.getByText('Failed to generate response')).toHaveCount(0);
  });

  test('daily spend ceiling → typed budget event → calm "paused for today" notice', async ({
    page,
  }) => {
    seedSpendOverCeiling();

    await openAssistantFab(page);
    await page.getByLabel('Type a message').fill('One more question?');
    await page.getByLabel('Type a message').press('Enter');

    const notice = page.getByTestId('budget-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('paused for today');
    await expect(notice).toContainText('red flags stay available');
    // The retired demo-copy ceiling chunk must never render as a message.
    await expect(page.getByText(/Daily demo quota reached/i)).toHaveCount(0);
  });
});
