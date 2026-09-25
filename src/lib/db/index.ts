/**
 * Issue #29 — database entry point.
 *
 * `db` is a `Db` (see `./client`) backed by `@libsql/client`, speaking the
 * SQLite dialect against one of three backends selected by environment:
 *
 *   - `LEASELENS_TURSO_URL` set → hosted Turso (`libsql://…` + token).
 *     Required for production (Vercel's filesystem is ephemeral — a local
 *     SQLite file would lose every review on redeploy). Fail-closed: the env
 *     schema refuses to boot public-anon mode without it.
 *   - otherwise → local `file:` database at `LEASELENS_DB_PATH` (dev/test,
 *     same file layout as the old better-sqlite3 path).
 *
 * Initialization (pragmas → versioned migrations → corpus sanity check) runs
 * lazily before the first query and exactly once; every method awaits it, so
 * importers keep using `db` as before — only `await` the statement calls.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/log/logger';
import {
  createDbClient,
  type Db,
  type DbClientConfig,
  type DbStatement,
  type DbTransaction,
  isLocalFileConfig,
} from './client';
import { runMigrations } from './migrations';

function resolveConfig(): DbClientConfig {
  if (env.LEASELENS_TURSO_URL) {
    return {
      url: env.LEASELENS_TURSO_URL,
      authToken: env.LEASELENS_TURSO_AUTH_TOKEN,
    };
  }
  if (!env.LEASELENS_DEMO_MODE) {
    mkdirSync(dirname(env.LEASELENS_DB_PATH), { recursive: true });
  }
  // `:memory:` (used by .env.test) is passed through as-is; everything else
  // becomes a libSQL `file:` URL.
  const dbPath = env.LEASELENS_DB_PATH;
  return { url: dbPath === ':memory:' ? ':memory:' : `file:${dbPath}` };
}

async function initialize(raw: Db, config: DbClientConfig): Promise<void> {
  if (isLocalFileConfig(config)) {
    // The pragmas the old better-sqlite3 boot path set on its single
    // connection: WAL mode, busy timeout, FK enforcement. Remote Turso
    // databases are server-managed — no pragmas issued.
    await raw.exec('PRAGMA busy_timeout = 5000;');
    await raw.exec('PRAGMA journal_mode = WAL;');
    await raw.exec('PRAGMA foreign_keys = ON;');
  }
  await runMigrations(raw);

  // Phase 10.7 — startup sanity check (unchanged behavior, now async). The
  // NJ tenant-law corpus is the hard dependency for grade_clause_severity;
  // log loudly if it's empty so a misconfigured deploy is obvious.
  if (!env.LEASELENS_DEMO_MODE) {
    try {
      const row = await raw
        .prepare('SELECT COUNT(*) AS n FROM chunks')
        .get<{ n: number }>();
      if ((row?.n ?? 0) === 0) {
        logger.warn(
          { hint: 'run `npm run db:seed`' },
          'db.corpus_empty: chunks table empty — NJ tenant-law corpus not loaded',
        );
      }
    } catch {
      // Defensive: schema/migrations already ran, but don't let a sanity
      // check take down boot.
    }
  }
}

/**
 * `Db` facade whose first use triggers exactly-once initialization
 * (pragmas → migrations → corpus check). Importers use it like the old
 * synchronous `db`, awaiting each statement call.
 */
class InitializingDb implements Db {
  private readonly ready: Promise<Db>;

  constructor() {
    this.ready = (async () => {
      const config = resolveConfig();
      const raw = createDbClient(config);
      await initialize(raw, config);
      return raw;
    })();
    // Every method below awaits `ready` and surfaces init failures to its
    // caller; this bare catch only avoids unhandled-rejection noise when no
    // query ever runs (e.g. a process that imports the module but exits).
    this.ready.catch(() => undefined);
  }

  prepare(sql: string): DbStatement {
    return {
      get: (...args) => this.ready.then((db) => db.prepare(sql).get(...args)),
      all: (...args) => this.ready.then((db) => db.prepare(sql).all(...args)),
      run: (...args) => this.ready.then((db) => db.prepare(sql).run(...args)),
    };
  }

  exec(script: string): Promise<void> {
    return this.ready.then((db) => db.exec(script));
  }

  transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    return this.ready.then((db) => db.transaction(fn));
  }
}

export const db: Db = new InitializingDb();
export type { Db, DbStatement, DbTransaction };
