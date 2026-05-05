import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { SCHEMA } from './schema';

describe('migrate', () => {
  it('is a no-op when workspace_id columns already exist (fresh schema)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    // Re-running is idempotent.
    migrate(db);
    const cols = db.prepare(`PRAGMA table_info(documents)`).all() as {
      name: string;
    }[];
    const wsCols = cols.filter((c) => c.name === 'workspace_id');
    expect(wsCols).toHaveLength(1);
  });

  it('adds workspace_id to a pre-Sprint-11 schema (no column initially)', () => {
    const db = new Database(':memory:');
    // Simulate a pre-Sprint-11 stored schema. Note the OLD column-level
    // UNIQUE on documents.slug, which migrate does NOT remove.
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_level TEXT NOT NULL,
        heading TEXT,
        content TEXT NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        tool_name TEXT NOT NULL,
        tool_use_id TEXT,
        actor_user_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        conversation_id TEXT,
        input_json TEXT NOT NULL,
        output_json TEXT NOT NULL,
        compensating_action_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'executed',
        created_at INTEGER NOT NULL,
        rolled_back_at INTEGER
      );
      CREATE TABLE content_calendar (
        id TEXT PRIMARY KEY,
        document_slug TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL,
        channel TEXT NOT NULL,
        scheduled_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        document_slug TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL
      );
    `);

    migrate(db);

    for (const table of [
      'documents',
      'chunks',
      'audit_log',
      'content_calendar',
      'approvals',
      'conversations',
    ]) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
      }[];
      expect(
        cols.some((c) => c.name === 'workspace_id'),
        `${table} should have workspace_id`,
      ).toBe(true);
    }
  });

  it('Round 3 — adds workspace_id to conversations on a pre-Round-3 dev DB, defaulting to sample', () => {
    const db = new Database(':memory:');
    // Simulate a pre-Round-3 dev DB: it already has the Sprint-11
    // workspace_id columns on the original 5 tables (so migrate skips them),
    // but conversations is still pre-Round-3 (no workspace_id).
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, slug TEXT NOT NULL, workspace_id TEXT NOT NULL,
        title TEXT NOT NULL, content TEXT NOT NULL, content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL, chunk_level TEXT NOT NULL, heading TEXT,
        content TEXT NOT NULL, embedding BLOB, embedding_model TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT,
        actor_user_id TEXT NOT NULL, actor_role TEXT NOT NULL,
        conversation_id TEXT, workspace_id TEXT NOT NULL,
        input_json TEXT NOT NULL, output_json TEXT NOT NULL,
        compensating_action_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'executed',
        created_at INTEGER NOT NULL, rolled_back_at INTEGER
      );
      CREATE TABLE content_calendar (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL, workspace_id TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL, channel TEXT NOT NULL,
        scheduled_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL, workspace_id TEXT NOT NULL,
        approved_by TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL
      );
    `);
    db.exec(
      "INSERT INTO users (id, email, role, display_name, created_at) VALUES ('u1', 'u@example.com', 'Creator', 'U', 0)",
    );
    db.exec(
      "INSERT INTO conversations (id, user_id, title, created_at) VALUES ('c1', 'u1', 't', 1)",
    );

    migrate(db);

    const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as {
      name: string;
    }[];
    expect(
      cols.some((c) => c.name === 'workspace_id'),
      'conversations should have workspace_id after migrate',
    ).toBe(true);

    // Existing rows backfill to the sample workspace UUID.
    const existing = db
      .prepare('SELECT workspace_id FROM conversations WHERE id = ?')
      .get('c1') as { workspace_id: string };
    expect(existing.workspace_id).toBe('00000000-0000-0000-0000-000000000010');
  });

  it('Round 3 — migrate is idempotent on the new SCHEMA (workspace_id already present on conversations)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    migrate(db); // second run must not throw
    const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as {
      name: string;
    }[];
    expect(cols.filter((c) => c.name === 'workspace_id')).toHaveLength(1);
  });

  it('Round 4 — a migrated pre-Sprint-11 DB satisfies the same cross-workspace-duplicate-slug invariant as a fresh SCHEMA', () => {
    // The behavior we ACTUALLY want: after migrate() runs against a dev DB
    // that pre-dates Sprint 11, inserting the same slug into two different
    // workspaces must succeed (composite UNIQUE on (slug, workspace_id))
    // and inserting the same slug into the SAME workspace must still fail.
    //
    // The pre-Sprint-11 fixture deliberately includes the column-level
    // UNIQUE on documents.slug — this is what migrate must drop via the
    // SQLite 12-step table rebuild.
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE workspaces (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL,
        is_sample     INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_level TEXT NOT NULL,
        heading TEXT,
        content TEXT NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT,
        actor_user_id TEXT NOT NULL, actor_role TEXT NOT NULL,
        conversation_id TEXT,
        input_json TEXT NOT NULL, output_json TEXT NOT NULL,
        compensating_action_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'executed',
        created_at INTEGER NOT NULL, rolled_back_at INTEGER
      );
      CREATE TABLE content_calendar (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL, channel TEXT NOT NULL,
        scheduled_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        approved_by TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL
      );
      INSERT INTO workspaces (id, name, description, is_sample, created_at)
        VALUES ('ws-a', 'A', 'x', 0, 1);
      INSERT INTO workspaces (id, name, description, is_sample, created_at)
        VALUES ('ws-b', 'B', 'x', 0, 1);
    `);

    migrate(db);

    // Cross-workspace duplicate slug must succeed.
    expect(() =>
      db.exec(
        "INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d1', 'brand-identity', 'ws-a', 't', 'c', 'h', 1)",
      ),
    ).not.toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d2', 'brand-identity', 'ws-b', 't', 'c', 'h', 1)",
      ),
    ).not.toThrow();

    // Same slug in same workspace must still fail (composite UNIQUE intact).
    expect(() =>
      db.exec(
        "INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d3', 'brand-identity', 'ws-a', 't', 'c', 'h', 1)",
      ),
    ).toThrow(/UNIQUE constraint/);
  });

  it('Round 4 — table rebuild preserves existing rows and is idempotent across migrate() calls', () => {
    // A populated dev DB pre-dating Sprint 11. We seed a row BEFORE migrate
    // so we can assert the table-rebuild step preserves it. Then we run
    // migrate twice to assert the rebuild only fires once (idempotent).
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        is_sample INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL, chunk_level TEXT NOT NULL,
        heading TEXT, content TEXT NOT NULL, embedding BLOB,
        embedding_model TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT,
        actor_user_id TEXT NOT NULL, actor_role TEXT NOT NULL,
        conversation_id TEXT, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
        compensating_action_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'executed',
        created_at INTEGER NOT NULL, rolled_back_at INTEGER
      );
      CREATE TABLE content_calendar (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL, channel TEXT NOT NULL,
        scheduled_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        approved_by TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL
      );
      INSERT INTO documents (id, slug, title, content, content_hash, created_at)
        VALUES ('seed', 'brand-identity', 'T', 'C', 'H', 42);
    `);

    migrate(db);

    // Row preserved + workspace_id backfilled to sample.
    const seeded = db
      .prepare(
        'SELECT slug, workspace_id, created_at FROM documents WHERE id = ?',
      )
      .get('seed') as {
      slug: string;
      workspace_id: string;
      created_at: number;
    };
    expect(seeded.slug).toBe('brand-identity');
    expect(seeded.workspace_id).toBe('00000000-0000-0000-0000-000000000010');
    expect(seeded.created_at).toBe(42);

    // Second migrate must be a no-op: rebuild does NOT fire again.
    expect(() => migrate(db)).not.toThrow();
    const afterSecond = db
      .prepare('SELECT COUNT(*) as c FROM documents')
      .get() as { c: number };
    expect(afterSecond.c, 'no row duplication after second migrate').toBe(1);
  });

  it('Round 4 — table rebuild succeeds with foreign_keys=ON and a chunks row referencing documents', () => {
    // Regression guard: SQLite's 12-step rebuild fires FK checks on DROP
    // TABLE for any *referencing* table, even when the new table will
    // re-attach the same IDs. The rebuild helper must turn foreign_keys
    // OFF around the work and restore it after. This test enables FKs
    // explicitly and seeds a chunks row that references a documents row,
    // mirroring the dev-DB shape the operator hit during manual smoke.
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
        is_sample INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES documents(id),
        chunk_index INTEGER NOT NULL, chunk_level TEXT NOT NULL,
        heading TEXT, content TEXT NOT NULL, embedding BLOB,
        embedding_model TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT,
        actor_user_id TEXT NOT NULL, actor_role TEXT NOT NULL,
        conversation_id TEXT, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
        compensating_action_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'executed',
        created_at INTEGER NOT NULL, rolled_back_at INTEGER
      );
      CREATE TABLE content_calendar (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        scheduled_for INTEGER NOT NULL, channel TEXT NOT NULL,
        scheduled_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE approvals (
        id TEXT PRIMARY KEY, document_slug TEXT NOT NULL,
        approved_by TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation',
        created_at INTEGER NOT NULL
      );
      INSERT INTO documents (id, slug, title, content, content_hash, created_at)
        VALUES ('d-existing', 'brand-identity', 'T', 'C', 'H', 1);
      INSERT INTO chunks (id, document_id, chunk_index, chunk_level, content, embedding_model, created_at)
        VALUES ('c-existing', 'd-existing', 0, 'section', 'x', 'm', 1);
    `);
    db.pragma('foreign_keys = ON');

    expect(() => migrate(db)).not.toThrow();

    // FK setting was preserved (back to ON after the rebuild).
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    // Both rows survived; the chunks row still references the rebuilt documents.id.
    const docs = (
      db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }
    ).c;
    const chunks = (
      db.prepare('SELECT COUNT(*) as c FROM chunks').get() as { c: number }
    ).c;
    expect(docs).toBe(1);
    expect(chunks).toBe(1);
  });

  it('cross-workspace duplicate slug succeeds on the new SCHEMA (composite UNIQUE INDEX)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    db.exec(
      "INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES ('ws-a', 'A', 'x', 0, 1)",
    );
    db.exec(
      "INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES ('ws-b', 'B', 'x', 0, 1)",
    );
    db.exec(
      "INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d1', 'brand-identity', 'ws-a', 't', 'c', 'h', 1)",
    );
    db.exec(
      "INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d2', 'brand-identity', 'ws-b', 't', 'c', 'h', 1)",
    );
    const count = (
      db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }
    ).c;
    expect(count).toBe(2);
  });
});
