import type { Role } from '@/lib/auth/types';
import type { AuditLogEntry } from '@/lib/tools/domain';

/**
 * Cockpit projection of audit_log rows. Augments AuditLogEntry with the
 * actor display name resolved via LEFT JOIN users (Spec §4.3 audit-feed
 * query shape). The base AuditLogEntry in src/lib/tools/domain.ts is
 * unchanged — Sprint 8 ABI preserved.
 *
 * actor_display_name is null for rows whose actor_user_id has no match in
 * users — notably MCP-originated rows where actor_user_id = 'mcp-server'.
 * The cockpit AuditFeedPanel falls back to rendering actor_user_id literal
 * in that case (Spec §6.2).
 */
export interface CockpitAuditRow extends AuditLogEntry {
  actor_display_name: string | null;
}

export interface ScheduledItem {
  id: string;
  document_slug: string;
  scheduled_for: number; // Unix seconds, per Sprint 8 §6.1
  channel: string;
  scheduled_by: string;
  created_at: number;
}

export interface ApprovalRecord {
  id: string;
  document_slug: string;
  approved_by: string;
  notes: string | null;
  created_at: number;
}

export interface SpendSnapshot {
  date: string; // YYYY-MM-DD as written by SQLite date('now') (UTC)
  tokens_in: number;
  tokens_out: number;
  estimated_dollars: number; // computed via estimateCost from src/lib/db/spend.ts
}

export interface EvalHealthSnapshot {
  passedCount: number;
  totalCases: number;
  totalScore: number;
  maxScore: number;
  lastRunAt: string; // report.completedAt (ISO 8601)
  reportPath: string; // server-side debug only — not exposed to client
}

/**
 * Sprint 14 / Phase 12 — Tier 2 lease-grading snapshot. Projects the
 * lease-grading-*.json report shape (see lease-grading-runner.ts) into
 * the four spec §3i metrics + latency rollups for cockpit display.
 */
export interface LeaseGradingSnapshot {
  totalCases: number;
  precision: number; // [0, 1]
  recall: number; // [0, 1]
  f1: number; // [0, 1]
  groundedness: number; // [0, 1] — % of cases that completed without tool error
  exactMatch: number; // [0, 1] — % where actualSeverity == expectedSeverity
  statuteHitRate: number; // [0, 1] — % where citation contained expected prefix
  latencyP50Ms: number;
  latencyP95Ms: number;
  lastRunAt: string;
  reportPath: string;
}

export interface CockpitInitialData {
  recentAudit: CockpitAuditRow[];
  scheduled: ScheduledItem[];
  /** Empty array for Editor sessions (panel hidden). Spec §4.5 / §6.4. */
  approvals: ApprovalRecord[];
  evalHealth: EvalHealthSnapshot | null;
  /** Sprint 14 / Phase 12 — null when no Tier 2 report has been written. */
  leaseGrading: LeaseGradingSnapshot | null;
  spend: SpendSnapshot;
  role: Role;
  userId: string;
}
