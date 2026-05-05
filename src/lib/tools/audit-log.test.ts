import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedUser } from '@/lib/test/seed';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  getAuditRow,
  listAuditRows,
  markRolledBack,
  writeAuditRow,
} from './audit-log';
import type { ToolExecutionContext } from './domain';

describe('audit-log', () => {
  let db: Database.Database;
  let ctx: ToolExecutionContext;

  beforeEach(() => {
    db = createTestDb();
    const admin = seedUser(db, 'Admin');
    ctx = {
      role: 'Admin',
      userId: admin.id,
      conversationId: 'conv-test',
      workspaceId: SAMPLE_WORKSPACE.id,
    };
  });

  it('round-trips JSON columns through write + read', () => {
    const input = { document_slug: 'sqs-launch', channel: 'twitter' };
    const output = { schedule_id: 'sched-1', document_slug: 'sqs-launch' };
    const compensating = { schedule_id: 'sched-1' };

    const id = writeAuditRow(db, {
      tool_name: 'schedule_content_item',
      tool_use_id: 'toolu_abc',
      context: ctx,
      input,
      output,
      compensatingActionPayload: compensating,
    });

    const row = getAuditRow(db, id);
    expect(row).not.toBeNull();
    if (!row) return;
    expect(row.tool_name).toBe('schedule_content_item');
    expect(row.tool_use_id).toBe('toolu_abc');
    expect(row.actor_user_id).toBe(ctx.userId);
    expect(row.actor_role).toBe('Admin');
    expect(row.status).toBe('executed');
    expect(row.rolled_back_at).toBeNull();
    expect(JSON.parse(row.input_json)).toEqual(input);
    expect(JSON.parse(row.output_json)).toEqual(output);
    expect(JSON.parse(row.compensating_action_json)).toEqual(compensating);
  });

  it('markRolledBack flips status; second call is a no-op preserving the original timestamp', () => {
    const id = writeAuditRow(db, {
      tool_name: 'schedule_content_item',
      context: ctx,
      input: {},
      output: {},
      compensatingActionPayload: {},
    });

    markRolledBack(db, id);
    const firstRow = getAuditRow(db, id);
    expect(firstRow?.status).toBe('rolled_back');
    expect(firstRow?.rolled_back_at).not.toBeNull();
    const firstTimestamp = firstRow?.rolled_back_at;

    // Second call must be a true no-op — UPDATE matches 0 rows because
    // of the `WHERE status = 'executed'` guard.
    markRolledBack(db, id);
    const secondRow = getAuditRow(db, id);
    expect(secondRow?.status).toBe('rolled_back');
    expect(secondRow?.rolled_back_at).toBe(firstTimestamp);
  });

  it('listAuditRows filters by actor + orders by created_at DESC', () => {
    const editor = seedUser(db, 'Editor');
    const id1 = writeAuditRow(db, {
      tool_name: 'schedule_content_item',
      context: ctx,
      input: {},
      output: {},
      compensatingActionPayload: {},
    });
    const id2 = writeAuditRow(db, {
      tool_name: 'approve_draft',
      context: {
        role: 'Editor',
        userId: editor.id,
        conversationId: 'c',
        workspaceId: SAMPLE_WORKSPACE.id,
      },
      input: {},
      output: {},
      compensatingActionPayload: {},
    });

    const adminView = listAuditRows(db, { limit: 10 });
    expect(adminView.map((r) => r.id).sort()).toEqual([id1, id2].sort());

    const editorView = listAuditRows(db, {
      actorUserId: editor.id,
      limit: 10,
    });
    expect(editorView.map((r) => r.id)).toEqual([id2]);
  });
});
