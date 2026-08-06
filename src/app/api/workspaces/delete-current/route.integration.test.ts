// Sprint D.19 (#19) — POST /api/workspaces/delete-current.
//
// "Delete my review now": deletes the CALLER'S OWN cookie workspace (no body,
// no target id — zero impersonation surface). Samples are never deletable
// (403) — the shared demo data is not a visitor's to destroy.
//
// Sprint D.19b — in public mode the 200 response ROTATES the workspace cookie
// to a fresh non-sample id instead of clearing it: the post-delete Mode B→A
// flip is pure client state (no navigation), so middleware never re-mints and
// a bare clear 401'd the visitor's very next upload.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newAnonIdentity } from '@/lib/auth/anon-identity';
import { requireSessionOrAnon } from '@/lib/auth/resolve-session';
import { encrypt } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
} from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { ensureAnonWorkspaceExists } from '@/lib/workspaces/queries';
import { POST } from './route';

// Toggle deployment mode (established pattern; snapshot/restore below — the
// vitest shared-process.env hazard).
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      get LEASELENS_PUBLIC_ANON_MODE() {
        return process.env._TEST_PUBLIC_ANON_MODE === 'true';
      },
      get LEASELENS_DEMO_MODE() {
        return process.env._TEST_DEMO_MODE === 'true';
      },
    },
  };
});

const WS_MINE = 'ws-delete-mine-19';

async function makeRequest(opts: {
  workspaceId?: string;
  session?: { userId: string };
}): Promise<NextRequest> {
  const req = new NextRequest(
    'http://localhost:3000/api/workspaces/delete-current',
    {
      method: 'POST',
    },
  );
  if (opts.session) {
    req.cookies.set(
      'leaselens_session',
      await encrypt({
        userId: opts.session.userId,
        role: 'Tenant',
        displayName: 'Anon',
        anonymous: true,
      }),
    );
  }
  if (opts.workspaceId) {
    req.cookies.set(
      WORKSPACE_COOKIE_NAME,
      await encodeWorkspace({
        workspace_id: opts.workspaceId,
        created_workspace_ids: [],
      }),
    );
  }
  return req;
}

function seedReview(workspaceId: string, userId: string): void {
  const now = Math.floor(Date.now() / 1000);
  ensureAnonWorkspaceExists(db, workspaceId);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, role, display_name, created_at)
     VALUES (?, ?, 'Creator', 'A', ?)`,
  ).run(userId, `anon+${userId}@anon.leaselens.local`, now);
  db.prepare(
    `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES ('lease-19', ?, 'mine.pdf', 'text', 1, ?, ?)`,
  ).run(workspaceId, userId, now);
  db.prepare(
    `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
     VALUES ('clause-19', 'lease-19', ?, 0, 'late_fee', 't', 1, ?)`,
  ).run(workspaceId, now);
  db.prepare(
    `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
     VALUES ('conv-19', ?, ?, 't', ?)`,
  ).run(userId, workspaceId, now);
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES ('msg-19', 'conv-19', 'user', 'is my deposit legal?', ?)`,
  ).run(now);
}

describe('POST /api/workspaces/delete-current (#19)', () => {
  let priorMode: string | undefined;
  const anon = newAnonIdentity();

  beforeEach(() => {
    priorMode = process.env._TEST_PUBLIC_ANON_MODE;
    process.env.LEASELENS_SESSION_SECRET ??=
      'a-very-long-test-secret-that-is-at-least-32-chars';
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM clauses WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM leases WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(WS_MINE);
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, 1, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
    );
  });

  afterEach(() => {
    if (priorMode === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = priorMode;
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM clauses WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM leases WHERE workspace_id = ?').run(WS_MINE);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(WS_MINE);
    db.prepare('DELETE FROM users WHERE id = ?').run(anon.userId);
  });

  it('401s with no workspace cookie (public mode)', async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    const res = await POST(await makeRequest({ session: anon }));
    expect(res.status).toBe(401);
  });

  it('403s when the cookie points at the sample workspace (demo/default mode)', async () => {
    const res = await POST(
      await makeRequest({ workspaceId: SAMPLE_WORKSPACE.id }),
    );
    expect(res.status).toBe(403);
    // The sample survives.
    expect(
      db
        .prepare('SELECT 1 FROM workspaces WHERE id = ?')
        .get(SAMPLE_WORKSPACE.id),
    ).toBeDefined();
  });

  it("deletes the caller's own workspace + all children (public mode)", async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    seedReview(WS_MINE, anon.userId);

    const res = await POST(
      await makeRequest({ workspaceId: WS_MINE, session: anon }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: boolean };
    expect(body.deleted).toBe(true);

    for (const [table, col, id] of [
      ['workspaces', 'id', WS_MINE],
      ['leases', 'id', 'lease-19'],
      ['clauses', 'id', 'clause-19'],
      ['conversations', 'id', 'conv-19'],
      ['messages', 'id', 'msg-19'],
    ]) {
      expect(
        db.prepare(`SELECT 1 FROM ${table} WHERE ${col} = ?`).get(id),
        `${table} row should be deleted`,
      ).toBeUndefined();
    }
  });

  // Sprint D.19b — bare cookie deletion stranded the visitor: the Mode B→A
  // flip after delete is pure client state (no navigation), /api/leases is
  // not a middleware minting route, so the very next upload failed closed
  // with 401 until the visitor happened to reload. The 200 response must
  // instead ROTATE the cookie to a fresh, empty, non-sample workspace id —
  // the same thing middleware would have minted on a navigation.
  it('sD.19b — public mode: rotates the workspace cookie so a follow-up upload passes the auth gate (no 401)', async () => {
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
    seedReview(WS_MINE, anon.userId);

    const res = await POST(
      await makeRequest({ workspaceId: WS_MINE, session: anon }),
    );
    expect(res.status).toBe(200);

    const rotated = res.cookies.get(WORKSPACE_COOKIE_NAME);
    expect(
      rotated?.value,
      'a replacement workspace cookie must be issued',
    ).toBeTruthy();
    expect(rotated?.maxAge ?? 0).toBeGreaterThan(0);

    const payload = await decodeWorkspace(rotated?.value ?? '');
    expect(
      payload,
      'replacement cookie must be a valid signed token',
    ).not.toBeNull();
    expect(payload?.workspace_id).not.toBe(WS_MINE);
    expect(payload?.workspace_id).not.toBe(SAMPLE_WORKSPACE.id);
    expect(payload?.workspace_id).not.toBe(SAMPLE_CLEAN_WORKSPACE.id);

    // The exact gate POST /api/leases runs (write path — the workspace row
    // is materialized by the upload route, so requireActiveWorkspace: false).
    const followUp = new NextRequest('http://localhost:3000/api/leases', {
      method: 'POST',
    });
    followUp.cookies.set(
      'leaselens_session',
      await encrypt({
        userId: anon.userId,
        role: 'Tenant',
        displayName: 'Anon',
        anonymous: true,
      }),
    );
    followUp.cookies.set(WORKSPACE_COOKIE_NAME, rotated?.value ?? '');
    const gate = await requireSessionOrAnon(followUp, db, {
      requireActiveWorkspace: false,
    });
    expect(gate.ok, 'second upload must not 401 after delete').toBe(true);
  });
});
