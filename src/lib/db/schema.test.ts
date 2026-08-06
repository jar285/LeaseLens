import { describe, expect, it } from 'vitest';
import { db } from './index';

describe('Database Schema and Configuration', () => {
  it('should have all seven tables with expected columns', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('spend_log');
    expect(tableNames).toContain('rate_limit');
    expect(tableNames).toContain('documents');
    expect(tableNames).toContain('chunks');

    // Check users columns
    const userCols = db.prepare('PRAGMA table_info(users)').all() as {
      name: string;
    }[];
    const userColNames = userCols.map((c) => c.name);
    expect(userColNames).toContain('display_name');
    expect(userColNames).toContain('email');
    expect(userColNames).toContain('role');

    // Check documents columns
    const docCols = db.prepare('PRAGMA table_info(documents)').all() as {
      name: string;
    }[];
    const docColNames = docCols.map((c) => c.name);
    expect(docColNames).toContain('id');
    expect(docColNames).toContain('slug');
    expect(docColNames).toContain('title');
    expect(docColNames).toContain('content');
    expect(docColNames).toContain('content_hash');

    // Check chunks columns
    const chunkCols = db.prepare('PRAGMA table_info(chunks)').all() as {
      name: string;
    }[];
    const chunkColNames = chunkCols.map((c) => c.name);
    expect(chunkColNames).toContain('id');
    expect(chunkColNames).toContain('document_id');
    expect(chunkColNames).toContain('chunk_index');
    expect(chunkColNames).toContain('chunk_level');
    expect(chunkColNames).toContain('heading');
    expect(chunkColNames).toContain('content');
    expect(chunkColNames).toContain('embedding');
  });

  it('should have the LeaseLens tables (leases, clauses, negotiation_emails) — Sprint 13 §3e', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('leases');
    expect(tableNames).toContain('clauses');
    expect(tableNames).toContain('negotiation_emails');

    // leases columns
    const leasesCols = db.prepare('PRAGMA table_info(leases)').all() as {
      name: string;
      notnull: number;
    }[];
    const leaseColNames = leasesCols.map((c) => c.name);
    expect(leaseColNames).toContain('id');
    expect(leaseColNames).toContain('workspace_id');
    expect(leaseColNames).toContain('filename');
    expect(leaseColNames).toContain('text_extract');
    expect(leaseColNames).toContain('page_count');
    expect(leaseColNames).toContain('uploaded_by');
    expect(leaseColNames).toContain('created_at');

    // clauses columns
    const clauseCols = db.prepare('PRAGMA table_info(clauses)').all() as {
      name: string;
    }[];
    const clauseColNames = clauseCols.map((c) => c.name);
    expect(clauseColNames).toContain('id');
    expect(clauseColNames).toContain('lease_id');
    expect(clauseColNames).toContain('workspace_id');
    expect(clauseColNames).toContain('clause_index');
    expect(clauseColNames).toContain('clause_type');
    expect(clauseColNames).toContain('text');
    expect(clauseColNames).toContain('page_number');

    // negotiation_emails columns
    const emailCols = db
      .prepare('PRAGMA table_info(negotiation_emails)')
      .all() as { name: string }[];
    const emailColNames = emailCols.map((c) => c.name);
    expect(emailColNames).toContain('id');
    expect(emailColNames).toContain('clause_id');
    expect(emailColNames).toContain('workspace_id');
    expect(emailColNames).toContain('tone');
    expect(emailColNames).toContain('subject');
    expect(emailColNames).toContain('body');
    expect(emailColNames).toContain('drafted_by');
    expect(emailColNames).toContain('created_at');
  });

  it('should have active_lease_id nullable column on conversations — Sprint 13 §3e', () => {
    const cols = db.prepare('PRAGMA table_info(conversations)').all() as {
      name: string;
      notnull: number;
    }[];
    const activeLease = cols.find((c) => c.name === 'active_lease_id');
    expect(activeLease).toBeDefined();
    // Column is nullable (notnull = 0) so existing conversations without an
    // active lease remain valid.
    expect(activeLease?.notnull).toBe(0);
  });

  it('should expose per-table workspace_id indexes for lease tables — Sprint 13 §3e', () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_leases_workspace');
    expect(indexNames).toContain('idx_clauses_workspace');
    expect(indexNames).toContain('idx_clauses_lease');
    expect(indexNames).toContain('idx_negotiation_emails_workspace');
  });

  it('should enforce FK from clauses.lease_id to leases.id — Sprint 13 §3e', () => {
    const fks = db.prepare('PRAGMA foreign_key_list(clauses)').all() as {
      table: string;
      from: string;
      to: string;
    }[];
    const leaseFk = fks.find(
      (f) => f.from === 'lease_id' && f.table === 'leases',
    );
    expect(leaseFk).toBeDefined();
    expect(leaseFk?.to).toBe('id');
  });

  it('should enforce FK from negotiation_emails.clause_id to clauses.id — Sprint 13 §3e', () => {
    const fks = db
      .prepare('PRAGMA foreign_key_list(negotiation_emails)')
      .all() as { table: string; from: string; to: string }[];
    const clauseFk = fks.find(
      (f) => f.from === 'clause_id' && f.table === 'clauses',
    );
    expect(clauseFk).toBeDefined();
    expect(clauseFk?.to).toBe('id');
  });

  // Sprint D.20 (#20) — FK invariant net on the job-owned tables: orphan
  // lease/tool rows (PII outside the retention sweep) can't be CREATED. All
  // bare (no ON DELETE) — deletion stays the explicit children-first purge
  // (WORKSPACE_SCOPED_TABLES); an out-of-order delete is refused by these.
  it('Sprint D.20 — leases.workspace_id and leases.uploaded_by carry FKs', () => {
    const fks = db.prepare('PRAGMA foreign_key_list(leases)').all() as {
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }[];
    const wsFk = fks.find(
      (f) => f.from === 'workspace_id' && f.table === 'workspaces',
    );
    expect(wsFk).toBeDefined();
    expect(wsFk?.to).toBe('id');
    expect(wsFk?.on_delete).toBe('NO ACTION'); // bare — purge is the mechanism
    const uploaderFk = fks.find(
      (f) => f.from === 'uploaded_by' && f.table === 'users',
    );
    expect(uploaderFk).toBeDefined();
    expect(uploaderFk?.to).toBe('id');
  });

  it('Sprint D.20 — tool_calls.workspace_id carries an FK; actor_user_id deliberately does NOT', () => {
    const fks = db.prepare('PRAGMA foreign_key_list(tool_calls)').all() as {
      table: string;
      from: string;
    }[];
    expect(
      fks.find((f) => f.from === 'workspace_id' && f.table === 'workspaces'),
    ).toBeDefined();
    // Non-goal pin: the MCP server writes the synthetic actor 'mcp-server'
    // (no users row) — an actor FK would reject real production traffic.
    expect(fks.find((f) => f.from === 'actor_user_id')).toBeUndefined();
  });

  it('should reject invalid role values in users table via CHECK constraint', () => {
    // Clean up rows from prior test runs — this test uses the singleton DB
    // so state can accumulate. Hermetic alternative would be in-memory but
    // cleanup is sufficient for this CHECK-constraint assertion.
    db.prepare(
      "DELETE FROM users WHERE id IN ('test-schema-1', 'test-schema-2')",
    ).run();

    const insertUser = db.prepare(
      'INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)',
    );

    // Valid role should succeed
    expect(() =>
      insertUser.run(
        'test-schema-1',
        'test-schema-1@example.com',
        'Creator',
        123456789,
      ),
    ).not.toThrow();

    // Invalid role should throw
    expect(() =>
      insertUser.run(
        'test-schema-2',
        'test-schema-2@example.com',
        'InvalidRole',
        123456789,
      ),
    ).toThrow(/CHECK constraint failed/);

    // Clean up so subsequent test runs are deterministic.
    db.prepare(
      "DELETE FROM users WHERE id IN ('test-schema-1', 'test-schema-2')",
    ).run();
  });

  it('should have journal_mode set to wal in non-demo mode', () => {
    // If it is in demo mode, it should be 'memory' or 'delete' depending on OS,
    // but in tests we might use :memory: which overrides WAL.
    const journalMode = db.pragma('journal_mode', { simple: true });
    if (journalMode !== 'memory') {
      expect(journalMode).toBe('wal');
    } else {
      expect(journalMode).toBe('memory');
    }
  });

  it('should have foreign_keys enforcement enabled at boot', () => {
    // Locked invariant — schema declares REFERENCES clauses that only
    // enforce when the pragma is ON. Don't rely on the library default.
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });
});
