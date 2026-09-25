/**
 * Issue #29 — database driver abstraction.
 *
 * The whole codebase previously spoke better-sqlite3's synchronous API
 * directly, which tied production to a local SQLite file (unusable on
 * Vercel's ephemeral filesystem). This module defines a minimal async
 * `Db` interface implemented on top of `@libsql/client`, which speaks the
 * same SQLite dialect against three backends selected by environment:
 *
 *   - `file:<path>`  — local dev / tests (same file layout as before)
 *   - `:memory:`     — hermetic unit tests
 *   - `libsql://…`   — hosted Turso database (production)
 *
 * The interface deliberately mirrors the old call shapes (`prepare().get()`,
 * `prepare().all()`, `prepare().run()`, `exec()`, `transaction()`) so the
 * conversion is mechanical: add `await`, make the enclosing function async.
 * `prepare()` itself stays synchronous (it only captures SQL); only the
 * statement execution is async.
 *
 * No raw credentials are ever handled here — the auth token comes from
 * `LEASELENS_TURSO_AUTH_TOKEN` via the validated env module.
 */

import {
  type Client,
  createClient,
  type InArgs,
  type Transaction,
} from '@libsql/client';

export interface DbStatement {
  get<T = Record<string, unknown>>(...args: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...args: unknown[]): Promise<T[]>;
  run(
    ...args: unknown[]
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }>;
}

export interface DbTransaction {
  prepare(sql: string): DbStatement;
  exec(script: string): Promise<void>;
}

/**
 * The minimal surface the query helpers need. Satisfied by both the root
 * Db and a DbTransaction, so helpers can run inside a transaction on the
 * tx handle (statements on the pool-level Db would escape the transaction).
 */
export type DbHandle = Pick<Db, 'prepare' | 'exec'>;

export interface Db {
  prepare(sql: string): DbStatement;
  /** Executes a multi-statement SQL script (schema, migrations, PRAGMAs). */
  exec(script: string): Promise<void>;
  /**
   * Runs `fn` inside a transaction, committing on success and rolling back
   * on throw. Replaces better-sqlite3's `db.transaction(() => {...})()`
   * (note: the old form returned a function you then invoked; this one runs
   * directly and returns the promise).
   */
  transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export interface DbClientConfig {
  /** `file:./data/leaselens.db`, `:memory:`, or `libsql://<db>.turso.io`. */
  url: string;
  /** Turso auth token — required for remote `libsql://` URLs. */
  authToken?: string;
}

function toInArgs(args: unknown[]): InArgs {
  // better-sqlite3 accepted the same value space positionally; libSQL's
  // InValue covers string | number | bigint | boolean | null | Uint8Array.
  return args as InArgs;
}

class LibSqlStatement implements DbStatement {
  constructor(
    private readonly executor:
      | Pick<Client, 'execute'>
      | Pick<Transaction, 'execute'>,
    private readonly sql: string,
  ) {}

  private runQuery(args: unknown[]) {
    return this.executor.execute({ sql: this.sql, args: toInArgs(args) });
  }

  async get<T>(...args: unknown[]): Promise<T | undefined> {
    const rs = await this.runQuery(args);
    const row = rs.rows[0];
    return row === undefined ? undefined : (row as unknown as T);
  }

  async all<T>(...args: unknown[]): Promise<T[]> {
    const rs = await this.runQuery(args);
    return rs.rows as unknown as T[];
  }

  async run(
    ...args: unknown[]
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    const rs = await this.runQuery(args);
    return {
      changes: Number(rs.rowsAffected),
      lastInsertRowid:
        rs.lastInsertRowid === undefined ? 0 : rs.lastInsertRowid,
    };
  }
}

class LibSqlTransaction implements DbTransaction {
  constructor(private readonly tx: Transaction) {}

  prepare(sql: string): DbStatement {
    return new LibSqlStatement(this.tx, sql);
  }

  exec(script: string): Promise<void> {
    return this.tx.executeMultiple(script).then(() => undefined);
  }
}

class LibSqlDb implements Db {
  constructor(private readonly client: Client) {}

  prepare(sql: string): DbStatement {
    return new LibSqlStatement(this.client, sql);
  }

  exec(script: string): Promise<void> {
    return this.client.executeMultiple(script).then(() => undefined);
  }

  async transaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    const tx = await this.client.transaction('write');
    try {
      const result = await fn(new LibSqlTransaction(tx));
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // Best-effort: the server may already have closed/aborted the
        // transaction (e.g. a dropped Hrana stream on remote Turso). Never
        // let a failed rollback mask the original error.
      }
      throw err;
    }
  }
}

/**
 * Creates a `Db` for the given config. Construction is synchronous; the
 * connection is established lazily by `@libsql/client` on first use.
 *
 * Local-file pragmas (WAL, busy timeout, FK enforcement) are applied by the
 * init sequence in `index.ts`, not here, so they are awaited before any
 * migration or query runs. Remote Turso databases are server-managed — no
 * pragmas are issued for them.
 */
export function createDbClient(config: DbClientConfig): Db {
  const client = createClient({
    url: config.url,
    authToken: config.authToken,
  });
  return new LibSqlDb(client);
}

/** True for local databases (dev/test `file:` and `:memory:`), false for hosted Turso. */
export function isLocalFileConfig(config: DbClientConfig): boolean {
  return config.url.startsWith('file:') || config.url === ':memory:';
}
