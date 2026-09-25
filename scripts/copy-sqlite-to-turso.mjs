#!/usr/bin/env node
// Issue #29 — one-time data migration: copy rows from a local SQLite file
// (e.g. ./data/leaselens.db) into the hosted Turso database.
//
// Usage:
//   LEASELENS_TURSO_URL=libsql://… LEASELENS_TURSO_AUTH_TOKEN=… \
//     node scripts/copy-sqlite-to-turso.mjs ./data/leaselens.db
//
// The target Turso database must already exist AND have migrations applied
// (run the app once against it — migrations run on first query). This script
// copies DATA only, table by table, in batches. Only columns present in BOTH
// source and target are copied, so an older dev schema still transfers.
// The script is idempotent-ish: it INSERT OR REPLACEs by primary key, so
// re-running overwrites rather than duplicating — but verify row counts
// afterwards with `node scripts/diag-db.mjs`.
//
// DANGER: this writes to your production database. Double-check
// LEASELENS_TURSO_URL before running.

import { createClient } from '@libsql/client';

const tursoUrl = process.env.LEASELENS_TURSO_URL;
const tursoToken = process.env.LEASELENS_TURSO_AUTH_TOKEN;
const sourcePath = process.argv[2];

if (!tursoUrl || !tursoToken) {
  console.error(
    'Set LEASELENS_TURSO_URL and LEASELENS_TURSO_AUTH_TOKEN first (see docs/hosted-database.md).',
  );
  process.exit(1);
}
if (!sourcePath) {
  console.error('Usage: node scripts/copy-sqlite-to-turso.mjs <sqlite-file>');
  process.exit(1);
}

const source = createClient({ url: `file:${sourcePath}` });
const target = createClient({ url: tursoUrl, authToken: tursoToken });

const BATCH = 200;

const tables = (
  await source.execute(
    `SELECT name FROM sqlite_master WHERE type='table'
     AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`,
  )
).rows.map((r) => r.name);

console.log(`Copying ${tables.length} tables from ${sourcePath} → ${tursoUrl}`);

for (const table of tables) {
  const targetCols = (
    await target.execute(`PRAGMA table_info(${table})`)
  ).rows.map((r) => r.name);
  if (targetCols.length === 0) {
    console.log(
      `  ${table}: missing in target — skipping (run the app once to migrate)`,
    );
    continue;
  }
  const sourceCols = (
    await source.execute(`PRAGMA table_info(${table})`)
  ).rows.map((r) => r.name);
  const cols = sourceCols.filter((c) => targetCols.includes(c));
  const colList = cols.map((c) => `"${c}"`).join(', ');

  let offset = 0;
  let copied = 0;
  for (;;) {
    const rows = (
      await source.execute({
        sql: `SELECT ${colList} FROM "${table}" LIMIT ? OFFSET ?`,
        args: [BATCH, offset],
      })
    ).rows;
    if (rows.length === 0) break;
    const statements = rows.map((row) => ({
      sql: `INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${cols.map(() => '?').join(', ')})`,
      args: cols.map((c) => row[c] ?? null),
    }));
    await target.batch(statements);
    copied += rows.length;
    offset += BATCH;
  }
  console.log(`  ${table}: ${copied} rows`);
}

console.log('Done. Verify with: node scripts/diag-db.mjs');
source.close();
target.close();
