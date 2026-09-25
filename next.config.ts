import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Sprint 13 — pdfjs-dist's legacy Node build resolves its worker via
  // a dynamic import relative to its own file. Bundling it through
  // Turbopack mangles that path and breaks "fake worker" setup at
  // runtime (`Cannot find module .../pdf.worker.mjs`). Marking it as a
  // server-external package keeps the import on the Node module path
  // so the relative resolution works.
  // Issue #29 — better-sqlite3 is gone (replaced by @libsql/client, which
  // is pure JS + prebuilt native bindings and needs no externalization).
  serverExternalPackages: ['pdfjs-dist'],
  outputFileTracingIncludes: {
    '/*': ['./data/**/*'],
  },
};

export default nextConfig;
