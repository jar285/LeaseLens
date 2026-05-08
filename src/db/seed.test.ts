import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { runSeed } from './seed';

interface SeededUserRow {
  id: string;
  role: 'Creator' | 'Editor' | 'Admin';
  display_name: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  description: string;
  is_sample: number;
}

describe('Database Seed Verification', () => {
  it('should have the three exact stable demo UUIDs after seeding', async () => {
    // Clear and re-seed
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();

    await runSeed(db);

    const users = db
      .prepare('SELECT id, role, display_name FROM users ORDER BY id ASC')
      .all() as SeededUserRow[];

    expect(users).toHaveLength(3);
    // Demo-user display names are content-level identifiers carried over
    // from the ContentOps demo (Sprint 11). They are not role labels —
    // those render via labelFor(role). Renaming to LeaseLens-themed
    // personas is deferred to Phase 10 / Phase 11 polish; the IDs and
    // roles below are the load-bearing assertions.
    expect(users[0].id).toBe('00000000-0000-0000-0000-000000000001');
    expect(users[0].role).toBe('Creator');
    expect(users[1].id).toBe('00000000-0000-0000-0000-000000000002');
    expect(users[1].role).toBe('Editor');
    expect(users[2].id).toBe('00000000-0000-0000-0000-000000000003');
    expect(users[2].role).toBe('Admin');
  });

  it('seeds the LeaseLens NJ Tenant Law sample workspace (Sprint 13 §3d)', async () => {
    await runSeed(db);

    const ws = db
      .prepare(
        'SELECT id, name, description, is_sample FROM workspaces WHERE id = ?',
      )
      .get(SAMPLE_WORKSPACE.id) as WorkspaceRow | undefined;

    expect(ws).toBeDefined();
    expect(ws?.is_sample).toBe(1);
    expect(ws?.name).toBe('LeaseLens — NJ Tenant Law');
    expect(ws?.description).toMatch(/NJ residential lease/i);
  });
});
