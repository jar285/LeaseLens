# Sprint 24 — Cockpit Observability — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/cockpit`.
**Estimated phases:** 5. TDD-driven across all phases.

---

## Phase 0 — Pre-flight

1. Confirm `git branch --show-current` is `feature/cockpit`. ✓ (confirmed at sprint-start recon)
2. Baseline: `npm test` (expect 823 / 823 ✓ confirmed), `npm run lint` (0 errors), `npm run typecheck` (clean).
3. Re-read [`src/components/cockpit/AuditFeedPanel.tsx`](../../../src/components/cockpit/AuditFeedPanel.tsx), [`SpendPanel.tsx`](../../../src/components/cockpit/SpendPanel.tsx), [`RefreshButton.tsx`](../../../src/components/cockpit/RefreshButton.tsx), [`queries.ts`](../../../src/lib/cockpit/queries.ts), [`actions.ts`](../../../src/app/cockpit/actions.ts), [`types.ts`](../../../src/lib/cockpit/types.ts) — these are the patterns Phase 1 will lift from.

---

## Phase 1 — `CockpitPanel` primitive (composite pattern)

**Files touched:**
- NEW: [`src/components/cockpit/CockpitPanel.tsx`](../../../src/components/cockpit/CockpitPanel.tsx)
- NEW: [`src/components/cockpit/CockpitPanel.test.tsx`](../../../src/components/cockpit/CockpitPanel.test.tsx)
- MODIFIED: each of the five existing panels (one-line replacement of inline chrome)

**TDD red-green:**

1. RED — write `CockpitPanel.test.tsx` with these cases:
   - Renders `data-testid` from prop verbatim.
   - Renders `title` as `<h2>` inside the header.
   - Renders `subtitle` text when provided, omits the node when absent.
   - When `onRefresh` is provided, renders a child element matching `[data-testid="refresh-button"]`; clicking it invokes the callback.
   - When `onRefresh` is omitted, the refresh-button element is absent.
   - Renders children inside the panel body.
2. GREEN — implement `CockpitPanel.tsx`:
   - Card chrome: `overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900` (lift exactly from existing panels for visual parity).
   - Header: `flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800`.
   - Pass `onRefresh` straight through to `<RefreshButton onRefresh={onRefresh} />` when defined.
3. REFACTOR — migrate the five existing panels:
   - For each, replace the inline `<section ... overflow-hidden ...>` + inline `<header>` + inline `<RefreshButton>` with `<CockpitPanel title=... subtitle=... onRefresh=... testId=...>` wrapping the existing body.
   - Existing tests must continue to pass — `data-testid` values stay identical (e.g. `audit-feed-panel`, `spend-panel`).

**Verification:** `npm test` continues to pass at the new count (823 + new CockpitPanel tests). No visual regression — same DOM shape under the new wrapper.

---

## Phase 2 — PerToolStatsPanel (Tier-1 KPI #1)

**Files touched:**
- NEW: [`src/components/cockpit/PerToolStatsPanel.tsx`](../../../src/components/cockpit/PerToolStatsPanel.tsx)
- NEW: [`src/components/cockpit/PerToolStatsPanel.test.tsx`](../../../src/components/cockpit/PerToolStatsPanel.test.tsx)
- MODIFIED: [`src/lib/cockpit/queries.ts`](../../../src/lib/cockpit/queries.ts) — add `listPerToolStats`
- MODIFIED: [`src/lib/cockpit/types.ts`](../../../src/lib/cockpit/types.ts) — add `PerToolStat`
- MODIFIED: [`src/app/cockpit/actions.ts`](../../../src/app/cockpit/actions.ts) — add `refreshPerToolStats`
- NEW: [`src/lib/cockpit/queries.test.ts`](../../../src/lib/cockpit/queries.test.ts) (extended if exists) — coverage for `listPerToolStats`

**TDD red-green:**

1. RED — write `queries.test.ts` cases for `listPerToolStats`:
   - Empty audit_log → empty array.
   - Single tool with 3 executed rows → one row, `success_rate: 1, rollback_rate: 0, invocations: 3`.
   - Single tool with 2 executed + 1 rolled_back → `success_rate: 2/3, rollback_rate: 1/3`.
   - Multiple tools → ordered by `invocations DESC`.
   - Workspace-scoped: rows in another workspace are excluded.
   - 24 h window: rows older than 24 h excluded.
