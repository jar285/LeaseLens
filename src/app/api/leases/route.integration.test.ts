// Sprint 13 §3c — POST /api/leases integration tests.
// Uses the real fixture PDF from src/lib/lease/__fixtures__/simple.pdf
// to exercise parsePdf + segmentClauses end-to-end through the route.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newAnonIdentity } from '@/lib/auth/anon-identity';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';
import { POST } from './route';

// Sprint B.15 (#15) — toggle public-anon mode so the fail-closed upload path
// can be exercised. Default (no _TEST_* var) keeps the demo/default fallback
// the existing tests below rely on.
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

const SAMPLE_PDF_BUFFER = readFileSync(
  join(process.cwd(), 'src', 'lib', 'lease', '__fixtures__', 'simple.pdf'),
);
const MALFORMED_PDF_BUFFER = readFileSync(
  join(process.cwd(), 'src', 'lib', 'lease', '__fixtures__', 'malformed.pdf'),
);

function demoUser(role: Role) {
  const u = DEMO_USERS.find((x) => x.role === role);
  if (!u) throw new Error(`No demo user with role ${role}`);
  return u;
}

async function makeUploadRequest(opts: {
  file: ArrayBuffer | null;
  filename?: string;
  contentType?: string;
  conversationId?: string;
  user?: { id: string; role: Role; display_name: string };
}): Promise<NextRequest> {
  const form = new FormData();
  if (opts.file) {
    const blob = new Blob([opts.file], {
      type: opts.contentType ?? 'application/pdf',
    });
    form.append('file', blob, opts.filename ?? 'lease.pdf');
  }
  if (opts.conversationId) {
    form.append('conversationId', opts.conversationId);
  }

  const req = new NextRequest('http://localhost:3000/api/leases', {
    method: 'POST',
    body: form,
  });

  if (opts.user) {
    const token = await encrypt({
      userId: opts.user.id,
      role: opts.user.role,
      displayName: opts.user.display_name,
    });
    req.cookies.set('leaselens_session', token);
  }
  return req;
}

