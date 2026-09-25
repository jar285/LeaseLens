import { describe, expect, it } from 'vitest';
import { createDbClient, type Db } from './client';
import { runMigrations } from './migrations';
import { MIGRATIONS } from './migrations/index';

function freshDb(): Db {
  return createDbClient({ url: ':memory:' });
}

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all<{ name: string }>();
  return rows.map((r) => r.name);
}

describe('runMigrations (#29)', () => {
  it('applies the initial schema to a fresh database', async () => {
    const db = freshDb();
    await runMigrations(db);

    const names = await tableNames(db);
    for (const t of [
      'users',
      'conversations',
      'messages',
      'spend_log',
      'provider_call',
      'rate_limit',
      'quota_counter',
      'workspaces',
      'documents',
      'chunks',
      'audit_log',
      'tool_calls',
      'content_calendar',
      'approvals',
      'leases',
      'clauses',
      'negotiation_emails',
      'schema_migrations',
    ]) {
      expect(names).toContain(t);
    }

    // Workspace-scoped indexes from the old migrate() are part of 0001.
    const indexes = await db
      .prepare(`PRAGMA index_list(documents)`)
      .all<{ name: string }>();
    expect(indexes.map((i) => i.name)).toContain(
      'idx_documents_slug_workspace',
    );

    const recorded = await db
      .prepare('SELECT version FROM schema_migrations')
      .all<{ version: number }>();
    expect(recorded.map((r) => r.version)).toEqual(
      MIGRATIONS.map((m) => m.version),
    );
  });

  it('is idempotent — re-running applies nothing twice', async () => {
    const db = freshDb();
    await runMigrations(db);
    await runMigrations(db);

    const recorded = await db
      .prepare(
        'SELECT version, COUNT(*) AS n FROM schema_migrations GROUP BY version',
      )
      .all<{ version: number; n: number }>();
    for (const r of recorded) {
      expect(r.n).toBe(1);
    }
    // Data written between runs survives.
    await db
      .prepare(
        `INSERT INTO workspaces (id, name, description, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run('ws-1', 'Test', 'desc', 1);
    await runMigrations(db);
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM workspaces')
      .get<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('baseline-marks a pre-existing database without migration history', async () => {
    const db = freshDb();
    // Simulate a pre-#29 dev database: tables exist (built by the old
    // SCHEMA + migrate() boot path), but there is no schema_migrations table.
    await db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE chunks (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
    await db
      .prepare(
        `INSERT INTO chunks (id, workspace_id, content, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run('c-1', 'ws', 'hello', 1);

    await runMigrations(db);

    // All known migrations recorded as applied without re-running DDL…
    const recorded = await db
      .prepare('SELECT version FROM schema_migrations')
      .all<{ version: number }>();
    expect(recorded.map((r) => r.version)).toEqual(
      MIGRATIONS.map((m) => m.version),
    );
    // …and pre-existing data is untouched.
    const row = await db
      .prepare('SELECT content FROM chunks WHERE id = ?')
      .get<{ content: string }>('c-1');
    expect(row?.content).toBe('hello');
  });

  it('enforces foreign keys declared in the schema', async () => {
    const db = freshDb();
    await runMigrations(db);
    // clauses.lease_id REFERENCES leases(id) — an orphan insert must fail.
    await expect(
      db
        .prepare(
          `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('cl-1', 'no-such-lease', 'ws', 0, 'rent', 'text', 1, 1),
    ).rejects.toThrow();
  });
});
