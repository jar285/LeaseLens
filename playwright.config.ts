import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Load .env.local so CONTENTOPS_SESSION_SECRET is available to the Playwright
// process (used by tests/e2e/chat-tool-use.spec.ts to sign a session cookie).
loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
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
      CONTENTOPS_E2E_MOCK: '1',
      // Forward the session secret so .env.local-driven encrypt() works in
      // the dev server process the same way it does in tests.
      ...(process.env.CONTENTOPS_SESSION_SECRET
        ? { CONTENTOPS_SESSION_SECRET: process.env.CONTENTOPS_SESSION_SECRET }
        : {}),
    },
  },
});
