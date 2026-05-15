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

/**
 * Sprint 24.5 — unified cockpit row that surfaces every tool invocation
 * (read-only AND mutating). Built from the tool_calls table with a
 * LEFT JOIN to audit_log via tool_use_id, so mutation rows carry their
 * audit_id + audit_status + input_json for the Undo affordance, while
 * read-only rows leave those fields null.
 *
 * The legacy CockpitAuditRow stays for any callsite that genuinely
 * needs an audit-log-only projection; the audit feed in the cockpit
 * uses this richer type instead.
 */
export interface CockpitToolCallRow {
  /** tool_calls.id (every row has one). */
  id: string;
  tool_name: string;
  tool_use_id: string | null;
  actor_user_id: string;
  actor_role: Role;
  conversation_id: string | null;
  workspace_id: string;
  /** tool_calls.status — success or error (read-only OR mutation). */
  tool_call_status: 'success' | 'error';
  error_message: string | null;
  latency_ms: number | null;
  created_at: number;
  actor_display_name: string | null;
  // ---- LEFT JOIN audit_log (null for read-only invocations) ----
  audit_id: string | null;
  audit_status: 'executed' | 'rolled_back' | null;
  /** audit_log.input_json when this row is a mutation; null otherwise. */
  audit_input_json: string | null;
  rolled_back_at: number | null;
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

/**
 * Sprint 24 — per-tool aggregate over the last 24 h. One row per
 * distinct `audit_log.tool_name` invocation, with rates derived from
 * the `status` column (executed / rolled_back).
 */
export interface PerToolStat {
  tool_name: string;
  invocations: number;
  /** [0, 1] — count(status='executed') / invocations. */
  success_rate: number;
  /** [0, 1] — count(status='rolled_back') / invocations. */
  rollback_rate: number;
  /** Unix seconds, most-recent invocation. */
  last_invoked_at: number;
}

/**
 * Sprint 24 — lease-pipeline KPIs for the cockpit. Last-24 h uploads
 * + clause counts, plus a lifetime total so a fresh workspace can read
 * "you've reviewed N leases" at a glance.
 */
export interface LeasePipelineStats {
  uploads_24h: number;
  total_clauses_24h: number;
  /** Computed: total_clauses_24h / uploads_24h. 0 when uploads_24h === 0. */
  avg_clauses_per_lease: number;
  lifetime_uploads: number;
}

/**
 * Sprint 24 — severity distribution across all `grade_clause_severity`
 * audit rows in the workspace. Parsed from `audit_log.output_json`.
 * Malformed rows are silently skipped.
 */
export interface SeverityDistribution {
  high: number;
  medium: number;
  low: number;
  ok: number;
  /** Sum of the four buckets. */
  total: number;
}

export interface CockpitInitialData {
  // Sprint 24.5 — `recentAudit` now carries the unified tool-call rows
  // (every invocation, mutating + read-only). The field name is kept
  // for ABI continuity with prior cockpit-page hydration code.
  recentAudit: CockpitToolCallRow[];
  scheduled: ScheduledItem[];
  /** Empty array for Editor sessions (panel hidden). Spec §4.5 / §6.4. */
  approvals: ApprovalRecord[];
  evalHealth: EvalHealthSnapshot | null;
  /** Sprint 14 / Phase 12 — null when no Tier 2 report has been written. */
  leaseGrading: LeaseGradingSnapshot | null;
  spend: SpendSnapshot;
  /** Sprint 24 — additive: existing callers don't need to populate. */
  perToolStats?: PerToolStat[];
  leasePipeline?: LeasePipelineStats;
  severityDistribution?: SeverityDistribution;
  role: Role;
  userId: string;
}
