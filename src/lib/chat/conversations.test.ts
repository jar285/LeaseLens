import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { getLatestConversationForWorkspace } from './conversations';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const WORKSPACE_A = SAMPLE_WORKSPACE.id;
const WORKSPACE_B = '11111111-1111-1111-1111-111111111111';

// Issue #29 — async: helpers take the async Db and await every statement.

async function seedUser(db: Db) {
  await db
    .prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES (?, 'u@example.com', 'Creator', 'U', 0)`,
    )
    .run(USER_ID);
}

async function seedWorkspaces(db: Db) {
  await db
    .prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, 'Sample', 'x', 1, 0, NULL)`,
    )
    .run(WORKSPACE_A);
  await db
    .prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, 'Other', 'x', 0, 0, NULL)`,
    )
    .run(WORKSPACE_B);
}

async function insertConversation(
  db: Db,
  opts: { id: string; userId: string; workspaceId: string; createdAt: number },
) {
  await db
    .prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES (?, ?, ?, 't', ?)`,
    )
    .run(opts.id, opts.userId, opts.workspaceId, opts.createdAt);
}

describe('getLatestConversationForWorkspace', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedUser(db);
    await seedWorkspaces(db);
  });

  it('returns the most recent conversation for the given (userId, workspaceId)', async () => {
    await insertConversation(db, {
      id: 'old',
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
      createdAt: 100,
    });
    await insertConversation(db, {
      id: 'new',
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
      createdAt: 200,
    });
    const result = await getLatestConversationForWorkspace(db, {
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
    });
    expect(result?.id).toBe('new');
  });

  it('does NOT return a conversation from a different workspace, even if more recent', async () => {
    await insertConversation(db, {
      id: 'mine',
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
      createdAt: 100,
    });
    await insertConversation(db, {
      id: 'foreign',
      userId: USER_ID,
      workspaceId: WORKSPACE_B,
      createdAt: 9999,
    });
    const result = await getLatestConversationForWorkspace(db, {
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
    });
    expect(result?.id).toBe('mine');
  });

  it('returns null when no conversation exists for the (userId, workspaceId) pair', async () => {
    // Seed a conversation in a DIFFERENT workspace — the lookup for
    // (USER_ID, WORKSPACE_A) should still return null.
    await insertConversation(db, {
      id: 'other-workspace',
      userId: USER_ID,
      workspaceId: WORKSPACE_B,
      createdAt: 100,
    });
    const result = await getLatestConversationForWorkspace(db, {
      userId: USER_ID,
      workspaceId: WORKSPACE_A,
    });
    expect(result).toBeNull();
  });

  // Sprint B.14 (#14) — the headline cross-visitor isolation guarantee: two
  // distinct anonymous visitors (each their own userId + own workspace) never
  // see each other's conversation. This is what per-visitor identity buys us.
  it('does NOT leak one anonymous visitor conversation to another visitor', async () => {
    const visitorA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const visitorB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const wsA = 'aaaaaaaa-0000-0000-0000-000000000000';
    const wsB = 'bbbbbbbb-0000-0000-0000-000000000000';
    for (const [uid, wid] of [
      [visitorA, wsA],
      [visitorB, wsB],
    ]) {
      await db
        .prepare(
          `INSERT INTO users (id, email, role, display_name, created_at)
           VALUES (?, ?, 'Creator', 'Anonymous Tenant', 0)`,
        )
        .run(uid, `anon+${uid}@anon.leaselens.local`);
      await db
        .prepare(
          `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
           VALUES (?, 'Your lease review', 'x', 0, 0, ?)`,
        )
        .run(wid, Math.floor(Date.now() / 1000) + 86_400);
      await insertConversation(db, {
        id: `conv-${uid}`,
        userId: uid,
        workspaceId: wid,
        createdAt: 500,
      });
    }

    // Visitor A's lookup returns ONLY A's conversation; B's returns ONLY B's.
    expect(
      (
        await getLatestConversationForWorkspace(db, {
          userId: visitorA,
          workspaceId: wsA,
        })
      )?.id,
    ).toBe(`conv-${visitorA}`);
    expect(
      (
        await getLatestConversationForWorkspace(db, {
          userId: visitorB,
          workspaceId: wsB,
        })
      )?.id,
    ).toBe(`conv-${visitorB}`);
    // A querying with B's workspace (a tampered/mismatched cookie) sees nothing.
    expect(
      await getLatestConversationForWorkspace(db, {
        userId: visitorA,
        workspaceId: wsB,
      }),
    ).toBeNull();
  });
});
