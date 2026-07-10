// Sprint 13 §3c — GET /api/leases/[id] integration tests.
// Returns { lease, clauses } after the §2.12 ownership check.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureAnonUserExists,
  newAnonIdentity,
} from '@/lib/auth/anon-identity';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { insertClause, insertLease } from '@/lib/lease/queries';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { ensureAnonWorkspaceExists } from '@/lib/workspaces/queries';
import { GET } from './route';

// Sprint B.15 (#15) — toggle public-anon mode so the fail-closed lease-read
// path can be exercised. Default (no _TEST_* var) keeps the demo/default
// fallback that the existing tests below rely on.
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

function demoUser(role: Role) {
  const u = DEMO_USERS.find((x) => x.role === role);
  if (!u) throw new Error(`No demo user with role ${role}`);
  return u;
}

async function makeGetRequest(
  leaseId: string,
  user?: { id: string; role: Role; display_name: string },
): Promise<NextRequest> {
  const req = new NextRequest(`http://localhost:3000/api/leases/${leaseId}`, {
    method: 'GET',
  });
  if (user) {
    const token = await encrypt({
      userId: user.id,
      role: user.role,
      displayName: user.display_name,
    });
    req.cookies.set('leaselens_session', token);
  }
  return req;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/leases/[id]', () => {
  let creatorLeaseId: string;
  let editorLeaseId: string;

  beforeEach(() => {
    db.prepare('DELETE FROM negotiation_emails').run();
    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();

    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const u of DEMO_USERS) {
      insertUser.run(u.id, u.email, toDbRole(u.role), u.display_name, now);
    }
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      now,
    );

    creatorLeaseId = insertLease(db, {
      workspaceId: SAMPLE_WORKSPACE.id,
      filename: 'creator.pdf',
      textExtract: 'creator lease text',
      pageCount: 3,
      uploadedBy: demoUser('Tenant').id,
    });
    insertClause(db, {
      leaseId: creatorLeaseId,
      workspaceId: SAMPLE_WORKSPACE.id,
      clauseIndex: 0,
      clauseType: 'late_fee',
      text: 'late fee text',
      pageNumber: 1,
    });

    editorLeaseId = insertLease(db, {
      workspaceId: SAMPLE_WORKSPACE.id,
      filename: 'editor.pdf',
      textExtract: 'editor lease text',
      pageCount: 5,
      uploadedBy: demoUser('Reviewer').id,
    });
  });

  afterEach(() => {
    db.prepare('DELETE FROM negotiation_emails').run();
    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();
  });

  it('returns 200 with lease + clauses for the owner (Tenant)', async () => {
    const req = await makeGetRequest(creatorLeaseId, demoUser('Tenant'));
    const res = await GET(req, params(creatorLeaseId));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lease: { id: string; filename: string; page_count: number };
      clauses: { clause_type: string }[];
    };
    expect(body.lease.id).toBe(creatorLeaseId);
    expect(body.lease.filename).toBe('creator.pdf');
    expect(body.lease.page_count).toBe(3);
    expect(body.clauses).toHaveLength(1);
    expect(body.clauses[0].clause_type).toBe('late_fee');
  });

  it('returns 403 when a Tenant tries to GET a lease they did not upload (spec §2.12)', async () => {
    const req = await makeGetRequest(editorLeaseId, demoUser('Tenant'));
    const res = await GET(req, params(editorLeaseId));

    expect(res.status).toBe(403);
  });

  it('returns 200 when a Reviewer (Editor) GETs any lease in the workspace (spec §3g)', async () => {
    const req = await makeGetRequest(creatorLeaseId, demoUser('Reviewer'));
    const res = await GET(req, params(creatorLeaseId));

    expect(res.status).toBe(200);
  });

  it('returns 200 when an Admin GETs any lease in the workspace', async () => {
    const req = await makeGetRequest(creatorLeaseId, demoUser('Admin'));
    const res = await GET(req, params(creatorLeaseId));

    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown lease id in the active workspace', async () => {
    const req = await makeGetRequest('no-such-lease', demoUser('Admin'));
    const res = await GET(req, params('no-such-lease'));

    expect(res.status).toBe(404);
  });
});

