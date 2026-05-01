import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { writeAuditRow } from '@/lib/tools/audit-log';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from '@/lib/tools/corpus-tools';
import { ToolRegistry } from '@/lib/tools/registry';
import { POST } from './route';

// Sentinel — flipped on by the throwing-rollback test in beforeEach,
// reset in afterEach. Tests 1-3 use the real createToolRegistry.
const useThrowingRegistry = { value: false };

vi.mock('@/lib/tools/create-registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/tools/create-registry')>();
  return {
    createToolRegistry: (database: import('better-sqlite3').Database) => {
      if (!useThrowingRegistry.value) {
        return actual.createToolRegistry(database);
      }
      // Custom registry: real read-only tools + a fake mutating tool whose
      // compensatingAction always throws. Tests inject an audit row whose
      // tool_name matches this fake.
      const reg = new ToolRegistry(database);
      reg.register(createSearchCorpusTool(database));
      reg.register(createGetDocumentSummaryTool(database));
      reg.register(createListDocumentsTool(database));
      reg.register({
        name: 'throwing_tool',
        description: 'compensating action throws by design',
        inputSchema: { type: 'object', properties: {} },
        roles: 'ALL',
        category: 'system',
        execute: () => ({ result: {}, compensatingActionPayload: {} }),
        compensatingAction: () => {
          throw new Error('forced rollback failure');
        },
      });
      return reg;
    },
  };
});

function demoUser(role: Role) {
  const u = DEMO_USERS.find((x) => x.role === role);
  if (!u) throw new Error(`No demo user with role ${role}`);
  return u;
}
const ADMIN = demoUser('Admin');
const EDITOR = demoUser('Editor');
const CREATOR = demoUser('Creator');
const BASE_URL = 'http://localhost:3000';

async function makeRollbackRequest(
  id: string,
  user?: { id: string; role: Role; display_name: string },
): Promise<NextRequest> {
  const req = new NextRequest(new URL(`/api/audit/${id}/rollback`, BASE_URL), {
    method: 'POST',
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

function paramsArg(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/audit/[id]/rollback', () => {
  beforeEach(() => {
    useThrowingRegistry.value = false;
    db.prepare('DELETE FROM audit_log').run();
    db.prepare('DELETE FROM content_calendar').run();
    db.prepare('DELETE FROM approvals').run();
    db.prepare('DELETE FROM documents').run();
    db.prepare('DELETE FROM chunks').run();

    // Re-seed demo users + the document the schedule_content_item rows
    // refer to.
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const u of DEMO_USERS) {
      insertUser.run(u.id, u.email, u.role, u.display_name, now);
    }
    db.prepare(
      'INSERT INTO documents (id, slug, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('doc-1', 'sqs-launch', 'SQS Launch', 'content', 'hash', now);
  });

  afterEach(() => {
    useThrowingRegistry.value = false;
  });

  function seedScheduledRowAndAudit(actor: { id: string; role: Role }): {
    auditId: string;
    scheduleId: string;
  } {
    const scheduleId = `sched-${Math.random().toString(36).slice(2)}`;
    db.prepare(
      `INSERT INTO content_calendar (id, document_slug, scheduled_for, channel, scheduled_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(scheduleId, 'sqs-launch', 1_700_000_000, 'twitter', actor.id, 0);

    const auditId = writeAuditRow(db, {
      tool_name: 'schedule_content_item',
      context: {
        role: actor.role,
        userId: actor.id,
        conversationId: 'conv-test',
      },
      input: {
        // Audit row's input_json now stores the ISO string the tool received,
        // not the parsed Unix seconds (Sprint 8 amendment — see mutating-tools.ts).
        document_slug: 'sqs-launch',
        scheduled_for: '2023-11-14T22:13:20Z',
        channel: 'twitter',
      },
      output: { schedule_id: scheduleId },
      compensatingActionPayload: { schedule_id: scheduleId },
    });
    return { auditId, scheduleId };
  }

  it("Admin rolls back another user's row → 200 + audit rolled_back + content_calendar row deleted", async () => {
    const { auditId, scheduleId } = seedScheduledRowAndAudit(EDITOR);

    const req = await makeRollbackRequest(auditId, ADMIN);
    const res = await POST(req, paramsArg(auditId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rolled_back: boolean };
    expect(body.rolled_back).toBe(true);

    const audit = db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get(auditId) as { status: string; rolled_back_at: number };
    expect(audit.status).toBe('rolled_back');
    expect(audit.rolled_back_at).toBeGreaterThan(0);

    const calRow = db
      .prepare('SELECT 1 FROM content_calendar WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeUndefined();
  });

  it("Non-admin attempting to roll back another user's row → 403; no state change", async () => {
    const { auditId, scheduleId } = seedScheduledRowAndAudit(EDITOR);

    // Creator cannot roll back Editor's row.
    const req = await makeRollbackRequest(auditId, CREATOR);
    const res = await POST(req, paramsArg(auditId));
    expect(res.status).toBe(403);

    const audit = db
      .prepare('SELECT status FROM audit_log WHERE id = ?')
      .get(auditId) as { status: string };
    expect(audit.status).toBe('executed');

    const calRow = db
      .prepare('SELECT 1 FROM content_calendar WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeDefined();
  });

  it('Idempotent — second rollback returns already_rolled_back without re-running compensating action', async () => {
    const { auditId, scheduleId } = seedScheduledRowAndAudit(EDITOR);

    const first = await POST(
      await makeRollbackRequest(auditId, ADMIN),
      paramsArg(auditId),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { rolled_back?: boolean };
    expect(firstBody.rolled_back).toBe(true);

    const auditAfterFirst = db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get(auditId) as { status: string; rolled_back_at: number };
    const firstTimestamp = auditAfterFirst.rolled_back_at;

    // Second rollback — body says already_rolled_back, no state mutation.
    const second = await POST(
      await makeRollbackRequest(auditId, ADMIN),
      paramsArg(auditId),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      already_rolled_back?: boolean;
      audit_id?: string;
    };
    expect(secondBody.already_rolled_back).toBe(true);
    expect(secondBody.audit_id).toBe(auditId);

    const auditAfterSecond = db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get(auditId) as { status: string; rolled_back_at: number };
    expect(auditAfterSecond.status).toBe('rolled_back');
    // rolled_back_at preserved from the first call (markRolledBack guard).
    expect(auditAfterSecond.rolled_back_at).toBe(firstTimestamp);

    const calRow = db
      .prepare('SELECT 1 FROM content_calendar WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeUndefined();
  });

  it('Compensating action throws → 500, audit row stays executed, rolled_back_at NULL', async () => {
    useThrowingRegistry.value = true;

    // Seed an audit row pointing at the throwing tool.
    const auditId = writeAuditRow(db, {
      tool_name: 'throwing_tool',
      context: { role: 'Admin', userId: ADMIN.id, conversationId: 'c' },
      input: {},
      output: {},
      compensatingActionPayload: {},
    });

    const res = await POST(
      await makeRollbackRequest(auditId, ADMIN),
      paramsArg(auditId),
    );
    expect(res.status).toBe(500);

    const audit = db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get(auditId) as { status: string; rolled_back_at: number | null };
    expect(audit.status).toBe('executed');
    expect(audit.rolled_back_at).toBeNull();
  });
});
