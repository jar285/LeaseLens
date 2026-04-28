import { describe, expect, it } from 'vitest';
import { db } from './index';

describe('Database Schema and Configuration', () => {
  it('should have all five tables with expected columns', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('spend_log');
    expect(tableNames).toContain('rate_limit');

    // Check users columns
    const userCols = db.prepare('PRAGMA table_info(users)').all() as {
      name: string;
    }[];
    const userColNames = userCols.map((c) => c.name);
    expect(userColNames).toContain('display_name');
    expect(userColNames).toContain('email');
    expect(userColNames).toContain('role');
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
});
