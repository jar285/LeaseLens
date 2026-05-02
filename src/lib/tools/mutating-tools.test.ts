import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { seedDocument, seedUser } from '@/lib/test/seed';
import type { MutationOutcome, ToolExecutionContext } from './domain';
import {
  createApproveDraftTool,
  createScheduleContentItemTool,
} from './mutating-tools';

describe('mutating-tools', () => {
  let db: Database.Database;
  let editorCtx: ToolExecutionContext;
  let adminCtx: ToolExecutionContext;

  beforeEach(() => {
    db = createTestDb();
    const editor = seedUser(db, 'Editor');
    const admin = seedUser(db, 'Admin');
    editorCtx = {
      role: 'Editor',
      userId: editor.id,
      conversationId: 'conv-edit',
    };
    adminCtx = {
      role: 'Admin',
      userId: admin.id,
      conversationId: 'conv-adm',
    };
    seedDocument(db, 'sqs-launch');
  });

  it('schedule_content_item writes a content_calendar row and returns a deletable payload', () => {
    const tool = createScheduleContentItemTool(db);
    const isoTime = '2026-05-02T09:00:00Z';
    const expectedUnix = Math.floor(Date.parse(isoTime) / 1000);

    const outcome = tool.execute(
      {
        document_slug: 'sqs-launch',
        scheduled_for: isoTime,
        channel: 'twitter',
      },
      editorCtx,
    ) as MutationOutcome;

    expect(outcome.result).toMatchObject({
      document_slug: 'sqs-launch',
      // Result echoes the ISO string the caller passed in.
      scheduled_for: isoTime,
      channel: 'twitter',
    });
    expect(
      (outcome.result as { schedule_id: string }).schedule_id,
    ).toBeTruthy();
    expect(outcome.compensatingActionPayload).toEqual({
      schedule_id: (outcome.result as { schedule_id: string }).schedule_id,
    });

    const row = db
      .prepare('SELECT * FROM content_calendar WHERE id = ?')
      .get((outcome.result as { schedule_id: string }).schedule_id) as {
      document_slug: string;
      scheduled_for: number;
      channel: string;
      scheduled_by: string;
    };
    expect(row.document_slug).toBe('sqs-launch');
    // Storage column is INTEGER Unix seconds — parsed from the ISO input.
    expect(row.scheduled_for).toBe(expectedUnix);
    expect(row.channel).toBe('twitter');
    expect(row.scheduled_by).toBe(editorCtx.userId);
  });

  it('schedule_content_item rejects an unknown document_slug — no row written', () => {
    const tool = createScheduleContentItemTool(db);

    expect(() =>
      tool.execute(
        {
          document_slug: 'does-not-exist',
          scheduled_for: '2026-05-02T09:00:00Z',
          channel: 'twitter',
        },
        editorCtx,
      ),
    ).toThrow(/Unknown document_slug/);

    const count = db
      .prepare('SELECT COUNT(*) as n FROM content_calendar')
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('schedule_content_item rejects a non-ISO scheduled_for — no row written, throws before slug check', () => {
    const tool = createScheduleContentItemTool(db);

    expect(() =>
      tool.execute(
        {
          document_slug: 'sqs-launch',
          scheduled_for: 'not-a-date',
          channel: 'twitter',
        },
        editorCtx,
      ),
    ).toThrow(/Invalid scheduled_for/);

    const count = db
      .prepare('SELECT COUNT(*) as n FROM content_calendar')
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('approve_draft writes an approvals row', () => {
    const tool = createApproveDraftTool(db);
    const outcome = tool.execute(
      { document_slug: 'sqs-launch', notes: 'looks good' },
      adminCtx,
    ) as MutationOutcome;

    const row = db
      .prepare('SELECT * FROM approvals WHERE id = ?')
      .get((outcome.result as { approval_id: string }).approval_id) as {
      document_slug: string;
      approved_by: string;
      notes: string | null;
    };
    expect(row.document_slug).toBe('sqs-launch');
    expect(row.approved_by).toBe(adminCtx.userId);
    expect(row.notes).toBe('looks good');
  });

  it('compensating actions are idempotent — re-running on a deleted row is a no-op', () => {
    const tool = createScheduleContentItemTool(db);
    const outcome = tool.execute(
      {
        document_slug: 'sqs-launch',
        scheduled_for: '2026-05-02T09:00:00Z',
        channel: 'twitter',
      },
      editorCtx,
    ) as MutationOutcome;
    const scheduleId = (outcome.result as { schedule_id: string }).schedule_id;
    const rollback = tool.compensatingAction;
    expect(rollback).toBeDefined();
    if (!rollback) {
      throw new Error('Expected schedule_content_item to define rollback');
    }

    // First rollback removes the row.
    rollback(outcome.compensatingActionPayload, editorCtx);
    let count = db
      .prepare('SELECT COUNT(*) as n FROM content_calendar')
      .get() as { n: number };
    expect(count.n).toBe(0);

    // Second rollback on the same payload is a no-op (DELETE matches 0 rows).
    expect(() =>
      rollback(outcome.compensatingActionPayload, editorCtx),
    ).not.toThrow();
    count = db.prepare('SELECT COUNT(*) as n FROM content_calendar').get() as {
      n: number;
    };
    expect(count.n).toBe(0);
    expect(scheduleId).toBeTruthy(); // sanity
  });
});
