import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from './constants';
import {
  createWorkspace,
  getActiveWorkspace,
  getWorkspace,
  listExpiredWorkspaceIds,
} from './queries';

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

describe('workspace queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedSample(db);
  });

  describe('createWorkspace', () => {
    it('inserts and returns the row with TTL set 24h in the future', () => {
      const before = Math.floor(Date.now() / 1000);
      const ws = createWorkspace(db, { name: 'Acme', description: 'A test brand' });
      expect(ws.name).toBe('Acme');
      expect(ws.description).toBe('A test brand');
      expect(ws.is_sample).toBe(0);
      expect(ws.expires_at).not.toBeNull();
      expect(ws.expires_at).toBeGreaterThanOrEqual(before + 86_400 - 5);
      expect(ws.expires_at).toBeLessThanOrEqual(before + 86_400 + 5);

      const stored = getWorkspace(db, ws.id);
      expect(stored?.id).toBe(ws.id);
    });
  });

  describe('getWorkspace', () => {
    it('returns the row when it exists', () => {
      const sample = getWorkspace(db, SAMPLE_WORKSPACE.id);
      expect(sample?.name).toBe(SAMPLE_WORKSPACE.name);
      expect(sample?.is_sample).toBe(1);
    });

    it('returns null when it does not exist', () => {
      expect(getWorkspace(db, 'no-such-workspace')).toBeNull();
    });
  });

  describe('getActiveWorkspace', () => {
    it('returns null for an expired non-sample workspace (sprint-QA H2)', () => {
      const past = Math.floor(Date.now() / 1000) - 60;
      db.prepare(
        `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('expired-1', 'Expired', 'x', 0, ?, ?)`,
      ).run(past - 86_400, past);
      expect(getActiveWorkspace(db, 'expired-1')).toBeNull();
    });
  });

  describe('listExpiredWorkspaceIds', () => {
    it('returns non-sample workspaces with expires_at in the past, excludes sample', () => {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('expired-1', 'Old', 'x', 0, ?, ?)`,
      ).run(now - 86_400, now - 60);
      db.prepare(
        `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('fresh-1', 'New', 'x', 0, ?, ?)`,
      ).run(now, now + 86_400);

      const expired = listExpiredWorkspaceIds(db);
      expect(expired).toEqual(['expired-1']);
    });
  });
});
