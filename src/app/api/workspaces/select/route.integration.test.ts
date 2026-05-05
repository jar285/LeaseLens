import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { POST } from './route';

const A_ID = '00000000-0000-0000-0000-aaaaaaaaaaaa';
const B_ID = '00000000-0000-0000-0000-bbbbbbbbbbbb';
const EXPIRED_ID = '00000000-0000-0000-0000-eeeeeeeeeeee';

function makeRequest(body: unknown, cookie?: string): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/workspaces/select', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (cookie) req.cookies.set(WORKSPACE_COOKIE_NAME, cookie);
  return req;
}

function insertWorkspace(id: string, expires_at: number | null): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(id, `Brand ${id.slice(-4)}`, 'test brand', now, expires_at);
}

describe('POST /api/workspaces/select', () => {
  beforeEach(() => {
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    db.prepare('DELETE FROM workspaces WHERE is_sample = 0').run();
    const future = Math.floor(Date.now() / 1000) + 86_400;
    const past = Math.floor(Date.now() / 1000) - 60;
    insertWorkspace(A_ID, future);
    insertWorkspace(B_ID, future);
    insertWorkspace(EXPIRED_ID, past);
  });

  afterEach(() => {
    db.prepare('DELETE FROM workspaces WHERE is_sample = 0').run();
  });

  it('switches active workspace when target id is in created list and active', async () => {
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID, B_ID],
    });
    const res = await POST(makeRequest({ workspace_id: B_ID }, cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspace_id: string };
    expect(body.workspace_id).toBe(B_ID);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');
  });

  it('refuses with 403 when target id is not in the visitor created list', async () => {
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID],
    });
    const res = await POST(makeRequest({ workspace_id: B_ID }, cookie));
    expect(res.status).toBe(403);
  });

  it('returns 404 when target workspace is expired', async () => {
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID, EXPIRED_ID],
    });
    const res = await POST(makeRequest({ workspace_id: EXPIRED_ID }, cookie));
    expect(res.status).toBe(404);
  });

  it('returns 404 when target workspace does not exist', async () => {
    const ghostId = '00000000-0000-0000-0000-deadbeefffff';
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID, ghostId],
    });
    const res = await POST(makeRequest({ workspace_id: ghostId }, cookie));
    expect(res.status).toBe(404);
  });

  it('refuses sample workspace via this route (use /select-sample)', async () => {
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID],
    });
    const res = await POST(
      makeRequest({ workspace_id: SAMPLE_WORKSPACE.id }, cookie),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when no workspace cookie is present', async () => {
    const res = await POST(makeRequest({ workspace_id: A_ID }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on missing or malformed body', async () => {
    const cookie = await encodeWorkspace({
      workspace_id: A_ID,
      created_workspace_ids: [A_ID],
    });
    const res = await POST(makeRequest({}, cookie));
    expect(res.status).toBe(400);
  });
});
