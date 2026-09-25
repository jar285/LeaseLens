#!/usr/bin/env node

// Sprint 13 / Phase 10.7 — self-healing corpus.
//
// Runs from `predev` and `prebuild`. If the chunks table is empty
// (or the DB doesn't exist yet) it shells out to `npm run db:seed`,
// which embeds the NJ tenant-law corpus (~165 chunks, ~30s on a
// modern laptop). If chunks exist, exits silently.
//
// Why a separate script vs. lazily seeding inside the app: lazy seed
// would block the first chat request for ~30s while the user watches
// a spinner. Doing it as a build-time step happens BEFORE dev server
// is announced ready, so the user only sees "Ready in …" once the
// corpus is genuinely usable.
//
// Issue #29 — ported from better-sqlite3 to @libsql/client so the check
// works against the local file DB (default) or the hosted Turso database
// when LEASELENS_TURSO_URL is set.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@libsql/client';

// Read .env.local for the DB path. `next dev` does this automatically;
// we replicate a minimal subset here so this script can run before next.
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const tursoUrl = process.env.LEASELENS_TURSO_URL;
const dbPath = process.env.LEASELENS_DB_PATH || './data/leaselens.db';
const absDbPath = resolve(process.cwd(), dbPath);

let chunkCount = 0;
const dbExists = tursoUrl ? true : existsSync(absDbPath);
if (dbExists) {
  const client = createClient(
    tursoUrl
      ? { url: tursoUrl, authToken: process.env.LEASELENS_TURSO_AUTH_TOKEN }
      : { url: dbPath === ':memory:' ? ':memory:' : `file:${absDbPath}` },
  );
  try {
    try {
      const rs = await client.execute('SELECT COUNT(*) AS n FROM chunks');
      chunkCount = Number(rs.rows[0]?.n ?? 0);
    } catch {
      // chunks table doesn't exist (fresh DB) — treat as empty.
      chunkCount = 0;
    }
  } catch {
    // DB exists but can't be opened (locked, corrupt, unreachable) — let the
    // seed attempt to proceed; if it fails, the seed itself will surface a
    // clearer error than we can produce here.
    chunkCount = 0;
  } finally {
    client.close();
  }
}

if (chunkCount > 0) {
  console.log(
    `[seed-if-empty] corpus loaded (${chunkCount} chunks). Skipping seed.`,
  );
  process.exit(0);
}

console.log(
  `[seed-if-empty] corpus is empty${dbExists ? '' : ' (no DB yet)'} — running db:seed (~30s, one-time)…`,
);
const result = spawnSync('npm', ['run', 'db:seed'], {
  stdio: 'inherit',
  cwd: process.cwd(),
});
process.exit(result.status ?? 1);
