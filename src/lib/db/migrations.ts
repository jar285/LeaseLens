/**
 * Issue #29 — versioned migration runner.
 *
 * Replaces the old idempotent boot-time patch system (`migrate.ts`, deleted):
 * every schema change is now a numbered migration in `migrations/`, applied
 * in order exactly once, tracked in `schema_migrations`.
 *
 * To add a migration: create `migrations/NNNN_description.ts` exporting a
 * `Migration` (`{ version, name, up }`), then register it in the MIGRATIONS
 * list in `migrations/index.ts`. Keep `up` SQLite-dialect (Turso is libSQL):
 * the same file must apply to local `file:` dev DBs and the hosted database.
 *
 * Upgrade note for pre-#29 local dev databases: they were built by the old
 * `SCHEMA` + `migrate()` boot path and already carry this end-state schema.
 * When the runner finds user tables but no `schema_migrations` history it
 * baseline-marks every known migration as applied instead of re-running DDL
 * (the statements are all `IF NOT EXISTS`, so even a re-run would be safe —
 * the mark is the faithful record). Dev data is preserved.
 */

import { logger } from '@/lib/log/logger';
import type { Db } from './client';
import { MIGRATIONS } from './migrations/index';
import type { Migration } from './migrations/types';

export type { Migration };

const MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  );
`;

async function appliedVersions(db: Db): Promise<Set<number>> {
  await db.exec(MIGRATIONS_TABLE_DDL);
  const rows = await db
    .prepare('SELECT version FROM schema_migrations')
    .all<{ version: number }>();
  return new Set(rows.map((r) => r.version));
}

async function userTableCount(db: Db): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name != 'schema_migrations'`,
    )
    .all<{ name: string }>();
  return rows.length;
}

async function recordApplied(
  db: { prepare: Db['prepare'] },
  m: Migration,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    )
    .run(m.version, m.name, Date.now());
}

export async function runMigrations(db: Db): Promise<void> {
  const applied = await appliedVersions(db);

  if (applied.size === 0 && (await userTableCount(db)) > 0) {
    // Pre-#29 database (built by the old better-sqlite3 boot path): the
    // tables already exist at the current end-state schema. Baseline-mark
    // rather than re-running DDL.
    logger.warn(
      'db.migrate: pre-existing database without migration history — ' +
        'baseline-marking all known migrations as applied; data preserved',
    );
    for (const m of MIGRATIONS) {
      await recordApplied(db, m);
    }
    return;
  }

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    logger.info(
      { version: m.version, name: m.name },
      'db.migrate: applying migration',
    );
    await db.transaction(async (tx) => {
      await tx.exec(m.up);
      await recordApplied(tx, m);
    });
  }
}
