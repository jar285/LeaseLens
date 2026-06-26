import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { purgeExpiredWorkspaces, WORKSPACE_SCOPED_TABLES } from './cleanup';
import { SAMPLE_WORKSPACE } from './constants';

function seedSample(db: Database.Database): void {
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    Math.floor(Date.now() / 1000),
  );
}

function insertWorkspace(
  db: Database.Database,
  opts: { id: string; expires_at: number | null; is_sample?: 0 | 1 },
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, 'X', 'x', ?, ?, ?)`,
  ).run(opts.id, opts.is_sample ?? 0, now, opts.expires_at);
}

describe('purgeExpiredWorkspaces', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedSample(db);
  });

  it('returns 0 when no expired workspaces exist', () => {
    expect(purgeExpiredWorkspaces(db)).toEqual({ purged: 0 });
    // Sample still exists.
    const count = (
      db.prepare('SELECT COUNT(*) as c FROM workspaces').get() as { c: number }
    ).c;
    expect(count).toBe(1);
  });

  it('cascades DELETE to chunks/audit_log/content_calendar/approvals/documents/workspaces for an expired non-sample', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(db, { id: 'expired-1', expires_at: past });

    db.prepare(
      `INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at)
       VALUES ('d1', 'brand-identity', 'expired-1', 't', 'c', 'h', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO chunks (id, document_id, workspace_id, chunk_index, chunk_level, heading, content, embedding_model, created_at)
       VALUES ('c1', 'd1', 'expired-1', 0, 'section', NULL, 'x', 'm', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO audit_log (id, tool_name, actor_user_id, actor_role, workspace_id, input_json, output_json, compensating_action_json, created_at)
       VALUES ('a1', 't', 'u', 'Editor', 'expired-1', '{}', '{}', '{}', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at)
       VALUES ('cc1', 'brand-identity', 'expired-1', 1, 'twitter', 'u', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO approvals (id, document_slug, workspace_id, approved_by, notes, created_at)
       VALUES ('ap1', 'brand-identity', 'expired-1', 'u', NULL, 1)`,
    ).run();

    const result = purgeExpiredWorkspaces(db);
    expect(result.purged).toBe(1);

    for (const table of [
      'documents',
      'chunks',
      'audit_log',
      'content_calendar',
      'approvals',
    ]) {
      const remaining = (
        db
          .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE workspace_id = ?`)
          .get('expired-1') as { c: number }
      ).c;
      expect(remaining, `${table} should have 0 rows after purge`).toBe(0);
    }
    // workspaces table uses `id`, not `workspace_id`.
    const workspaceRemaining = (
      db
        .prepare('SELECT COUNT(*) as c FROM workspaces WHERE id = ?')
        .get('expired-1') as { c: number }
    ).c;
    expect(workspaceRemaining).toBe(0);
  });

  it('Sprint A.7a (#7a) — covers EVERY workspace_id-bearing table (coverage guard)', () => {
    // Introspect the live schema for every table that carries a workspace_id
    // column, then assert cleanup handles each — directly via
    // WORKSPACE_SCOPED_TABLES, or (for conversations) via its dedicated
    // statement. This mechanically catches the class of bug #7a fixes: a new
    // workspace_id table that cleanup forgot to purge would fail here.
    const tableNames = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((r) => r.name);

    const withWorkspaceId = tableNames.filter((t) => {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all() as {
        name: string;
      }[];
      return cols.some((c) => c.name === 'workspace_id');
    });

    // `conversations` carries workspace_id but is purged by its own statement
    // (messages cascade off conversation_id, not workspace_id).
    const handled = new Set<string>([
      ...WORKSPACE_SCOPED_TABLES,
      'conversations',
    ]);
    const uncovered = withWorkspaceId.filter((t) => !handled.has(t));
    expect(
      uncovered,
      `cleanup must purge every workspace_id-bearing table; uncovered: ${uncovered.join(', ')}`,
    ).toEqual([]);
  });

  it('NEVER purges the sample workspace', () => {
    purgeExpiredWorkspaces(db);
    const sample = db
      .prepare('SELECT id FROM workspaces WHERE id = ?')
      .get(SAMPLE_WORKSPACE.id);
    expect(sample).toBeDefined();
  });

  it('Round 3 — cascades DELETE through conversations + messages for an expired non-sample', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(db, { id: 'expired-conv', expires_at: past });
    db.prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES ('u1', 'u@example.com', 'Creator', 'U', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES ('conv-1', 'u1', 'expired-conv', 't', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('msg-1', 'conv-1', 'user', 'hi', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('msg-2', 'conv-1', 'assistant', 'hello', 2)`,
    ).run();

    const result = purgeExpiredWorkspaces(db);
    expect(result.purged).toBe(1);

    const convs = (
      db
        .prepare('SELECT COUNT(*) as c FROM conversations WHERE id = ?')
        .get('conv-1') as { c: number }
    ).c;
    expect(convs, 'conversation should be purged').toBe(0);

    const msgs = (
      db
        .prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?')
        .get('conv-1') as { c: number }
    ).c;
    expect(msgs, 'orphaned messages should be purged').toBe(0);
  });

  it('Round 3 — NEVER purges sample workspace conversations or messages', () => {
    db.prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES ('u1', 'u@example.com', 'Creator', 'U', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES ('sample-conv', 'u1', ?, 't', 1)`,
    ).run(SAMPLE_WORKSPACE.id);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('sample-msg', 'sample-conv', 'user', 'hi', 1)`,
    ).run();

    purgeExpiredWorkspaces(db);

    const conv = db
      .prepare('SELECT id FROM conversations WHERE id = ?')
      .get('sample-conv');
    expect(conv).toBeDefined();
    const msg = db
      .prepare('SELECT id FROM messages WHERE id = ?')
      .get('sample-msg');
    expect(msg).toBeDefined();
  });

  it('Sprint 13 — cascades DELETE through negotiation_emails → clauses → leases for an expired non-sample', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(db, { id: 'expired-lease', expires_at: past });
    db.prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES ('u-tenant', 'tenant@example.com', 'Creator', 'T', 0)`,
    ).run();
    // Lease + clauses + an email — the FK chain is leases ← clauses ← negotiation_emails.
    db.prepare(
      `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
       VALUES ('lease-1', 'expired-lease', 'sample.pdf', 'full text', 5, 'u-tenant', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
       VALUES ('clause-1', 'lease-1', 'expired-lease', 0, 'late_fee', 'late fee text', 2, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO negotiation_emails (id, clause_id, workspace_id, tone, subject, body, drafted_by, created_at)
       VALUES ('email-1', 'clause-1', 'expired-lease', 'polite', 's', 'b', 'u-tenant', 1)`,
    ).run();

    const result = purgeExpiredWorkspaces(db);
    expect(result.purged).toBe(1);

    for (const table of ['negotiation_emails', 'clauses', 'leases']) {
      const remaining = (
        db
          .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE workspace_id = ?`)
          .get('expired-lease') as { c: number }
      ).c;
      expect(remaining, `${table} should have 0 rows after purge`).toBe(0);
    }
  });

  it('Sprint A.7a (#7a) — purges tool_calls for an expired non-sample workspace', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(db, { id: 'expired-tc', expires_at: past });
    // A tool_calls row carries actor_user_id + tool I/O metadata — it must not
    // survive the purge of its workspace (orphaned PII; Robert C. Martin:
    // invariants in the data layer).
    db.prepare(
      `INSERT INTO tool_calls (id, tool_name, actor_user_id, actor_role, workspace_id, status, created_at)
       VALUES ('tc-1', 'grade_clause_severity', 'u', 'Creator', 'expired-tc', 'success', 1)`,
    ).run();
    // A sample-workspace tool_calls row must survive (never purged).
    db.prepare(
      `INSERT INTO tool_calls (id, tool_name, actor_user_id, actor_role, workspace_id, status, created_at)
       VALUES ('tc-sample', 'search_corpus', 'u', 'Creator', ?, 'success', 1)`,
    ).run(SAMPLE_WORKSPACE.id);

    expect(purgeExpiredWorkspaces(db).purged).toBe(1);

    const expiredRemaining = (
      db
        .prepare('SELECT COUNT(*) as c FROM tool_calls WHERE workspace_id = ?')
        .get('expired-tc') as { c: number }
    ).c;
    expect(expiredRemaining, 'tool_calls should have 0 rows after purge').toBe(
      0,
    );
    const sampleRemaining = (
      db
        .prepare('SELECT COUNT(*) as c FROM tool_calls WHERE workspace_id = ?')
        .get(SAMPLE_WORKSPACE.id) as { c: number }
    ).c;
    expect(sampleRemaining, 'sample tool_calls must survive').toBe(1);
  });

  it('Sprint 13 — does not violate FK during cascade with leases + clauses + emails present', () => {
    // The cascade order matters: with foreign_keys = ON, deleting leases
    // before clauses (or clauses before negotiation_emails) would throw.
    // Confirm boot-time pragma is on, then run the cascade.
    db.pragma('foreign_keys = ON');

    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(db, { id: 'expired-fk', expires_at: past });
    db.prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES ('u-fk', 'fk@example.com', 'Creator', 'T', 0)`,
    ).run();
    db.prepare(
      `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
       VALUES ('lease-fk', 'expired-fk', 'fk.pdf', 't', 1, 'u-fk', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
       VALUES ('clause-fk', 'lease-fk', 'expired-fk', 0, 'late_fee', 'x', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO negotiation_emails (id, clause_id, workspace_id, tone, subject, body, drafted_by, created_at)
       VALUES ('email-fk', 'clause-fk', 'expired-fk', 'polite', 's', 'b', 'u-fk', 1)`,
    ).run();

    expect(() => purgeExpiredWorkspaces(db)).not.toThrow();
  });
});
