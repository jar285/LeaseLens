#!/usr/bin/env node
// Sprint 13 / Phase 10 hotfix G — copy pdfjs-dist worker to /public.
//
// react-pdf's "import the worker via new URL(..., import.meta.url)"
// recipe does not resolve reliably under Turbopack for deep package
// paths, leading to a silent "Loading PDF…" hang. Serving the file
// statically from /public sidesteps bundler asset detection entirely.
// Run via the `postinstall` npm script so the public copy stays in
// sync with whatever pdfjs-dist version is pinned in package.json.
//
// We source from pdfjs-dist's LEGACY build, not the modern one. The
// modern worker calls `Promise.try` (a 2024 platform method missing
// in older browser runtimes) and throws silently inside the worker
// when it isn't available — `<Document>` then hangs forever because
// `onLoadError` cannot observe in-worker init failures. The legacy
// build is transpiled with broader compat targets and ships its own
// inline polyfills. This also matches `src/lib/lease/parse-pdf.ts`,
// which already imports `pdfjs-dist/legacy/build/pdf.mjs` server-side.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Source candidates, in priority order. react-pdf pins pdfjs-dist to
// an EXACT version in its own dependencies, and npm/pnpm install it
// nested under react-pdf when our top-level pdfjs-dist version differs
// (we currently have 5.6.205; react-pdf 10.4.1 pins 5.4.296). The
// worker MUST come from the same install as the API react-pdf imports
// at runtime, otherwise pdfjs throws:
//   "The API version 'X' does not match the Worker version 'Y'."
// Try the nested copy first; fall through to the top-level only when
// react-pdf has no nested install (npm hoisted it because the
// versions happened to align).
const candidates = [
  resolve(
    repoRoot,
    'node_modules/react-pdf/node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  ),
  resolve(repoRoot, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
];

const src = candidates.find((p) => existsSync(p));

if (!src) {
  // pdfjs-dist not installed yet (e.g., first install on a fresh
  // clone before deps resolve). Silently skip — `postinstall` will
  // re-run on completion.
  process.exit(0);
}

const dstDir = resolve(repoRoot, 'public');
const dst = resolve(dstDir, 'pdf.worker.min.mjs');

if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-pdf-worker] ${src} → ${dst}`);
