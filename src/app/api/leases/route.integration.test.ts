// Sprint 13 §3c — POST /api/leases integration tests.
// Uses the real fixture PDF from src/lib/lease/__fixtures__/simple.pdf
// to exercise parsePdf + segmentClauses end-to-end through the route.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { POST } from './route';

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
