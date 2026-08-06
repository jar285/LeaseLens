import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { toDbRole } from '@/lib/auth/role-codec';
import { recordSpend } from '@/lib/db/spend';
import { createTestDb } from '@/lib/test/db';
import { seedUser } from '@/lib/test/seed';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  getLeasePipelineStats,
  getSeverityDistribution,
  getTodaySpend,
  listPerToolStats,
  listRecentApprovals,
  listRecentAuditRows,
  listScheduledItems,
} from './queries';

function insertAuditRow(
  db: Database.Database,
  opts: {
    actorUserId: string;
    actorRole: 'Tenant' | 'Reviewer' | 'Admin';
    toolName?: string;
    createdAt?: number;
    workspaceId?: string;
  },
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO audit_log (
       id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
       workspace_id,
       input_json, output_json, compensating_action_json, status, created_at
     ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, 'executed', ?)`,
  ).run(
    id,
    opts.toolName ?? 'schedule_content_item',
    opts.actorUserId,
    toDbRole(opts.actorRole),
    opts.workspaceId ?? SAMPLE_WORKSPACE.id,
    JSON.stringify({ document_slug: 'brand-identity' }),
    JSON.stringify({ id: 'sched-1' }),
    JSON.stringify({ schedule_id: 'sched-1' }),
    opts.createdAt ?? Math.floor(Date.now() / 1000),
  );
  return id;
}

/**
 * Sprint D.20 (#20) — tool_calls.workspace_id + leases.workspace_id/
 * uploaded_by now carry FKs, so parents must exist before children.
 * Idempotent; called by the insert helpers so every call site is covered.
 */
function seedParents(db: Database.Database, workspaceId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at)
     VALUES (?, 'W', 'test workspace', 1, 1)`,
  ).run(workspaceId);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, role, display_name, created_at)
     VALUES ('u', 'u@test.local', 'Creator', 'U', 1)`,
  ).run();
}

/**
 * Sprint 24.5 — insert a row into the new `tool_calls` table. Used by
 * tests for `listPerToolStats` and `listRecentToolCalls` which read
 * from this table instead of `audit_log`.
 */
function insertToolCall(
  db: Database.Database,
  opts: {
    actorUserId: string;
    actorRole: 'Tenant' | 'Reviewer' | 'Admin';
    toolName?: string;
    createdAt?: number;
    workspaceId?: string;
    status?: 'success' | 'error';
    toolUseId?: string | null;
    latencyMs?: number;
  },
): string {
  const id = randomUUID();
  seedParents(db, opts.workspaceId ?? SAMPLE_WORKSPACE.id);
  db.prepare(
    `INSERT INTO tool_calls (
       id, tool_name, tool_use_id, actor_user_id, actor_role,
       conversation_id, workspace_id, status, error_message,
       latency_ms, created_at
     ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    opts.toolName ?? 'grade_clause_severity',
    opts.toolUseId ?? null,
    opts.actorUserId,
    toDbRole(opts.actorRole),
    opts.workspaceId ?? SAMPLE_WORKSPACE.id,
    opts.status ?? 'success',
    opts.latencyMs ?? 100,
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
      const editor = seedUser(db, 'Reviewer');
      // Editor's row matches users; mcp-server row does not.
      insertAuditRow(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        createdAt: 1000,
      });
      insertAuditRow(db, {
        actorUserId: 'mcp-server',
        actorRole: 'Admin',
        createdAt: 2000,
      });

      const rows = listRecentAuditRows(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        limit: 10,
      });
      expect(rows).toHaveLength(2);
      // DESC by created_at — mcp-server (2000) comes first
      expect(rows[0].actor_user_id).toBe('mcp-server');
      expect(rows[0].actor_display_name).toBeNull();
      expect(rows[1].actor_user_id).toBe(editor.id);
      expect(rows[1].actor_display_name).toBe(editor.display_name);
    });

    it('filters by actorUserId when provided', () => {
      const editor = seedUser(db, 'Reviewer');
      insertAuditRow(db, { actorUserId: editor.id, actorRole: 'Reviewer' });
      insertAuditRow(db, { actorUserId: 'mcp-server', actorRole: 'Admin' });

      const rows = listRecentAuditRows(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        actorUserId: editor.id,
        limit: 10,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBe(editor.id);
    });

    it('cross-workspace isolation: Sprint 11 / sprint-QA M1', () => {
      const editor = seedUser(db, 'Reviewer');
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      insertAuditRow(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        workspaceId: wsA,
      });
      insertAuditRow(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        workspaceId: wsB,
      });

      const rowsA = listRecentAuditRows(db, { workspaceId: wsA, limit: 10 });
      expect(rowsA).toHaveLength(1);
      const rowsB = listRecentAuditRows(db, { workspaceId: wsB, limit: 10 });
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0].id).not.toBe(rowsB[0].id);
    });
  });

  describe('listScheduledItems', () => {
    it('orders by scheduled_for ASC', () => {
      const insert = (id: string, scheduledFor: number) =>
        db
          .prepare(
            `INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at)
             VALUES (?, 'brand-identity', ?, ?, 'twitter', 'editor-id', ?)`,
          )
          .run(
            id,
            SAMPLE_WORKSPACE.id,
            scheduledFor,
            Math.floor(Date.now() / 1000),
          );
      insert('s2', 2000);
      insert('s1', 1000);
      insert('s3', 3000);

      const items = listScheduledItems(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        limit: 10,
      });
      expect(items.map((i) => i.id)).toEqual(['s1', 's2', 's3']);
    });

    it('cross-workspace isolation: Sprint 11 / sprint-QA M1', () => {
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      const stmt = db.prepare(
        `INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at)
         VALUES (?, 'brand-identity', ?, ?, 'twitter', 'editor-id', ?)`,
      );
      stmt.run('a-item', wsA, 1000, 0);
      stmt.run('b-item', wsB, 2000, 0);

      const itemsA = listScheduledItems(db, { workspaceId: wsA, limit: 10 });
      expect(itemsA.map((i) => i.id)).toEqual(['a-item']);
      const itemsB = listScheduledItems(db, { workspaceId: wsB, limit: 10 });
      expect(itemsB.map((i) => i.id)).toEqual(['b-item']);
    });
  });

  describe('listRecentApprovals', () => {
    it('orders by created_at DESC', () => {
      const insert = (id: string, createdAt: number) =>
        db
          .prepare(
            `INSERT INTO approvals (id, document_slug, workspace_id, approved_by, notes, created_at)
             VALUES (?, 'brand-identity', ?, 'admin-id', NULL, ?)`,
          )
          .run(id, SAMPLE_WORKSPACE.id, createdAt);
      insert('a1', 1000);
      insert('a2', 2000);
      insert('a3', 3000);

      const items = listRecentApprovals(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        limit: 10,
      });
      expect(items.map((i) => i.id)).toEqual(['a3', 'a2', 'a1']);
    });

    it('cross-workspace isolation: Sprint 11 / sprint-QA M1', () => {
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      const stmt = db.prepare(
        `INSERT INTO approvals (id, document_slug, workspace_id, approved_by, notes, created_at)
         VALUES (?, 'brand-identity', ?, 'admin-id', NULL, ?)`,
      );
      stmt.run('a-appr', wsA, 1000);
      stmt.run('b-appr', wsB, 2000);

      const itemsA = listRecentApprovals(db, { workspaceId: wsA, limit: 10 });
      expect(itemsA.map((i) => i.id)).toEqual(['a-appr']);
      const itemsB = listRecentApprovals(db, { workspaceId: wsB, limit: 10 });
      expect(itemsB.map((i) => i.id)).toEqual(['b-appr']);
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

  /*
   * Sprint 24 — new cockpit queries: per-tool stats, lease pipeline,
   * severity distribution. Each block follows the same shape as the
   * existing queries: workspace isolation, time-window filtering where
   * relevant, defensive handling of empty / malformed input.
   */

  describe('listPerToolStats (Sprint 24.5 — reads tool_calls)', () => {
    it('returns empty when there are no tool_calls rows', () => {
      const stats = listPerToolStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: 0,
        limit: 20,
      });
      expect(stats).toEqual([]);
    });

    it('aggregates a single read-only tool with all success rows: success=1, rollback=0', () => {
      const editor = seedUser(db, 'Reviewer');
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 3; i += 1) {
        insertToolCall(db, {
          actorUserId: editor.id,
          actorRole: 'Reviewer',
          toolName: 'grade_clause_severity',
          createdAt: now - i,
        });
      }
      const stats = listPerToolStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 100,
        limit: 20,
      });
      expect(stats).toHaveLength(1);
      expect(stats[0].tool_name).toBe('grade_clause_severity');
      expect(stats[0].invocations).toBe(3);
      expect(stats[0].success_rate).toBe(1);
      expect(stats[0].rollback_rate).toBe(0);
      expect(stats[0].last_invoked_at).toBe(now);
    });

    it('computes rollback_rate from audit_log rows joined via tool_use_id', () => {
      const editor = seedUser(db, 'Reviewer');
      const now = Math.floor(Date.now() / 1000);
      // 3 successful tool_calls for the mutating tool, each with a
      // distinct tool_use_id so the JOIN can match each to its audit
      // row. Then 1 audit_log row marked rolled_back.
      for (let i = 0; i < 3; i += 1) {
        const toolUseId = `toolu_${i}`;
        insertToolCall(db, {
          actorUserId: editor.id,
          actorRole: 'Reviewer',
          toolName: 'draft_negotiation_email',
          createdAt: now - i,
          toolUseId,
        });
        const auditId = insertAuditRow(db, {
          actorUserId: editor.id,
          actorRole: 'Reviewer',
          toolName: 'draft_negotiation_email',
          createdAt: now - i,
        });
        // Patch the audit row's tool_use_id so the JOIN matches.
        db.prepare(`UPDATE audit_log SET tool_use_id = ? WHERE id = ?`).run(
          toolUseId,
          auditId,
        );
        // First (i=0) audit row gets rolled back.
        if (i === 0) {
          db.prepare(
            `UPDATE audit_log SET status = 'rolled_back' WHERE id = ?`,
          ).run(auditId);
        }
      }

      const stats = listPerToolStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 100,
        limit: 20,
      });
      expect(stats).toHaveLength(1);
      expect(stats[0].invocations).toBe(3);
      expect(stats[0].success_rate).toBe(1); // all tool_calls succeeded
      expect(stats[0].rollback_rate).toBeCloseTo(1 / 3, 6);
    });

    it('orders multiple tools by invocations DESC', () => {
      const editor = seedUser(db, 'Reviewer');
      const now = Math.floor(Date.now() / 1000);
      insertToolCall(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        toolName: 'extract_clauses',
        createdAt: now - 1,
      });
      for (let i = 0; i < 3; i += 1) {
        insertToolCall(db, {
          actorUserId: editor.id,
          actorRole: 'Reviewer',
          toolName: 'grade_clause_severity',
          createdAt: now - i,
        });
      }
      const stats = listPerToolStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 100,
        limit: 20,
      });
      expect(stats.map((s) => s.tool_name)).toEqual([
        'grade_clause_severity',
        'extract_clauses',
      ]);
    });

    it('filters out rows older than `since`', () => {
      const editor = seedUser(db, 'Reviewer');
      const now = Math.floor(Date.now() / 1000);
      insertToolCall(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        toolName: 'extract_clauses',
        createdAt: now,
      });
      insertToolCall(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        toolName: 'extract_clauses',
        createdAt: now - 999_999,
      });
      const stats = listPerToolStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 60,
        limit: 20,
      });
      expect(stats[0].invocations).toBe(1);
    });

    it('cross-workspace isolation', () => {
      const editor = seedUser(db, 'Reviewer');
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      const now = Math.floor(Date.now() / 1000);
      insertToolCall(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        workspaceId: wsA,
        createdAt: now,
      });
      insertToolCall(db, {
        actorUserId: editor.id,
        actorRole: 'Reviewer',
        workspaceId: wsB,
        createdAt: now,
      });
      const stats = listPerToolStats(db, {
        workspaceId: wsA,
        since: now - 60,
        limit: 20,
      });
      expect(stats).toHaveLength(1);
    });
  });

  describe('getLeasePipelineStats', () => {
    function insertLease(
      database: Database.Database,
      opts: {
        workspaceId?: string;
        createdAt: number;
        clauseCount: number;
      },
    ): string {
      const leaseId = randomUUID();
      const ws = opts.workspaceId ?? SAMPLE_WORKSPACE.id;
      seedParents(database, ws); // Sprint D.20 — FK parents
      database
        .prepare(
          `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
           VALUES (?, ?, 'test.pdf', '', 1, 'u', ?)`,
        )
        .run(leaseId, ws, opts.createdAt);
      for (let i = 0; i < opts.clauseCount; i += 1) {
        database
          .prepare(
            `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
             VALUES (?, ?, ?, ?, 'security_deposit', 't', 1, ?)`,
          )
          .run(randomUUID(), leaseId, ws, i, opts.createdAt);
      }
      return leaseId;
    }

    it('returns all-zero when no leases exist', () => {
      const stats = getLeasePipelineStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: 0,
      });
      expect(stats).toEqual({
        uploads_24h: 0,
        total_clauses_24h: 0,
        avg_clauses_per_lease: 0,
        lifetime_uploads: 0,
      });
    });

    it('computes the 24h + lifetime counters with clause aggregation', () => {
      const now = Math.floor(Date.now() / 1000);
      insertLease(db, { createdAt: now - 100, clauseCount: 8 });
      insertLease(db, { createdAt: now - 200, clauseCount: 12 });
      const stats = getLeasePipelineStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 60 * 60 * 24, // 24h ago
      });
      expect(stats.uploads_24h).toBe(2);
      expect(stats.total_clauses_24h).toBe(20);
      expect(stats.avg_clauses_per_lease).toBe(10);
      expect(stats.lifetime_uploads).toBe(2);
    });

    it('older leases count toward lifetime but NOT uploads_24h', () => {
      const now = Math.floor(Date.now() / 1000);
      insertLease(db, { createdAt: now - 100, clauseCount: 4 });
      insertLease(db, {
        createdAt: now - 60 * 60 * 24 * 7,
        clauseCount: 12,
      });
      const stats = getLeasePipelineStats(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        since: now - 60 * 60 * 24,
      });
      expect(stats.uploads_24h).toBe(1);
      expect(stats.total_clauses_24h).toBe(4);
      expect(stats.lifetime_uploads).toBe(2);
    });

    it('cross-workspace isolation', () => {
      const now = Math.floor(Date.now() / 1000);
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      insertLease(db, {
        workspaceId: wsA,
        createdAt: now - 100,
        clauseCount: 3,
      });
      insertLease(db, {
        workspaceId: wsB,
        createdAt: now - 100,
        clauseCount: 99,
      });
      const stats = getLeasePipelineStats(db, {
        workspaceId: wsA,
        since: now - 60 * 60 * 24,
      });
      expect(stats.uploads_24h).toBe(1);
      expect(stats.total_clauses_24h).toBe(3);
      expect(stats.lifetime_uploads).toBe(1);
    });
  });

  describe('getSeverityDistribution (Sprint 24.1 — reads clauses.severity)', () => {
    // Sprint 24.1 — severity now lives in a column on `clauses`, written
    // by grade_clause_severity after validation. Tests insert clause
    // rows directly with a severity value; ungraded clauses (severity
    // IS NULL) are excluded from the distribution.
    function insertClauseWithSeverity(
      database: Database.Database,
      severity: string | null,
      workspaceId: string = SAMPLE_WORKSPACE.id,
    ): string {
      const leaseId = randomUUID();
      const clauseId = randomUUID();
      seedParents(database, workspaceId); // Sprint D.20 — FK parents
      database
        .prepare(
          `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
           VALUES (?, ?, 'test.pdf', '', 1, 'u', ?)`,
        )
        .run(leaseId, workspaceId, Math.floor(Date.now() / 1000));
      database
        .prepare(
          `INSERT INTO clauses (
             id, lease_id, workspace_id, clause_index, clause_type, text, page_number, severity, created_at
           ) VALUES (?, ?, ?, 0, 'security_deposit', 't', 1, ?, ?)`,
        )
        .run(
          clauseId,
          leaseId,
          workspaceId,
          severity,
          Math.floor(Date.now() / 1000),
        );
      return clauseId;
    }

    it('returns all-zero when no clauses are graded yet', () => {
      const dist = getSeverityDistribution(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
      });
      expect(dist).toEqual({
        high: 0,
        medium: 0,
        low: 0,
        ok: 0,
        total: 0,
      });
    });

    it('buckets HIGH / MEDIUM / LOW / OK and computes total', () => {
      insertClauseWithSeverity(db, 'high');
      insertClauseWithSeverity(db, 'high');
      insertClauseWithSeverity(db, 'medium');
      insertClauseWithSeverity(db, 'low');
      insertClauseWithSeverity(db, 'ok');
      const dist = getSeverityDistribution(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
      });
      expect(dist.high).toBe(2);
      expect(dist.medium).toBe(1);
      expect(dist.low).toBe(1);
      expect(dist.ok).toBe(1);
      expect(dist.total).toBe(5);
    });

    it('excludes ungraded (severity IS NULL) clauses from the distribution', () => {
      insertClauseWithSeverity(db, 'high');
      insertClauseWithSeverity(db, null);
      insertClauseWithSeverity(db, null);
      const dist = getSeverityDistribution(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
      });
      expect(dist.high).toBe(1);
      expect(dist.total).toBe(1);
    });

    it('cross-workspace isolation', () => {
      const wsA = '00000000-0000-0000-0000-0000000000aa';
      const wsB = '00000000-0000-0000-0000-0000000000bb';
      insertClauseWithSeverity(db, 'high', wsA);
      insertClauseWithSeverity(db, 'high', wsB);
      insertClauseWithSeverity(db, 'low', wsB);
      const dist = getSeverityDistribution(db, { workspaceId: wsA });
      expect(dist.high).toBe(1);
      expect(dist.total).toBe(1);
    });
  });
});
