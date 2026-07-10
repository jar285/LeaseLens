// Sprint B.14 (#14) — per-visitor anonymous identity. Each mint is a distinct
// isolated identity; the materialized row satisfies the conversations FK.

import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import {
  ANON_DISPLAY_NAME,
  ensureAnonUserExists,
  newAnonIdentity,
} from './anon-identity';

describe('newAnonIdentity', () => {
  it('mints a distinct UUID identity per call, role Tenant, anonymous true', () => {
    const a = newAnonIdentity();
    const b = newAnonIdentity();
    expect(a.userId).not.toBe(b.userId);
    expect(a.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(a.role).toBe('Tenant');
    expect(a.anonymous).toBe(true);
    expect(a.displayName).toBe(ANON_DISPLAY_NAME);
  });
});

describe('ensureAnonUserExists', () => {
  it('materializes a users row with the DB role literal, idempotently', () => {
    const db = createTestDb();
    const { userId } = newAnonIdentity();

    ensureAnonUserExists(db, userId);
    ensureAnonUserExists(db, userId); // idempotent — must not throw or dup

    const rows = db
      .prepare('SELECT id, role, email FROM users WHERE id = ?')
      .all(userId) as { id: string; role: string; email: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('Creator'); // Tenant → DB literal
    expect(rows[0].email).toContain(userId);
  });

  it('satisfies the conversations.user_id foreign key', () => {
    const db = createTestDb();
    db.pragma('foreign_keys = ON');
    const { userId } = newAnonIdentity();
    ensureAnonUserExists(db, userId);

    // Would throw FOREIGN KEY constraint failed if the row were missing.
    expect(() =>
      db
        .prepare(
          `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
           VALUES ('conv-anon', ?, 'ws-anon', 't', 1)`,
        )
        .run(userId),
    ).not.toThrow();
  });
});
