import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import type { Db } from '@/lib/db/client';
import { writeAuditRow } from '@/lib/tools/audit-log';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from '@/lib/tools/corpus-tools';
import { ToolRegistry } from '@/lib/tools/registry';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { POST } from './route';

// Sentinel — flipped on by the throwing-rollback test in beforeEach,
// reset in afterEach. Tests 1-3 use the real createToolRegistry.
const useThrowingRegistry = { value: false };

vi.mock('@/lib/tools/create-registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/tools/create-registry')>();
  return {
    // Issue #29 — the registry factory now takes the async Db handle.
    createToolRegistry: (database: Db) => {
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
        execute: async () => ({ result: {}, compensatingActionPayload: {} }),
        compensatingAction: async () => {
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
const EDITOR = demoUser('Reviewer');
const CREATOR = demoUser('Tenant');
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
    req.cookies.set('leaselens_session', token);
  }
  return req;
}

function paramsArg(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/audit/[id]/rollback', () => {
  // Issue #29 — async driver: beforeEach awaits every DB call.
  beforeEach(async () => {
    useThrowingRegistry.value = false;
    await db.prepare('DELETE FROM audit_log').run();
    await db.prepare('DELETE FROM content_calendar').run();
    await db.prepare('DELETE FROM approvals').run();
    await db.prepare('DELETE FROM chunks').run();
    await db.prepare('DELETE FROM documents').run();

    // Re-seed demo users + the document the schedule_content_item rows
    // refer to.
    const insertUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    const now = Math.floor(Date.now() / 1000);
    for (const u of DEMO_USERS) {
      await insertUser.run(
        u.id,
        u.email,
        toDbRole(u.role),
        u.display_name,
        now,
      );
    }
    // Sprint D.20 (#20) — leases.workspace_id now carries an FK; the sample
    // workspace row must exist before the seeded lease below.
    await db
      .prepare(
        `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
         VALUES (?, ?, ?, 1, ?, NULL)`,
      )
      .run(
        SAMPLE_WORKSPACE.id,
        SAMPLE_WORKSPACE.name,
        SAMPLE_WORKSPACE.description,
        now,
      );
    await db
      .prepare(
        'INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'doc-1',
        'sqs-launch',
        SAMPLE_WORKSPACE.id,
        'SQS Launch',
        'content',
        'hash',
        now,
      );

    // Sprint 13 — the audit/rollback path now exercises
    // draft_negotiation_email as the exemplar mutating tool.
    // Seed a parent lease + clause that the audit row will reference.
    await db.prepare('DELETE FROM negotiation_emails').run();
    await db.prepare('DELETE FROM clauses').run();
    await db.prepare('DELETE FROM leases').run();
    await db
      .prepare(
        `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
         VALUES ('lease-rb', ?, 'rb.pdf', 'text', 1, ?, ?)`,
      )
      .run(SAMPLE_WORKSPACE.id, EDITOR.id, now);
    await db
      .prepare(
        `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
         VALUES ('clause-rb', 'lease-rb', ?, 0, 'security_deposit', 'two months rent', 1, ?)`,
      )
      .run(SAMPLE_WORKSPACE.id, now);
  });

  afterEach(() => {
    useThrowingRegistry.value = false;
  });

  /**
   * Seed a negotiation_emails row and a matching audit_log row whose
   * compensating action is a DELETE on the email row. Mirrors the real
   * draft_negotiation_email path (Sprint 13).
   *
   * Issue #29 — async driver: the seeding INSERT and writeAuditRow are
   * awaited.
   */
  async function seedScheduledRowAndAudit(actor: {
    id: string;
    role: Role;
  }): Promise<{ auditId: string; scheduleId: string }> {
    const emailId = `email-${Math.random().toString(36).slice(2)}`;
    await db
      .prepare(
        `INSERT INTO negotiation_emails
           (id, clause_id, workspace_id, tone, subject, body, drafted_by, created_at)
         VALUES (?, 'clause-rb', ?, 'polite', 'subj', 'body', ?, 0)`,
      )
      .run(emailId, SAMPLE_WORKSPACE.id, actor.id);

    const auditId = await writeAuditRow(db, {
      tool_name: 'draft_negotiation_email',
      context: {
        role: actor.role,
        userId: actor.id,
        conversationId: 'conv-test',
        workspaceId: SAMPLE_WORKSPACE.id,
      },
      input: { clause_id: 'clause-rb', tone: 'polite' },
      output: { email_id: emailId },
      compensatingActionPayload: { email_id: emailId },
    });
    return { auditId, scheduleId: emailId };
  }

  it("Admin rolls back another user's row → 200 + audit rolled_back + negotiation_emails row deleted", async () => {
    const { auditId, scheduleId } = await seedScheduledRowAndAudit(EDITOR);

    const req = await makeRollbackRequest(auditId, ADMIN);
    const res = await POST(req, paramsArg(auditId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rolled_back: boolean };
    expect(body.rolled_back).toBe(true);

    const audit = await db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get<{ status: string; rolled_back_at: number }>(auditId);
    expect(audit).toBeDefined();
    expect(audit?.status).toBe('rolled_back');
    expect(audit?.rolled_back_at).toBeGreaterThan(0);

    const calRow = await db
      .prepare('SELECT 1 FROM negotiation_emails WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeUndefined();
  });

  it("Non-admin attempting to roll back another user's row → 403; no state change", async () => {
    const { auditId, scheduleId } = await seedScheduledRowAndAudit(EDITOR);

    // Creator cannot roll back Editor's row.
    const req = await makeRollbackRequest(auditId, CREATOR);
    const res = await POST(req, paramsArg(auditId));
    expect(res.status).toBe(403);

    const audit = await db
      .prepare('SELECT status FROM audit_log WHERE id = ?')
      .get<{ status: string }>(auditId);
    expect(audit?.status).toBe('executed');

    const calRow = await db
      .prepare('SELECT 1 FROM negotiation_emails WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeDefined();
  });

  it('Idempotent — second rollback returns already_rolled_back without re-running compensating action', async () => {
    const { auditId, scheduleId } = await seedScheduledRowAndAudit(EDITOR);

    const first = await POST(
      await makeRollbackRequest(auditId, ADMIN),
      paramsArg(auditId),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { rolled_back?: boolean };
    expect(firstBody.rolled_back).toBe(true);

    const auditAfterFirst = await db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get<{ status: string; rolled_back_at: number }>(auditId);
    const firstTimestamp = auditAfterFirst?.rolled_back_at;

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

    const auditAfterSecond = await db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get<{ status: string; rolled_back_at: number }>(auditId);
    expect(auditAfterSecond?.status).toBe('rolled_back');
    // rolled_back_at preserved from the first call (markRolledBack guard).
    expect(auditAfterSecond?.rolled_back_at).toBe(firstTimestamp);

    const calRow = await db
      .prepare('SELECT 1 FROM negotiation_emails WHERE id = ?')
      .get(scheduleId);
    expect(calRow).toBeUndefined();
  });

  it('Compensating action throws → 500, audit row stays executed, rolled_back_at NULL', async () => {
    useThrowingRegistry.value = true;

    // Seed an audit row pointing at the throwing tool.
    const auditId = await writeAuditRow(db, {
      tool_name: 'throwing_tool',
      context: {
        role: 'Admin',
        userId: ADMIN.id,
        conversationId: 'c',
        workspaceId: SAMPLE_WORKSPACE.id,
      },
      input: {},
      output: {},
      compensatingActionPayload: {},
    });

    const res = await POST(
      await makeRollbackRequest(auditId, ADMIN),
      paramsArg(auditId),
    );
    expect(res.status).toBe(500);

    // Sprint D.12a (#12) — PII regression: the 500 must NOT echo the raw
    // err.message (a compensating-action error can embed draft-email/clause
    // content); the normalized envelope carries a safe canned message + code.
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).not.toContain('forced rollback failure');
    expect(body.code).toBe('INTERNAL');

    const audit = await db
      .prepare('SELECT status, rolled_back_at FROM audit_log WHERE id = ?')
      .get<{ status: string; rolled_back_at: number | null }>(auditId);
    expect(audit?.status).toBe('executed');
    expect(audit?.rolled_back_at).toBeNull();
  });
});
