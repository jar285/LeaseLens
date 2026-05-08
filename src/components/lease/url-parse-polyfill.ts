// Sprint 13 / Phase 10 hotfix — main-thread platform polyfills for pdfjs.
//
// (1) `URL.parse(input, base)` — pdfjs-dist v5 calls this from its
//     `getUrlProp` helper. Available only in Chrome 124+, Safari 18.4+,
//     Firefox 136+, Node 22.1+. Polyfill returns a parsed URL or null,
//     never throws.
//
// (2) `Promise.try(fn, ...args)` — pdfjs-dist v5 uses this on the main
//     thread as well as the worker. It is a 2024 platform method
//     (Chrome 128+, Safari 18.2+, Firefox 134+, Node 23+) and is
//     missing from older runtimes. Polyfill mirrors the spec: synchronous
//     throws are converted to rejected promises, and a thenable return
//     value is awaited via `Promise.resolve` semantics.
//
// The worker thread has its own global scope and is not patched by this
// file. We address the worker side by serving pdfjs's LEGACY worker
// build from /public (see scripts/copy-pdf-worker.mjs), which ships its
// own inline polyfills.
//
// Importing this module before `react-pdf` guarantees both globals are
// patched before any pdfjs code runs (ES modules execute in source order).

interface URLStatic {
  parse?: (input: string, base?: string | URL) => URL | null;
}

const urlTarget = URL as unknown as URLStatic;
if (typeof urlTarget.parse !== 'function') {
  urlTarget.parse = (input: string, base?: string | URL): URL | null => {
    try {
      return new URL(input, base);
    } catch {
      return null;
    }
  };
}

interface PromiseStatic {
  try?: <T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ) => Promise<T>;
}

const promiseTarget = Promise as unknown as PromiseStatic;
if (typeof promiseTarget.try !== 'function') {
  promiseTarget.try = <T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ): Promise<T> => new Promise<T>((resolveFn) => resolveFn(fn(...args)));
}

export {};
