import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { writeAuditRow } from '@/lib/tools/audit-log';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import type { AuditLogEntry } from '@/lib/tools/domain';
import { GET } from './route';

function demoUser(role: Role) {
  const u = DEMO_USERS.find((x) => x.role === role);
  if (!u) throw new Error(`No demo user with role ${role}`);
  return u;
}
const ADMIN = demoUser('Admin');
const EDITOR = demoUser('Editor');
const BASE_URL = 'http://localhost:3000';

async function makeAuditRequest(user?: {
  id: string;
  role: Role;
  display_name: string;
}): Promise<NextRequest> {
  const req = new NextRequest(new URL('/api/audit', BASE_URL), {
    method: 'GET',
  });
  if (user) {
    const token = await encrypt({
      userId: user.id,
      role: user.role,
      displayName: user.display_name,
    });
    req.cookies.set('contentops_session', token);
  }
  return req;
}

function seedAuditRow(
  actorUserId: string,
  actorRole: Role,
  toolName: string,
): string {
  return writeAuditRow(db, {
    tool_name: toolName,
    context: {
      role: actorRole,
      userId: actorUserId,
      conversationId: 'conv-test',
      workspaceId: SAMPLE_WORKSPACE.id,
    },
    input: { foo: 'bar' },
    output: { id: 'x' },
    compensatingActionPayload: { x: 'y' },
  });
}

describe('GET /api/audit', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM audit_log').run();
    // Ensure DEMO_USERS exist (idempotent)
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const u of DEMO_USERS) {
      insertUser.run(u.id, u.email, u.role, u.display_name, now);
    }
  });

  it('Admin session: sees rows from all actors', async () => {
    const adminAuditId = seedAuditRow(ADMIN.id, 'Admin', 'approve_draft');
    const editorAuditId = seedAuditRow(
      EDITOR.id,
      'Editor',
      'schedule_content_item',
    );

    const req = await makeAuditRequest(ADMIN);
    const res = await GET(req);
    const body = (await res.json()) as { entries: AuditLogEntry[] };

    const ids = body.entries.map((e) => e.id).sort();
    expect(ids).toEqual([adminAuditId, editorAuditId].sort());
  });

  it('Editor session: sees only own rows', async () => {
    seedAuditRow(ADMIN.id, 'Admin', 'approve_draft');
    const editorAuditId = seedAuditRow(
      EDITOR.id,
      'Editor',
      'schedule_content_item',
    );

    const req = await makeAuditRequest(EDITOR);
    const res = await GET(req);
    const body = (await res.json()) as { entries: AuditLogEntry[] };

    expect(body.entries.map((e) => e.id)).toEqual([editorAuditId]);
  });

  it('No-cookie request: defaults to Creator demo user → zero rows', async () => {
    seedAuditRow(ADMIN.id, 'Admin', 'approve_draft');
    seedAuditRow(EDITOR.id, 'Editor', 'schedule_content_item');

    const req = await makeAuditRequest(); // no cookie
    const res = await GET(req);
    const body = (await res.json()) as { entries: AuditLogEntry[] };

    expect(body.entries).toEqual([]);
  });
});
