import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from './constants';
import {
  createWorkspace,
  ensureAnonWorkspaceExists,
  getActiveWorkspace,
  getWorkspace,
  listExpiredWorkspaceIds,
} from './queries';

async function seedSample(db: Db): Promise<void> {
  await db
    .prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
    )
    .run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      Math.floor(Date.now() / 1000),
    );
}

describe('workspace queries', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedSample(db);
  });

  describe('createWorkspace', () => {
    it('inserts and returns the row with TTL set 24h in the future', async () => {
      const before = Math.floor(Date.now() / 1000);
      const ws = await createWorkspace(db, {
        name: 'Acme',
        description: 'A test brand',
      });
      expect(ws.name).toBe('Acme');
      expect(ws.description).toBe('A test brand');
      expect(ws.is_sample).toBe(0);
      expect(ws.expires_at).not.toBeNull();
      expect(ws.expires_at).toBeGreaterThanOrEqual(before + 86_400 - 5);
      expect(ws.expires_at).toBeLessThanOrEqual(before + 86_400 + 5);

      const stored = await getWorkspace(db, ws.id);
      expect(stored?.id).toBe(ws.id);
    });
  });

  describe('ensureAnonWorkspaceExists (#14)', () => {
    it('materializes a non-sample expiring workspace with the given id', async () => {
      const before = Math.floor(Date.now() / 1000);
      const ws = await ensureAnonWorkspaceExists(db, 'anon-ws-1');
      expect(ws.id).toBe('anon-ws-1');
      expect(ws.is_sample).toBe(0);
      expect(ws.expires_at).not.toBeNull();
      expect(ws.expires_at).toBeGreaterThanOrEqual(before + 86_400 - 5);
      // It is active immediately.
      expect((await getActiveWorkspace(db, 'anon-ws-1'))?.id).toBe('anon-ws-1');
    });

    it('is idempotent (does not overwrite or duplicate)', async () => {
      const first = await ensureAnonWorkspaceExists(db, 'anon-ws-2');
      const second = await ensureAnonWorkspaceExists(db, 'anon-ws-2');
      expect(second.created_at).toBe(first.created_at);
      const count = (
        await db
          .prepare('SELECT COUNT(*) as c FROM workspaces WHERE id = ?')
          .get<{ c: number }>('anon-ws-2')
      )?.c;
      expect(count).toBe(1);
    });
  });

  describe('getWorkspace', () => {
    it('returns the row when it exists', async () => {
      const sample = await getWorkspace(db, SAMPLE_WORKSPACE.id);
      expect(sample?.name).toBe(SAMPLE_WORKSPACE.name);
      expect(sample?.is_sample).toBe(1);
    });

    it('returns null when it does not exist', async () => {
      expect(await getWorkspace(db, 'no-such-workspace')).toBeNull();
    });
  });

  describe('getActiveWorkspace', () => {
    it('returns null for an expired non-sample workspace (sprint-QA H2)', async () => {
      const past = Math.floor(Date.now() / 1000) - 60;
      await db
        .prepare(
          `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('expired-1', 'Expired', 'x', 0, ?, ?)`,
        )
        .run(past - 86_400, past);
      expect(await getActiveWorkspace(db, 'expired-1')).toBeNull();
    });
  });

  describe('listExpiredWorkspaceIds', () => {
    it('returns non-sample workspaces with expires_at in the past, excludes sample', async () => {
      const now = Math.floor(Date.now() / 1000);
      await db
        .prepare(
          `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('expired-1', 'Old', 'x', 0, ?, ?)`,
        )
        .run(now - 86_400, now - 60);
      await db
        .prepare(
          `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES ('fresh-1', 'New', 'x', 0, ?, ?)`,
        )
        .run(now, now + 86_400);

      const expired = await listExpiredWorkspaceIds(db);
      expect(expired).toEqual(['expired-1']);
    });
  });
});
