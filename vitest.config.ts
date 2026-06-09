import path from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [react()],
    test: {
      environment: 'happy-dom',
      include: [
        'src/**/*.test.{ts,tsx}',
        'tests/**/*.test.{ts,tsx}',
        'mcp/**/*.test.{ts,tsx}',
      ],
      setupFiles: ['./vitest.setup.ts'],
      // Sprint 44C — keep the fast default reporter locally; add machine-readable
      // JUnit under CI (uploaded as an artifact). Coverage is opt-in via
      // `--coverage` (npm run test:coverage) so plain `npm test` stays fast.
      reporters: process.env.CI
        ? [
            'default',
            ['junit', { outputFile: './test-results/vitest-junit.xml' }],
          ]
        : ['default'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        // Sprint 44C — ratcheted to the 2026-06-06 baseline (stmts 86.5 /
        // branches 78.5 / functions 86.8 / lines 88.8); floors sit a few points
        // below so a small, legitimate fluctuation doesn't red CI.
        thresholds: {
          statements: 84,
          branches: 75,
          functions: 84,
          lines: 86,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