2. GREEN — implement `listPerToolStats(db, { workspaceId, limit })`:
   ```sql
   SELECT
     tool_name,
     COUNT(*) AS invocations,
     SUM(CASE WHEN status = 'executed'    THEN 1 ELSE 0 END) AS executed_count,
     SUM(CASE WHEN status = 'rolled_back' THEN 1 ELSE 0 END) AS rolled_back_count,
     MAX(created_at) AS last_invoked_at
   FROM audit_log
   WHERE workspace_id = @workspace_id
     AND created_at >= @since
   GROUP BY tool_name
   ORDER BY invocations DESC
   LIMIT @limit
   ```
   - `@since = Math.floor(Date.now() / 1000) - 86400` (last 24 h).
   - Compute `success_rate = executed_count / invocations`, `rollback_rate = rolled_back_count / invocations`. Avoid division-by-zero (won't happen — GROUP BY excludes empty groups, but defensively `invocations > 0`).
3. RED — write `PerToolStatsPanel.test.tsx`:
   - Empty state ("No tool activity in the last 24 hours").
   - Populated state: renders one row per stat, columns `tool name · invocations · success % · rollback % · last invoked` (relative time).
   - Renders inside a `CockpitPanel` with `testId="per-tool-stats-panel"`.
   - Refresh action wiring: clicking refresh invokes a mocked `onRefresh`.
4. GREEN — implement `PerToolStatsPanel`:
   - Wraps in `<CockpitPanel title="Per-tool activity" subtitle="Last 24 hours" onRefresh={refreshPerToolStats} testId="per-tool-stats-panel">`.
   - Small table with `tabular` numeric columns, terracotta accent on the invocations count, severity (success-600 / warning-600 / danger-600) on the rate columns based on threshold (e.g. rollback > 0.20 = warning).
5. GREEN — add `refreshPerToolStats` server action: `requireOperator`, resolve workspace cookie, call `listPerToolStats`.

**Verification:** All new tests green. Server action callable from the panel (one-click refresh works in dev).

---

## Phase 3 — LeasePipelinePanel (Tier-1 KPI #2)

**Files touched:**
- NEW: [`src/components/cockpit/LeasePipelinePanel.tsx`](../../../src/components/cockpit/LeasePipelinePanel.tsx)
- NEW: [`src/components/cockpit/LeasePipelinePanel.test.tsx`](../../../src/components/cockpit/LeasePipelinePanel.test.tsx)
- MODIFIED: queries.ts — add `getLeasePipelineStats`
- MODIFIED: types.ts — add `LeasePipelineStats`
- MODIFIED: actions.ts — add `refreshLeasePipeline`

**TDD red-green:**

1. RED — `queries.test.ts` for `getLeasePipelineStats`:
   - Empty `leases` table → `{ uploads_24h: 0, total_clauses_24h: 0, avg_clauses_per_lease: 0, lifetime_uploads: 0 }`.
   - 2 leases uploaded in last 24 h, 8 + 12 clauses → `{ uploads_24h: 2, total_clauses_24h: 20, avg_clauses_per_lease: 10, lifetime_uploads: 2 }`.
   - 1 lease in last 24 h + 3 leases older → `uploads_24h: 1, lifetime_uploads: 4`.
   - Workspace-scoped.
2. GREEN — implement `getLeasePipelineStats(db, { workspaceId })`:
   ```sql
   SELECT
     COUNT(*) AS uploads_24h,
     COALESCE(SUM((SELECT COUNT(*) FROM clauses c WHERE c.lease_id = l.id)), 0) AS total_clauses_24h
   FROM leases l
   WHERE l.workspace_id = @workspace_id
     AND l.created_at >= @since
   ```
   Plus a second simple `SELECT COUNT(*) FROM leases WHERE workspace_id = ?` for lifetime.
   - `avg_clauses_per_lease = uploads_24h > 0 ? total_clauses_24h / uploads_24h : 0`.
3. RED — `LeasePipelinePanel.test.tsx`:
   - Empty (zeros) state renders three zeros with labels.
   - Populated state renders the three numbers in the right slots.
   - Refresh wiring.
4. GREEN — implement `LeasePipelinePanel`:
   - Three large stats in a row: "Uploads (24h)" · "Total clauses (24h)" · "Avg clauses / lease".
   - Plus a small subtitle line: "Lifetime: N leases reviewed."

**Verification:** Tests green; on a seeded workspace, panel shows real numbers.

---

## Phase 4 — SeverityDistributionPanel (Tier-1 KPI #3)

**Files touched:**
- NEW: [`src/components/cockpit/SeverityDistributionPanel.tsx`](../../../src/components/cockpit/SeverityDistributionPanel.tsx)
- NEW: [`src/components/cockpit/SeverityDistributionPanel.test.tsx`](../../../src/components/cockpit/SeverityDistributionPanel.test.tsx)
- MODIFIED: queries.ts — add `getSeverityDistribution`
- MODIFIED: types.ts — add `SeverityDistribution`
- MODIFIED: actions.ts — add `refreshSeverityDistribution`

**TDD red-green:**

1. RED — `queries.test.ts` for `getSeverityDistribution`:
   - No `grade_clause_severity` audit rows → all-zero distribution.
   - Three rows, severities HIGH / HIGH / LOW → `{ high: 2, low: 1, medium: 0, ok: 0, total: 3 }`.
   - Malformed `output_json` → tolerated (row skipped, doesn't crash).
   - Workspace-scoped.
2. GREEN — implement `getSeverityDistribution(db, { workspaceId })`:
   - Pull `output_json` for all `tool_name = 'grade_clause_severity'` rows in the workspace.
   - JSON.parse each; bucket by `.severity` (case-insensitive). Wrap each parse in try/catch.
   - Return `{ high, medium, low, ok, total, graded_clauses }`.
3. RED — `SeverityDistributionPanel.test.tsx`:
   - Empty state ("No clauses graded yet").
   - Populated: renders four rows (HIGH / MED / LOW / OK), each with `SeverityBadge`, count, and a horizontal bar whose width is `count / total * 100%`.
   - Refresh wiring.
4. GREEN — implement `SeverityDistributionPanel`:
   - For each severity, render a row: `<SeverityBadge size="sm" />` + label + count + a CSS-only progress bar (`<div className="h-2 bg-{sev}-600 rounded-full" style={{ width }} />`).

**Verification:** Tests green; on a workspace that has had a scan run, panel shows the four-way breakdown.

---

## Phase 5 — Wire into CockpitDashboard + page hydration

**Files touched:**
- MODIFIED: [`src/components/cockpit/CockpitDashboard.tsx`](../../../src/components/cockpit/CockpitDashboard.tsx)
- MODIFIED: [`src/app/cockpit/page.tsx`](../../../src/app/cockpit/page.tsx)
- MODIFIED: [`src/lib/cockpit/types.ts`](../../../src/lib/cockpit/types.ts) — extend `CockpitInitialData`

**Steps:**

1. Extend `CockpitInitialData` with three new optional fields: `perToolStats?: PerToolStat[]`, `leasePipeline?: LeasePipelineStats`, `severityDistribution?: SeverityDistribution`. Optional so older callers (none in our codebase) wouldn't break.
2. In `cockpit/page.tsx`, fetch the three new snapshots server-side (same pattern as existing fetches) and pass into `<CockpitDashboard>`.
3. In `CockpitDashboard.tsx`, compose the three new panels into the right column between `SpendPanel` and `EvalHealthPanel`:
   ```
   AuditFeedPanel (left column, full height)
   ────
   right column (top to bottom):
     SpendPanel
     PerToolStatsPanel        ← new
     LeasePipelinePanel       ← new
     SeverityDistributionPanel ← new
     EvalHealthPanel
     SchedulePanel
     ApprovalsPanel (Admin only)
   ```
4. Smoke-test locally: `npm run dev`, hit `/cockpit` as Reviewer, verify the three new panels render with data after running a scan against the sample lease.

**Verification:** `npm test` ≥ 833 (823 baseline + ≥ 10 new); `npm run typecheck` clean; `npm run lint` clean; manual `/cockpit` walk shows new panels.

---

## Phase 6 — impl-qa.md write-up

After each implementation phase commits cleanly:

1. Update [`impl-qa.md`](./impl-qa.md) with: what files touched, test-count delta, what the panel actually shows on the seeded workspace, any deviations from the spec.
2. Note any tier-2 follow-ups discovered during implementation (e.g. "rollback rate would benefit from a 7-day comparison line — defer to Sprint 24.1").
