// Sprint 13 §3c — GET /api/leases/[id] integration tests.
// Returns { lease, clauses } after the §2.12 ownership check.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { insertClause, insertLease } from '@/lib/lease/queries';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { GET } from './route';

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
