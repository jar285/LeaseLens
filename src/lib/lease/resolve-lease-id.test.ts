// Sprint 13 §3h — three-step lease-id resolution.
//   1. Explicit input.lease_id (workspace-checked)
//   2. conversations.active_lease_id fallback (workspace-checked)
//   3. Opt-in (Phase 10 hotfix F) — most recent lease in workspace
//      uploaded by ctx.userId within the last 30 minutes. On hit, the
//      binding is promoted onto conversations.active_lease_id so
//      subsequent calls in the same conversation take step 2.
//   4. Throw with a message naming the ways to provide it.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/client';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { resolveLeaseId } from './resolve-lease-id';

const OTHER_WS = 'workspace-other';

async function seedWorkspaces(db: Db): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
    )
    .run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      now,
    );
  await db
    .prepare(
      `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, 'Other', 'other', 0, ?)`,
    )
    .run(OTHER_WS, now);
}

async function seedLease(
  db: Db,
  id: string,
  workspaceId: string,
  opts: { uploadedBy?: string; createdAt?: number } = {},
): Promise<void> {
  const uploadedBy = opts.uploadedBy ?? 'u-tenant';
  const createdAt = opts.createdAt ?? 1;
  await db
    .prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
     VALUES (?, ?, 'Creator', 'U', 1) ON CONFLICT(id) DO NOTHING`,
    )
    .run(uploadedBy, `${uploadedBy}-${id}@example.com`);
  await db
    .prepare(
      `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES (?, ?, 'lease.pdf', 'text', 5, ?, ?)`,
    )
    .run(id, workspaceId, uploadedBy, createdAt);
}

async function seedConversation(
  db: Db,
  id: string,
  workspaceId: string,
  activeLeaseId: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
     VALUES (?, ?, 'Creator', 'U', 1) ON CONFLICT(id) DO NOTHING`,
    )
    .run('u-tenant', `u-tenant-${id}@example.com`);
  await db
    .prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at, active_lease_id)
     VALUES (?, 'u-tenant', ?, 't', 1, ?)`,
    )
    .run(id, workspaceId, activeLeaseId);
}

const ctxBase = {
  workspaceId: SAMPLE_WORKSPACE.id,
  conversationId: 'conv-1',
};

describe('resolveLeaseId', () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedWorkspaces(db);
  });

  it('returns the explicit lease_id when set and the lease belongs to ctx.workspaceId', async () => {
    await seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id);
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

    expect(
      await resolveLeaseId(db, { lease_id: 'lease-explicit' }, ctxBase),
    ).toBe('lease-explicit');
  });

  it('throws when the explicit lease_id refers to a non-existent lease', async () => {
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    await expect(
      resolveLeaseId(db, { lease_id: 'lease-missing' }, ctxBase),
    ).rejects.toThrow(/lease/i);
  });

  it('throws when the explicit lease_id belongs to a different workspace', async () => {
    await seedLease(db, 'lease-other', OTHER_WS);
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    await expect(
      resolveLeaseId(db, { lease_id: 'lease-other' }, ctxBase),
    ).rejects.toThrow(/workspace/i);
  });

  it('falls back to conversations.active_lease_id when input has no lease_id', async () => {
    await seedLease(db, 'lease-active', SAMPLE_WORKSPACE.id);
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-active');

    expect(await resolveLeaseId(db, {}, ctxBase)).toBe('lease-active');
  });

  it('explicit lease_id wins over conversation fallback', async () => {
    await seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id);
    await seedLease(db, 'lease-active', SAMPLE_WORKSPACE.id);
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-active');

    expect(
      await resolveLeaseId(db, { lease_id: 'lease-explicit' }, ctxBase),
    ).toBe('lease-explicit');
  });

  it('throws when the conversation row references a missing lease', async () => {
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-missing');
    await expect(resolveLeaseId(db, {}, ctxBase)).rejects.toThrow();
  });

  it('throws when the conversation row references a lease in another workspace', async () => {
    // Edge case: workspace cookie shifted but conversation still points
    // at a lease from the prior workspace. Ownership check must fail.
    await seedLease(db, 'lease-other', OTHER_WS);
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-other');
    await expect(resolveLeaseId(db, {}, ctxBase)).rejects.toThrow(/workspace/i);
  });

  it('throws with a clear "no lease" message when neither input nor conversation provides a lease_id', async () => {
    await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    await expect(resolveLeaseId(db, {}, ctxBase)).rejects.toThrow(/lease/i);
  });

  it('throws when conversationId is missing AND no input.lease_id (MCP case with no upload)', async () => {
    // MCP server context — no conversationId, no input.lease_id. This is
    // the "explicit only" enforcement from spec H5.
    await expect(
      resolveLeaseId(
        db,
        {},
        { workspaceId: SAMPLE_WORKSPACE.id, conversationId: '' },
      ),
    ).rejects.toThrow(/lease/i);
  });

  // -------------------------------------------------------------------
  // Phase 10 hotfix F — opt-in recent-upload fallback (step 3).
  // -------------------------------------------------------------------

  describe('recent-upload fallback (enableRecentLeaseFallback)', () => {
    const NOW = 1_700_000_000; // arbitrary fixed epoch seconds for determinism

    it('returns the most recent lease uploaded by ctx.userId in the workspace within 30 min', async () => {
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60, // 1 min ago
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
        await resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).toBe('lease-recent');
    });

    it('promotes the implicit binding by writing active_lease_id onto the conversation', async () => {
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await resolveLeaseId(
        db,
        {},
        {
          workspaceId: SAMPLE_WORKSPACE.id,
          conversationId: 'conv-1',
          userId: 'u-tenant',
          enableRecentLeaseFallback: true,
          now: NOW,
        },
      );

      const row = await db
        .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
        .get<{ active_lease_id: string | null }>('conv-1');
      expect(row?.active_lease_id).toBe('lease-recent');
    });

    it('returns the newest when multiple recent leases exist for the same user', async () => {
      await seedLease(db, 'lease-old', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 600, // 10 min ago
      });
      await seedLease(db, 'lease-newest', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 30, // 30 sec ago
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
        await resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).toBe('lease-newest');
    });

    it('skips leases uploaded by other users', async () => {
      await seedLease(db, 'lease-other-user', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-someone-else',
        createdAt: NOW - 60,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('skips leases older than the 30-minute window', async () => {
      await seedLease(db, 'lease-stale', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 31 * 60, // 31 min ago — outside window
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('skips leases in other workspaces', async () => {
      await seedLease(db, 'lease-other-ws', OTHER_WS, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('does NOT activate when enableRecentLeaseFallback is omitted (default off / MCP-safe)', async () => {
      // Even with a recent matching lease, the fallback stays off when
      // the caller has not opted in. Spec H5: MCP requires explicit lease_id.
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            now: NOW,
            // enableRecentLeaseFallback intentionally not set
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('does NOT activate when conversationId is missing (MCP synthetic session)', async () => {
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: '',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('does NOT activate when userId is missing', async () => {
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      await expect(
        resolveLeaseId(
          db,
          {},
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            enableRecentLeaseFallback: true,
            now: NOW,
            // userId intentionally not set
          },
        ),
      ).rejects.toThrow(/lease/i);
    });

    it('explicit lease_id and active_lease_id still win over the recent-upload fallback', async () => {
      await seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      await seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 30,
      });
      await seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
        await resolveLeaseId(
          db,
          { lease_id: 'lease-explicit' },
          {
            workspaceId: SAMPLE_WORKSPACE.id,
            conversationId: 'conv-1',
            userId: 'u-tenant',
            enableRecentLeaseFallback: true,
            now: NOW,
          },
        ),
      ).toBe('lease-explicit');
    });
  });
});
