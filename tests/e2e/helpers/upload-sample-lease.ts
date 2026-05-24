// Sprint 26a — shared upload helper for parser-first specs.
//
// Walks a Playwright Page from Mode A (landing) through upload completion
// to Mode B (legacy three-pane shell in 26a; replaced by ParserResultsShell
// in 26b). Used by parser-landing.spec.ts, parser-results.spec.ts (26b),
// fab-assistant.spec.ts (26c), and parser-mobile.spec.ts (26d).

import { expect, type Page } from '@playwright/test';

export const SAMPLE_LEASE_PATH =
  'src/corpus/sample-lease/sample-nj-residential-lease.pdf';

export interface UploadOptions {
  /** Optional override path (must be a text-layer PDF ≤ 10 MB). */
  filePath?: string;
  /** Timeout for the post-upload mode-B transition. Default 30s. */
  timeout?: number;
}

/**
 * Uploads `filePath` (defaults to the bundled sample NJ residential
 * lease) via the hero dropzone's file input and waits for the workspace
 * router to swap into the post-upload shell. Sprint 26b made the
 * post-upload shell `ParserResultsShell` (testid `parser-results-shell`).
 *
 * The helper waits for either the new shell OR the legacy three-pane
 * shell so it survives transitional commits where one is in-flight.
 * Sprint 26d collapses this to a single assertion.
 */
export async function uploadSampleLease(
  page: Page,
  opts: UploadOptions = {},
): Promise<void> {
  const filePath = opts.filePath ?? SAMPLE_LEASE_PATH;
  const timeout = opts.timeout ?? 30_000;

  await page.getByTestId('lease-upload-input').setInputFiles(filePath);

  // Wait for whichever post-upload shell mounts first.
  const postUploadShell = page.locator(
    '[data-testid="parser-results-shell"], [data-testid="shell-root"]',
  );
  await expect(postUploadShell.first()).toBeVisible({ timeout });
}