// Sprint B.15 (#15) — public-anon isolation. Each visitor is a real, isolated
// Tenant (from #14) bound to their OWN expiring workspace, so a cookieless read
// fails closed (401) and one visitor cannot read another's lease. Two layers
// enforce this: getLease is workspace-scoped (cross-workspace → 404) and
// assertLeaseOwnership pins the Tenant to their own uploads (same-workspace,
// wrong owner → 403 — proving anon is a real Tenant with no role bypass).
describe('GET /api/leases/[id] — public-anon isolation (#15)', () => {
  const visitorA = newAnonIdentity();
  const visitorB = newAnonIdentity();
  const WS_A = 'ws-anon-a-15';
  const WS_B = 'ws-anon-b-15';
  let leaseA: string;

  async function makeAnonGetRequest(
    leaseId: string,
    session: { userId: string; role: Role; displayName: string } | null,
    workspaceId: string | null,
  ): Promise<NextRequest> {
    const req = new NextRequest(`http://localhost:3000/api/leases/${leaseId}`, {
      method: 'GET',
    });
    if (session) {
      req.cookies.set(
        'leaselens_session',
        await encrypt({ ...session, anonymous: true }),
      );
    }
    if (workspaceId) {
      req.cookies.set(
        WORKSPACE_COOKIE_NAME,
        await encodeWorkspace({
          workspace_id: workspaceId,
          created_workspace_ids: [],
        }),
      );
    }
    return req;
  }

  let priorMode: string | undefined;

  beforeEach(() => {
    priorMode = process.env._TEST_PUBLIC_ANON_MODE;
    process.env._TEST_PUBLIC_ANON_MODE = 'true';

    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();
    ensureAnonUserExists(db, visitorA.userId);
    ensureAnonUserExists(db, visitorB.userId);
    ensureAnonWorkspaceExists(db, WS_A);
    ensureAnonWorkspaceExists(db, WS_B);

    leaseA = insertLease(db, {
      workspaceId: WS_A,
      filename: 'visitor-a.pdf',
      textExtract: 'visitor A lease',
      pageCount: 2,
      uploadedBy: visitorA.userId,
    });
    insertClause(db, {
      leaseId: leaseA,
      workspaceId: WS_A,
      clauseIndex: 0,
      clauseType: 'late_fee',
      text: 'late fee',
      pageNumber: 1,
    });
  });

  afterEach(() => {
    if (priorMode === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = priorMode;
    db.prepare('DELETE FROM clauses').run();
    db.prepare('DELETE FROM leases').run();
    for (const id of [WS_A, WS_B]) {
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    }
    for (const id of [visitorA.userId, visitorB.userId]) {
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
    }
  });

  it('401s when there is no session cookie (never the seeded Tenant fallback)', async () => {
    const req = await makeAnonGetRequest(leaseA, null, WS_A);
    const res = await GET(req, params(leaseA));
    expect(res.status).toBe(401);
  });

  it('returns 200 for the owner (visitor A) reading their own lease', async () => {
    const req = await makeAnonGetRequest(
      leaseA,
      { userId: visitorA.userId, role: 'Tenant', displayName: 'A' },
      WS_A,
    );
    const res = await GET(req, params(leaseA));
    expect(res.status).toBe(200);
  });

  it('returns 404 when visitor B (own workspace) reads visitor A’s lease id — workspace isolation', async () => {
    const req = await makeAnonGetRequest(
      leaseA,
      { userId: visitorB.userId, role: 'Tenant', displayName: 'B' },
      WS_B,
    );
    const res = await GET(req, params(leaseA));
    expect(res.status).toBe(404);
  });

  it('returns 403 when visitor B presents visitor A’s workspace cookie — ownership isolation', async () => {
    const req = await makeAnonGetRequest(
      leaseA,
      { userId: visitorB.userId, role: 'Tenant', displayName: 'B' },
      WS_A,
    );
    const res = await GET(req, params(leaseA));
    expect(res.status).toBe(403);
  });
});
