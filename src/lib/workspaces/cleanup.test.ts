import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { purgeExpiredWorkspaces } from './cleanup';
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
});
