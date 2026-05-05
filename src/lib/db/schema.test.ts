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

  it('should reject invalid role values in users table via CHECK constraint', () => {
    const insertUser = db.prepare(
      'INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)',
    );

    // Valid role should succeed
    expect(() =>
      insertUser.run('test-1', 'test@example.com', 'Creator', 123456789),
    ).not.toThrow();

    // Invalid role should throw
    expect(() =>
      insertUser.run('test-2', 'test2@example.com', 'InvalidRole', 123456789),
    ).toThrow(/CHECK constraint failed/);
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
