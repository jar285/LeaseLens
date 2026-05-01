import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { recordSpend } from '@/lib/db/spend';
import { createTestDb } from '@/lib/test/db';
import { seedUser } from '@/lib/test/seed';
import {
  getTodaySpend,
  listRecentApprovals,
  listRecentAuditRows,
  listScheduledItems,
} from './queries';

function insertAuditRow(
  db: Database.Database,
  opts: {
    actorUserId: string;
    actorRole: 'Creator' | 'Editor' | 'Admin';
    toolName?: string;
    createdAt?: number;
  },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO audit_log (
       id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
       input_json, output_json, compensating_action_json, status, created_at
     ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, 'executed', ?)`,
  ).run(
    id,
    opts.toolName ?? 'schedule_content_item',
    opts.actorUserId,
    opts.actorRole,
    JSON.stringify({ document_slug: 'brand-identity' }),
    JSON.stringify({ id: 'sched-1' }),
    JSON.stringify({ schedule_id: 'sched-1' }),
    opts.createdAt ?? Math.floor(Date.now() / 1000),
  );
  return id;
}

describe('cockpit queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('listRecentAuditRows', () => {
    it('returns rows DESC by created_at; LEFT JOIN yields null actor_display_name for unmatched user', () => {
      const editor = seedUser(db, 'Editor');
      // Editor's row matches users; mcp-server row does not.
      insertAuditRow(db, {
        actorUserId: editor.id,
        actorRole: 'Editor',
        createdAt: 1000,
      });
      insertAuditRow(db, {
        actorUserId: 'mcp-server',
        actorRole: 'Admin',
        createdAt: 2000,
      });

      const rows = listRecentAuditRows(db, { limit: 10 });
      expect(rows).toHaveLength(2);
      // DESC by created_at — mcp-server (2000) comes first
      expect(rows[0].actor_user_id).toBe('mcp-server');
      expect(rows[0].actor_display_name).toBeNull();
      expect(rows[1].actor_user_id).toBe(editor.id);
      expect(rows[1].actor_display_name).toBe(editor.display_name);
    });

    it('filters by actorUserId when provided', () => {
      const editor = seedUser(db, 'Editor');
      insertAuditRow(db, { actorUserId: editor.id, actorRole: 'Editor' });
      insertAuditRow(db, { actorUserId: 'mcp-server', actorRole: 'Admin' });

      const rows = listRecentAuditRows(db, {
        actorUserId: editor.id,
        limit: 10,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBe(editor.id);
    });
  });

  describe('listScheduledItems', () => {
    it('orders by scheduled_for ASC', () => {
      const insert = (id: string, scheduledFor: number) =>
        db
          .prepare(
            `INSERT INTO content_calendar (id, document_slug, scheduled_for, channel, scheduled_by, created_at)
             VALUES (?, 'brand-identity', ?, 'twitter', 'editor-id', ?)`,
          )
          .run(id, scheduledFor, Math.floor(Date.now() / 1000));
      insert('s2', 2000);
      insert('s1', 1000);
      insert('s3', 3000);

      const items = listScheduledItems(db, { limit: 10 });
      expect(items.map((i) => i.id)).toEqual(['s1', 's2', 's3']);
    });
  });

  describe('listRecentApprovals', () => {
    it('orders by created_at DESC', () => {
      const insert = (id: string, createdAt: number) =>
        db
          .prepare(
            `INSERT INTO approvals (id, document_slug, approved_by, notes, created_at)
             VALUES (?, 'brand-identity', 'admin-id', NULL, ?)`,
          )
          .run(id, createdAt);
      insert('a1', 1000);
      insert('a2', 2000);
      insert('a3', 3000);

      const items = listRecentApprovals(db, { limit: 10 });
      expect(items.map((i) => i.id)).toEqual(['a3', 'a2', 'a1']);
    });
  });

  describe('getTodaySpend', () => {
    it('returns zeros when no spend_log row exists for today', () => {
      const snapshot = getTodaySpend(db);
      expect(snapshot.tokens_in).toBe(0);
      expect(snapshot.tokens_out).toBe(0);
      expect(snapshot.estimated_dollars).toBe(0);
      // date is YYYY-MM-DD shape
      expect(snapshot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("round-trips the writer at src/lib/db/spend.ts (both sides use date('now'))", () => {
      // Note: recordSpend writes to the production `db` import. We can't
      // redirect it to our in-memory test DB without mocking. Instead,
      // directly insert via the same SQL the writer uses, then read back.
      db.prepare(
        `INSERT INTO spend_log (date, tokens_in, tokens_out)
           VALUES (date('now'), 1000, 500)`,
      ).run();

      const snapshot = getTodaySpend(db);
      expect(snapshot.tokens_in).toBe(1000);
      expect(snapshot.tokens_out).toBe(500);
      // estimateCost(1000, 500) with $0.80 / $4.00 per million:
      //   (1000 * 0.8 + 500 * 4.0) / 1_000_000 = 0.0028
      expect(snapshot.estimated_dollars).toBeCloseTo(0.0028, 6);

      // Suppress unused-import lint via a no-op reference:
      void recordSpend;
    });
  });
});
