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

  // Pre-S13 schema fixture. Has workspace_id columns (post-Round-3) but
  // lacks active_lease_id on conversations and lacks the lease tables.
  // Also includes the minimum tables migrate() touches (documents, chunks,
  // audit_log, content_calendar, approvals, conversations).
  function seedPreS13Schema(db: Database.Database): void {
    db.exec(`
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
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
        title TEXT DEFAULT 'New Conversation', created_at INTEGER NOT NULL
      );
    `);
  }

  it('Sprint 13 — adds active_lease_id column to a pre-S13 conversations table', () => {
    const db = new Database(':memory:');
    seedPreS13Schema(db);

    migrate(db);

    const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as {
      name: string;
      notnull: number;
    }[];
    const activeLease = cols.find((c) => c.name === 'active_lease_id');
    expect(activeLease).toBeDefined();
    expect(activeLease?.notnull).toBe(0);
  });

  it('Sprint 13 — running migrate twice on a pre-S13 DB is idempotent for active_lease_id', () => {
    const db = new Database(':memory:');
    seedPreS13Schema(db);

    migrate(db);
    // Second call must not throw and must not duplicate the column.
    expect(() => migrate(db)).not.toThrow();

    const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as {
      name: string;
    }[];
    const activeLeaseCols = cols.filter((c) => c.name === 'active_lease_id');
    expect(activeLeaseCols).toHaveLength(1);
  });

  it('Sprint 13 — fresh SCHEMA includes active_lease_id; migrate is a no-op on it', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);

    const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as {
      name: string;
    }[];
    expect(cols.some((c) => c.name === 'active_lease_id')).toBe(true);
  });

  // Sprint 45 — clauses gains the full grading (statute_citation / chunk_id /
  // reasoning / recommended_action / graded_at) so the chat reads findings via
  // get_lease_findings without re-running the scan. Pre-Sprint-45 dev DBs have a
  // clauses table with only `severity`.
  const S45_GRADING_COLUMNS = [
    'statute_citation',
    'chunk_id',
    'reasoning',
    'recommended_action',
    'graded_at',
  ];

  function seedPreS45Clauses(db: Database.Database): void {
    seedPreS13Schema(db); // documents/chunks/etc. so migrate's ADD COLUMN loop runs
    db.exec(`
      CREATE TABLE clauses (
        id TEXT PRIMARY KEY, lease_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
        clause_index INTEGER NOT NULL, clause_type TEXT NOT NULL, text TEXT NOT NULL,
        page_number INTEGER NOT NULL, severity TEXT, created_at INTEGER NOT NULL
      );
    `);
  }

  it('Sprint 45 — adds the grading columns to a pre-Sprint-45 clauses table', () => {
    const db = new Database(':memory:');
    seedPreS45Clauses(db);

    migrate(db);

    const cols = db.prepare(`PRAGMA table_info(clauses)`).all() as {
      name: string;
      notnull: number;
    }[];
    for (const name of S45_GRADING_COLUMNS) {
      const col = cols.find((c) => c.name === name);
      expect(col, `expected clauses.${name} to exist`).toBeDefined();
      expect(col?.notnull).toBe(0);
    }
  });

  it('Sprint 45 — migrate is idempotent for the new clauses grading columns', () => {
    const db = new Database(':memory:');
    seedPreS45Clauses(db);

    migrate(db);
    expect(() => migrate(db)).not.toThrow();

    const cols = db.prepare(`PRAGMA table_info(clauses)`).all() as {
      name: string;
    }[];
    for (const name of S45_GRADING_COLUMNS) {
      expect(cols.filter((c) => c.name === name)).toHaveLength(1);
    }
  });

  it('Sprint 45 — fresh SCHEMA includes the clauses grading columns; migrate is a no-op', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);

    const cols = db.prepare(`PRAGMA table_info(clauses)`).all() as {
      name: string;
    }[];
    for (const name of S45_GRADING_COLUMNS) {
      expect(cols.some((c) => c.name === name)).toBe(true);
    }
  });

  it('Sprint 45 — backfills graded_at for pre-Sprint-45 grades (severity set, graded_at NULL)', () => {
    const db = new Database(':memory:');
    seedPreS45Clauses(db); // clauses table WITHOUT graded_at, WITH severity
    const now = Math.floor(Date.now() / 1000);
    // Old-code grade: severity set, no graded_at — should read as graded after backfill.
    db.prepare(
      `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, severity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('c-graded', 'l1', 'w1', 0, 'security_deposit', 'x', 1, 'high', now);
    // Never graded: severity NULL — must stay ungraded.
    db.prepare(
      `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, severity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('c-ungraded', 'l1', 'w1', 1, 'unknown', 'y', 1, null, now);

    migrate(db);

    const graded = db
      .prepare('SELECT graded_at FROM clauses WHERE id = ?')
      .get('c-graded') as { graded_at: number | null };
    const ungraded = db
      .prepare('SELECT graded_at FROM clauses WHERE id = ?')
      .get('c-ungraded') as { graded_at: number | null };
    expect(graded.graded_at).not.toBeNull(); // backfilled → counts as graded
    expect(ungraded.graded_at).toBeNull(); // never graded → stays ungraded

    // Idempotent: a second migrate leaves the backfilled value alone.
    const before = (
      db
        .prepare('SELECT graded_at FROM clauses WHERE id = ?')
        .get('c-graded') as {
        graded_at: number;
      }
    ).graded_at;
    migrate(db);
    const after = (
      db
        .prepare('SELECT graded_at FROM clauses WHERE id = ?')
        .get('c-graded') as {
        graded_at: number;
      }
    ).graded_at;
    expect(after).toBe(before);
  });

  // Sprint D.20 (#20) — FK-adding rebuilds for leases + tool_calls on a
  // legacy-shaped DB. SQLite can't ADD CONSTRAINT, so migrate() rebuilds the
  // two tables (documents-rebuild precedent) guarded by fkExists. The legacy
  // tool_calls here also PRE-DATES error_code, proving the rebuild runs AFTER
  // the ADD COLUMN migrations (the copy needs the modern column set).
  describe('Sprint D.20 — FK rebuild for leases + tool_calls', () => {
    function makeLegacyDb(): InstanceType<typeof Database> {
      const db = new Database(':memory:');
      db.pragma('foreign_keys = ON');
      // migrate() walks documents/chunks/audit_log/content_calendar/approvals/
      // conversations too — the legacy DB must carry the full pre-migration
      // table set (mirrors the Round 4 rebuild test harness above).
      db.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL,
          display_name TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
          is_sample INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          expires_at INTEGER
        );
        CREATE TABLE documents (
          id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL,
          content TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE TABLE chunks (
          id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id),
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
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          title TEXT DEFAULT 'New Conversation',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE leases (
          id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, filename TEXT NOT NULL,
          text_extract TEXT NOT NULL, page_count INTEGER NOT NULL,
          uploaded_by TEXT NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_leases_workspace ON leases(workspace_id);
        CREATE TABLE clauses (
          id TEXT PRIMARY KEY, lease_id TEXT NOT NULL REFERENCES leases(id),
          workspace_id TEXT NOT NULL, clause_index INTEGER NOT NULL,
          clause_type TEXT NOT NULL, text TEXT NOT NULL,
          page_number INTEGER NOT NULL,
          severity TEXT CHECK(severity IN ('high','medium','low','ok')),
          created_at INTEGER NOT NULL
        );
        CREATE TABLE tool_calls (
          id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT,
          actor_user_id TEXT NOT NULL,
          actor_role TEXT NOT NULL CHECK(actor_role IN ('Creator','Editor','Admin')),
          conversation_id TEXT, workspace_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('success','error')) DEFAULT 'success',
          error_message TEXT, latency_ms INTEGER, created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_tool_calls_workspace ON tool_calls(workspace_id, created_at DESC);
        CREATE INDEX idx_tool_calls_tool ON tool_calls(tool_name, created_at DESC);
        INSERT INTO users VALUES ('u1', 'u1@x.local', 'Creator', 'U', 1);
        INSERT INTO workspaces VALUES ('ws1', 'W', 'D', 0, 1, 999999999999);
        INSERT INTO leases VALUES ('l1', 'ws1', 'a.pdf', 'text', 3, 'u1', 42);
        INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
          VALUES ('c1', 'l1', 'ws1', 0, 'late_fee', 't', 1, 42);
        INSERT INTO tool_calls (id, tool_name, actor_user_id, actor_role, workspace_id, created_at)
          VALUES ('t1', 'search_corpus', 'mcp-server', 'Admin', 'ws1', 42);
      `);
      return db;
    }

    function fkList(
      db: InstanceType<typeof Database>,
      table: string,
    ): { table: string; from: string; to: string }[] {
      return db.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
        table: string;
        from: string;
        to: string;
      }[];
    }

    it('adds the three FKs, preserves rows (incl. mcp-server actor), restores the pragma', () => {
      const db = makeLegacyDb();
      migrate(db);

      const leaseFks = fkList(db, 'leases');
      expect(
        leaseFks.find(
          (f) => f.from === 'workspace_id' && f.table === 'workspaces',
        ),
      ).toBeDefined();
      expect(
        leaseFks.find((f) => f.from === 'uploaded_by' && f.table === 'users'),
      ).toBeDefined();
      const tcFks = fkList(db, 'tool_calls');
      expect(
        tcFks.find(
          (f) => f.from === 'workspace_id' && f.table === 'workspaces',
        ),
      ).toBeDefined();
      expect(tcFks.find((f) => f.from === 'actor_user_id')).toBeUndefined();

      // Rows survived the copy — including the synthetic MCP actor.
      const lease = db
        .prepare(
          'SELECT filename, uploaded_by, created_at FROM leases WHERE id = ?',
        )
        .get('l1') as {
        filename: string;
        uploaded_by: string;
        created_at: number;
      };
      expect(lease).toMatchObject({
        filename: 'a.pdf',
        uploaded_by: 'u1',
        created_at: 42,
      });
      const tc = db
        .prepare('SELECT actor_user_id FROM tool_calls WHERE id = ?')
        .get('t1') as { actor_user_id: string };
      expect(tc.actor_user_id).toBe('mcp-server');
      // The clauses → leases chain still resolves after the leases rebuild.
      const clause = db
        .prepare('SELECT lease_id FROM clauses WHERE id = ?')
        .get('c1') as { lease_id: string };
      expect(clause.lease_id).toBe('l1');

      // Pragma restored (the rebuild toggles it OFF around the work).
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      // Indexes recreated on the rebuilt tables.
      const indexNames = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
          )
          .all() as { name: string }[]
      ).map((i) => i.name);
      expect(indexNames).toContain('idx_leases_workspace');
      expect(indexNames).toContain('idx_tool_calls_workspace');
      expect(indexNames).toContain('idx_tool_calls_tool');
      // The pre-error_code legacy shape gained the column BEFORE the rebuild.
      const tcCols = (
        db.prepare('PRAGMA table_info(tool_calls)').all() as { name: string }[]
      ).map((c) => c.name);
      expect(tcCols).toContain('error_code');
    });

    it('is idempotent — the rebuild fires once, re-running migrate is a no-op', () => {
      const db = makeLegacyDb();
      migrate(db);
      expect(() => migrate(db)).not.toThrow();
      expect(
        (db.prepare('SELECT COUNT(*) c FROM leases').get() as { c: number }).c,
      ).toBe(1);
      expect(
        (db.prepare('SELECT COUNT(*) c FROM tool_calls').get() as { c: number })
          .c,
      ).toBe(1);
    });

    it('enforces the new FKs after migration: orphan writes are refused', () => {
      const db = makeLegacyDb();
      migrate(db);
      expect(() =>
        db
          .prepare('INSERT INTO leases VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run('l2', 'no-such-ws', 'b.pdf', 't', 1, 'u1', 43),
      ).toThrow(/FOREIGN KEY/i);
      expect(() =>
        db
          .prepare(
            'INSERT INTO tool_calls (id, tool_name, actor_user_id, actor_role, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run('t2', 'x', 'mcp-server', 'Admin', 'no-such-ws', 43),
      ).toThrow(/FOREIGN KEY/i);
      // A workspace delete with children is refused (bare FK) — the
      // children-first purge order in WORKSPACE_SCOPED_TABLES is load-bearing.
      expect(() =>
        db.prepare('DELETE FROM workspaces WHERE id = ?').run('ws1'),
      ).toThrow(/FOREIGN KEY/i);
    });
  });
});
