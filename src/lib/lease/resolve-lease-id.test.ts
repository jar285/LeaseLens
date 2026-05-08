// Sprint 13 §3h — three-step lease-id resolution.
//   1. Explicit input.lease_id (workspace-checked)
//   2. conversations.active_lease_id fallback (workspace-checked)
//   3. Opt-in (Phase 10 hotfix F) — most recent lease in workspace
//      uploaded by ctx.userId within the last 30 minutes. On hit, the
//      binding is promoted onto conversations.active_lease_id so
//      subsequent calls in the same conversation take step 2.
//   4. Throw with a message naming the ways to provide it.

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { resolveLeaseId } from './resolve-lease-id';

const OTHER_WS = 'workspace-other';

function seedWorkspaces(db: Database.Database): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    now,
  );
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, 'Other', 'other', 0, ?)`,
  ).run(OTHER_WS, now);
}

function seedLease(
  db: Database.Database,
  id: string,
  workspaceId: string,
  opts: { uploadedBy?: string; createdAt?: number } = {},
): void {
  const uploadedBy = opts.uploadedBy ?? 'u-tenant';
  const createdAt = opts.createdAt ?? 1;
  db.prepare(
    `INSERT INTO users (id, email, role, display_name, created_at)
     VALUES (?, ?, 'Creator', 'U', 1) ON CONFLICT(id) DO NOTHING`,
  ).run(uploadedBy, `${uploadedBy}-${id}@example.com`);
  db.prepare(
    `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES (?, ?, 'lease.pdf', 'text', 5, ?, ?)`,
  ).run(id, workspaceId, uploadedBy, createdAt);
}

function seedConversation(
  db: Database.Database,
  id: string,
  workspaceId: string,
  activeLeaseId: string | null,
): void {
  db.prepare(
    `INSERT INTO users (id, email, role, display_name, created_at)
     VALUES (?, ?, 'Creator', 'U', 1) ON CONFLICT(id) DO NOTHING`,
  ).run('u-tenant', `u-tenant-${id}@example.com`);
  db.prepare(
    `INSERT INTO conversations (id, user_id, workspace_id, title, created_at, active_lease_id)
     VALUES (?, 'u-tenant', ?, 't', 1, ?)`,
  ).run(id, workspaceId, activeLeaseId);
}

const ctxBase = {
  workspaceId: SAMPLE_WORKSPACE.id,
  conversationId: 'conv-1',
};

describe('resolveLeaseId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedWorkspaces(db);
  });

  it('returns the explicit lease_id when set and the lease belongs to ctx.workspaceId', () => {
    seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id);
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

    expect(resolveLeaseId(db, { lease_id: 'lease-explicit' }, ctxBase)).toBe(
      'lease-explicit',
    );
  });

  it('throws when the explicit lease_id refers to a non-existent lease', () => {
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    expect(() =>
      resolveLeaseId(db, { lease_id: 'lease-missing' }, ctxBase),
    ).toThrow(/lease/i);
  });

  it('throws when the explicit lease_id belongs to a different workspace', () => {
    seedLease(db, 'lease-other', OTHER_WS);
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    expect(() =>
      resolveLeaseId(db, { lease_id: 'lease-other' }, ctxBase),
    ).toThrow(/workspace/i);
  });

  it('falls back to conversations.active_lease_id when input has no lease_id', () => {
    seedLease(db, 'lease-active', SAMPLE_WORKSPACE.id);
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-active');

    expect(resolveLeaseId(db, {}, ctxBase)).toBe('lease-active');
  });

  it('explicit lease_id wins over conversation fallback', () => {
    seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id);
    seedLease(db, 'lease-active', SAMPLE_WORKSPACE.id);
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-active');

    expect(resolveLeaseId(db, { lease_id: 'lease-explicit' }, ctxBase)).toBe(
      'lease-explicit',
    );
  });

  it('throws when the conversation row references a missing lease', () => {
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-missing');
    expect(() => resolveLeaseId(db, {}, ctxBase)).toThrow();
  });

  it('throws when the conversation row references a lease in another workspace', () => {
    // Edge case: workspace cookie shifted but conversation still points
    // at a lease from the prior workspace. Ownership check must fail.
    seedLease(db, 'lease-other', OTHER_WS);
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, 'lease-other');
    expect(() => resolveLeaseId(db, {}, ctxBase)).toThrow(/workspace/i);
  });

  it('throws with a clear "no lease" message when neither input nor conversation provides a lease_id', () => {
    seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);
    expect(() => resolveLeaseId(db, {}, ctxBase)).toThrow(/lease/i);
  });

  it('throws when conversationId is missing AND no input.lease_id (MCP case with no upload)', () => {
    // MCP server context — no conversationId, no input.lease_id. This is
    // the "explicit only" enforcement from spec H5.
    expect(() =>
      resolveLeaseId(
        db,
        {},
        { workspaceId: SAMPLE_WORKSPACE.id, conversationId: '' },
      ),
    ).toThrow(/lease/i);
  });

  // -------------------------------------------------------------------
  // Phase 10 hotfix F — opt-in recent-upload fallback (step 3).
  // -------------------------------------------------------------------

  describe('recent-upload fallback (enableRecentLeaseFallback)', () => {
    const NOW = 1_700_000_000; // arbitrary fixed epoch seconds for determinism

    it('returns the most recent lease uploaded by ctx.userId in the workspace within 30 min', () => {
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60, // 1 min ago
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
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
      ).toBe('lease-recent');
    });

    it('promotes the implicit binding by writing active_lease_id onto the conversation', () => {
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

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
      );

      const row = db
        .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
        .get('conv-1') as { active_lease_id: string | null };
      expect(row.active_lease_id).toBe('lease-recent');
    });

    it('returns the newest when multiple recent leases exist for the same user', () => {
      seedLease(db, 'lease-old', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 600, // 10 min ago
      });
      seedLease(db, 'lease-newest', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 30, // 30 sec ago
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
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
      ).toBe('lease-newest');
    });

    it('skips leases uploaded by other users', () => {
      seedLease(db, 'lease-other-user', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-someone-else',
        createdAt: NOW - 60,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('skips leases older than the 30-minute window', () => {
      seedLease(db, 'lease-stale', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 31 * 60, // 31 min ago — outside window
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('skips leases in other workspaces', () => {
      seedLease(db, 'lease-other-ws', OTHER_WS, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('does NOT activate when enableRecentLeaseFallback is omitted (default off / MCP-safe)', () => {
      // Even with a recent matching lease, the fallback stays off when
      // the caller has not opted in. Spec H5: MCP requires explicit lease_id.
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('does NOT activate when conversationId is missing (MCP synthetic session)', () => {
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('does NOT activate when userId is missing', () => {
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(() =>
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
      ).toThrow(/lease/i);
    });

    it('explicit lease_id and active_lease_id still win over the recent-upload fallback', () => {
      seedLease(db, 'lease-explicit', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 60,
      });
      seedLease(db, 'lease-recent', SAMPLE_WORKSPACE.id, {
        uploadedBy: 'u-tenant',
        createdAt: NOW - 30,
      });
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id, null);

      expect(
        resolveLeaseId(
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
