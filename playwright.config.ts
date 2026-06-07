import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local so LEASELENS_SESSION_SECRET is available to the Playwright
// process (used by tests/e2e/chat-tool-use.spec.ts to sign a session cookie).
loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  // Sprint 44C — keep the concise list output + add a viewable HTML report
  // (writes to playwright-report/; `open: 'never'` so CI/headless runs don't try
  // to launch a browser). View locally with `npx playwright show-report`.
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      // Engages src/lib/anthropic/e2e-mock.ts so the smoke test runs against
      // a deterministic mock instead of the real Anthropic API.
      LEASELENS_E2E_MOCK: '1',
      // Sprint 27 — e2e specs exercise role-switching + the cockpit link,
      // which are only rendered when demo mode is on. Production deploys
      // run with LEASELENS_DEMO_MODE=false so the public UI stays
      // Tenant-only; the e2e suite overrides to 'true' so existing
      // role-driven flows (cockpit, reviewer/admin panels) remain
      // reachable.
      LEASELENS_DEMO_MODE: 'true',
      // Forward the session secret so .env.local-driven encrypt() works in
      // the dev server process the same way it does in tests.
      ...(process.env.LEASELENS_SESSION_SECRET
        ? { LEASELENS_SESSION_SECRET: process.env.LEASELENS_SESSION_SECRET }
        : {}),
    },
  },
});