describe('POST /api/leases', () => {
  beforeEach(() => {
    // Hermetic-ish: clear previous run's leases so row counts are
    // deterministic. The integration tests share the dev DB by design
    // (Phase 1.5 carryover), so we scope cleanup to lease tables only.
    db.prepare('DELETE FROM negotiation_emails').run();
    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();
    db.prepare('DELETE FROM rate_limit').run();

    // Re-seed demo users so the route's session lookup resolves.
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const u of DEMO_USERS) {
      insertUser.run(u.id, u.email, toDbRole(u.role), u.display_name, now);
    }
    // Sample workspace must exist for the workspace_id FK / cookie path.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      now,
    );
  });

  afterEach(() => {
    db.prepare('DELETE FROM negotiation_emails').run();
    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();
    db.prepare('DELETE FROM rate_limit').run();
  });

  it('returns 200 with lease_id, page_count, clause_count on a valid PDF upload', async () => {
    const req = await makeUploadRequest({
      file: SAMPLE_PDF_BUFFER.buffer.slice(
        SAMPLE_PDF_BUFFER.byteOffset,
        SAMPLE_PDF_BUFFER.byteOffset + SAMPLE_PDF_BUFFER.byteLength,
      ) as ArrayBuffer,
      user: demoUser('Tenant'),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lease_id: string;
      page_count: number;
      clause_count: number;
    };
    expect(body.lease_id).toBeTypeOf('string');
    expect(body.page_count).toBeGreaterThanOrEqual(1);
    expect(body.clause_count).toBeGreaterThanOrEqual(0);

    const lease = db
      .prepare('SELECT id, uploaded_by, workspace_id FROM leases WHERE id = ?')
      .get(body.lease_id) as
      | { id: string; uploaded_by: string; workspace_id: string }
      | undefined;
    expect(lease).toBeDefined();
    expect(lease?.uploaded_by).toBe(demoUser('Tenant').id);
    expect(lease?.workspace_id).toBe(SAMPLE_WORKSPACE.id);
  });

  it('returns 415 when content-type is not application/pdf', async () => {
    const req = await makeUploadRequest({
      file: new TextEncoder().encode('not a pdf').buffer as ArrayBuffer,
      contentType: 'text/plain',
      user: demoUser('Tenant'),
    });

    const res = await POST(req);
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/pdf|content[\s-]type/i);
  });

  it('returns 413 when the file exceeds LEASELENS_LEASE_MAX_BYTES (default 1 MB)', async () => {
    const oversize = new ArrayBuffer(2 * 1024 * 1024);
    const req = await makeUploadRequest({
      file: oversize,
      user: demoUser('Tenant'),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it('returns 400 when no file is supplied', async () => {
    const req = await makeUploadRequest({
      file: null,
      user: demoUser('Tenant'),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 422 when the PDF cannot be parsed (malformed bytes)', async () => {
    const req = await makeUploadRequest({
      file: MALFORMED_PDF_BUFFER.buffer.slice(
        MALFORMED_PDF_BUFFER.byteOffset,
        MALFORMED_PDF_BUFFER.byteOffset + MALFORMED_PDF_BUFFER.byteLength,
      ) as ArrayBuffer,
      user: demoUser('Tenant'),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/pdf|parse|extract|text/i);
  });

  it("attaches the lease to the caller's user_id (uploaded_by)", async () => {
    const req = await makeUploadRequest({
      file: SAMPLE_PDF_BUFFER.buffer.slice(
        SAMPLE_PDF_BUFFER.byteOffset,
        SAMPLE_PDF_BUFFER.byteOffset + SAMPLE_PDF_BUFFER.byteLength,
      ) as ArrayBuffer,
      user: demoUser('Reviewer'),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lease_id: string };
    const lease = db
      .prepare('SELECT uploaded_by FROM leases WHERE id = ?')
      .get(body.lease_id) as { uploaded_by: string };
    expect(lease.uploaded_by).toBe(demoUser('Reviewer').id);
  });

  it('updates conversations.active_lease_id when a conversationId is supplied', async () => {
    // Seed a conversation owned by the Creator demo user.
    const convId = 'conv-upload-test';
    const user = demoUser('Tenant');
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES (?, ?, ?, 'test', ?)`,
    ).run(convId, user.id, SAMPLE_WORKSPACE.id, Math.floor(Date.now() / 1000));

    const req = await makeUploadRequest({
      file: SAMPLE_PDF_BUFFER.buffer.slice(
        SAMPLE_PDF_BUFFER.byteOffset,
        SAMPLE_PDF_BUFFER.byteOffset + SAMPLE_PDF_BUFFER.byteLength,
      ) as ArrayBuffer,
      conversationId: convId,
      user,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lease_id: string };

    const conv = db
      .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
      .get(convId) as { active_lease_id: string };
    expect(conv.active_lease_id).toBe(body.lease_id);

    // Cleanup
    db.prepare('DELETE FROM conversations WHERE id = ?').run(convId);
  });
});

// Sprint B.15 (#15) — public-anon upload path. A cookieless upload fails closed
// (401, never the seeded Tenant), and a valid anon upload materializes the
// visitor's OWN users row + non-sample expiring workspace so anon lease data
// never lands in the immortal sample workspace.
describe('POST /api/leases — public-anon mode (#15)', () => {
  let priorMode: string | undefined;

  async function makeAnonUpload(opts: {
    userId?: string | null;
    workspaceId?: string | null;
  }): Promise<NextRequest> {
    const form = new FormData();
    const ab = SAMPLE_PDF_BUFFER.buffer.slice(
      SAMPLE_PDF_BUFFER.byteOffset,
      SAMPLE_PDF_BUFFER.byteOffset + SAMPLE_PDF_BUFFER.byteLength,
    ) as ArrayBuffer;
    form.append(
      'file',
      new Blob([ab], { type: 'application/pdf' }),
      'lease.pdf',
    );
    const req = new NextRequest('http://localhost:3000/api/leases', {
      method: 'POST',
      body: form,
    });
    if (opts.userId) {
      req.cookies.set(
        'leaselens_session',
        await encrypt({
          userId: opts.userId,
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

  const WS_NEW = 'ws-post-anon-new-15';
  const WS_EXP = 'ws-post-anon-exp-15';

  beforeEach(() => {
    priorMode = process.env._TEST_PUBLIC_ANON_MODE;
    process.env._TEST_PUBLIC_ANON_MODE = 'true';
  });

  afterEach(() => {
    if (priorMode === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = priorMode;
    for (const id of [WS_NEW, WS_EXP]) {
      db.prepare('DELETE FROM leases WHERE workspace_id = ?').run(id);
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM users WHERE email LIKE ?').run(
      'anon+%@anon.leaselens.local',
    );
  });

  it('401s when there is no session cookie (never the seeded Tenant)', async () => {
    const req = await makeAnonUpload({ userId: null, workspaceId: WS_NEW });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('401s when a session is present but no workspace cookie', async () => {
    const anon = newAnonIdentity();
    const req = await makeAnonUpload({
      userId: anon.userId,
      workspaceId: null,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('401s when the workspace cookie points at the immortal sample workspace', async () => {
    const anon = newAnonIdentity();
    const req = await makeAnonUpload({
      userId: anon.userId,
      workspaceId: SAMPLE_WORKSPACE.id,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('materializes the anon user + non-sample expiring workspace and binds the lease to them', async () => {
    const anon = newAnonIdentity();
    const req = await makeAnonUpload({
      userId: anon.userId,
      workspaceId: WS_NEW,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lease_id: string };

    const lease = db
      .prepare('SELECT uploaded_by, workspace_id FROM leases WHERE id = ?')
      .get(body.lease_id) as { uploaded_by: string; workspace_id: string };
    expect(lease.uploaded_by).toBe(anon.userId);
    expect(lease.workspace_id).toBe(WS_NEW);

    // The user row was materialized (FK) and the workspace is a live,
    // non-sample, expiring one — not the immortal sample.
    const user = db
      .prepare('SELECT id FROM users WHERE id = ?')
      .get(anon.userId);
    expect(user).toBeDefined();
    const ws = getActiveWorkspace(db, WS_NEW);
    expect(ws).not.toBeNull();
    expect(ws?.is_sample).toBe(0);
    expect(ws?.expires_at).toBeTypeOf('number');
  });

  it('re-materializes an expired workspace AFTER the TTL purge so a returning visitor can still upload', async () => {
    // A returning visitor whose per-visitor workspace has aged past the 24h
    // TTL. purgeExpiredWorkspaces (run inside the route before the insert)
    // deletes it; the route must re-create it AFTER the purge, or the insert
    // orphans/FK-fails. Regression for the ordering fix.
    const anon = newAnonIdentity();
    const past = Math.floor(Date.now() / 1000) - 100;
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, 'stale', 'stale', 0, ?, ?)`,
    ).run(WS_EXP, past, past);

    const req = await makeAnonUpload({
      userId: anon.userId,
      workspaceId: WS_EXP,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lease_id: string };

    // Workspace re-materialized with a fresh future expiry, and the lease
    // binds to it (not orphaned into a purged id).
    const ws = getActiveWorkspace(db, WS_EXP);
    expect(ws).not.toBeNull();
    expect(ws?.expires_at ?? 0).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const lease = db
      .prepare('SELECT workspace_id FROM leases WHERE id = ?')
      .get(body.lease_id) as { workspace_id: string };
    expect(lease.workspace_id).toBe(WS_EXP);
  });
});
