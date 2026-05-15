# Sprint 24 — Cockpit Observability (Agent-Operator KPIs)

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-15.
**Branch:** `feature/cockpit`.
**Predecessors:** [sprint-23a](../sprint-23a-ui-foundation/spec.md) through [sprint-23f](../sprint-23f-negotiation-email-card/spec.md) (committed); Sprint 23g–k UI brand refresh + animate-ping (uncommitted on `feature/cockpit`).
**Origin:** Cockpit-brainstorm brief: the current dashboard answers *"how much did we spend today"* and *"what mutations happened"* but cannot answer the four questions a 2026 AI-agent operator actually needs at a glance — **is the agent behaving · what is it doing · how is cost trending · where is it failing.** This sprint closes the highest-leverage gaps.

---

## 1. Problem

The `/cockpit` route renders five panels: AuditFeedPanel, SpendPanel, EvalHealthPanel, SchedulePanel, ApprovalsPanel. Two of those (Schedule + Approvals) are ContentOps-era residue with column shapes (`document_slug`, `channel`, `approved_by`) that don't fit the lease-review domain. The remaining three answer point-in-time questions but offer **zero aggregation**, **zero per-tool visibility**, and **zero lease-pipeline observability** — even though every required data point already lives in `audit_log`, `leases`, `clauses`, and `messages`.

The brainstorm in [`plans/i-want-you-to-graceful-crescent.md`](../../../README.md) ranked the gaps by leverage. This sprint takes the **Tier-1 must-haves** and turns them into shippable cockpit panels, plus does the one structural refactor (`CockpitPanel` primitive) that pays for itself the moment a third panel is added.

Specifically, an operator visiting `/cockpit` today cannot answer:

1. **Which tools is the agent calling, and which are failing?** No per-tool aggregate exists; the audit feed is a flat log.
2. **Are uploads parsing successfully?** No lease-pipeline panel exists.
3. **What does the severity-grade distribution look like across everything I've reviewed?** Severity data lives in `audit_log.output_json` strings; no panel parses it.
4. **Is rollback usage normal or anomalous?** `audit_log.status` is queryable but not surfaced as a KPI.

Sprint 24 ships answers to questions 1–4 as four new panels (or panel sections), routed through a shared `CockpitPanel` primitive to keep the dashboard's visual language coherent.

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen — paths, exported names, and props of existing panels stay backward-compatible (existing tests pass unchanged).
2. No new runtime dependencies. New panels use the same `motion`, `lucide-react`, and Tailwind v4 token stack already in the codebase.
3. `useReducedMotion()` gate is non-negotiable — every new motion site renders a plain branch under reduced motion.
4. Severity is communicated by text + icon + colour, never colour alone — the new SeverityDistribution panel uses `SeverityBadge` for legend rows.
5. WCAG AA contrast in both colour schemes; visible focus states; 44×44 touch targets.
6. Test count never decreases (currently 823 / 823).
7. No legal-pipeline, corpus, classifier, tool-contract, schema, or chat-route changes. The `audit_log` writer ([`audit-log.ts`](../../../src/lib/tools/audit-log.ts)), tool registry, RAG retrieval, and grading-tool internals are untouched.
8. Per-sprint RBAC discipline: every new cockpit query is workspace-scoped via the cookie (no cross-workspace leakage); every new server action is wrapped in `requireOperator()` (Reviewer / Admin only), Admin-only actions in `requireAdmin()`.

Sprint-24-specific invariants:

9. ~~No schema migrations.~~ **Revised in Sprint 24.1:** the original assumption was that severity data lived in `audit_log.output_json` for `grade_clause_severity` rows. That assumption was wrong — `grade_clause_severity` is a read-only tool and the registry only writes audit_log for mutating tools. The Sprint 24.1 hotfix adds a `severity` column to `clauses` (idempotent migration), and the grading tool writes the validated severity back to the clause row. See [impl-qa.md → Sprint 24.1](./impl-qa.md) for the diff. The cockpit SeverityDistribution query is now a trivial `GROUP BY` against `clauses.severity`.
10. **No live-data plumbing yet.** All panels stay on the existing manual `RefreshButton` seam. SSE / polling is parked for a Sprint 24.1 follow-up.
11. **No time-range selector yet.** All new KPIs default to "last 24 h" or "all-time available," documented per panel. URL-state filtering is a Tier-2 follow-up.
12. **Legacy panels (Schedule + Approvals) stay rendering as-is** — their lease-domain reframe needs a stakeholder conversation (Phase 6 of the brainstorm); we are NOT retiring or repurposing them in this sprint.
13. **Each new panel exits with the same five states**: empty, loading, success, error, refreshing — mirroring the existing panel contract.
14. Public type surface in `src/lib/cockpit/types.ts` only grows — existing `CockpitInitialData` is extended additively (new optional fields with `?`), so the page can ship without back-compat shims.

---

## 3. Design system

### 3a. Token consumers

| Token | Surface | Usage |
|---|---|---|
| `--color-surface-card` (23j inset) | Panel body | Same elevation as every existing cockpit panel |
| `--color-surface-sunken` (23j) | Per-tool stats inner table-zebra band | Visually separates header row from data rows |
| `--color-accent-600` (23i terracotta) | Stat highlight (large numbers) | Primary KPI numeric colour |
| `--color-citation` (23h ink-blue) | NOT consumed — citations don't appear in cockpit | n/a |
| `SeverityBadge` (23d) | SeverityDistribution legend | Reuses the existing primitive; no new badge variant |
| `--shadow-hairline` | Panel chrome | Existing pattern |
| `--duration-220` + `ease-out-soft` | Number-roll-in on refresh | Same shape as existing AuditFeedPanel slide-in |

No new tokens. No new lucide icons unless an obvious one is missing (e.g. `FileStack` for lease-pipeline panel — if absent, fall back to `Files`).

### 3b. Component refactor scope

| Component | Path | Phase | What changes |
|---|---|---|---|
| `CockpitPanel` (NEW) | [src/components/cockpit/CockpitPanel.tsx](../../../src/components/cockpit/CockpitPanel.tsx) | 1 | Composite-pattern shell that wraps the duplicated `<header>` + `<RefreshButton>` + card chrome. Props: `title`, `subtitle?`, `onRefresh?`, `testId`, `children`. Five existing panels migrate to it in the same phase (one-line `<CockpitPanel>` replacement per panel). |
| `CockpitPanel.test.tsx` (NEW) | [src/components/cockpit/CockpitPanel.test.tsx](../../../src/components/cockpit/CockpitPanel.test.tsx) | 1 | Tests: renders title + subtitle, renders RefreshButton when `onRefresh` is provided, omits it when not, forwards `testId` as `data-testid`. |
| Existing 5 panels | `src/components/cockpit/*Panel.tsx` | 1 | Refactor only: replace inline chrome with `<CockpitPanel>`. Behaviour, props, tests unchanged. |
| `PerToolStatsPanel` (NEW) | [src/components/cockpit/PerToolStatsPanel.tsx](../../../src/components/cockpit/PerToolStatsPanel.tsx) | 2 | New panel. Renders a small table: tool name · 24 h invocations · success rate (% non-error) · rollback rate (% rolled back) · last invoked. Workspace-scoped. |
| `PerToolStatsPanel.test.tsx` (NEW) | [src/components/cockpit/PerToolStatsPanel.test.tsx](../../../src/components/cockpit/PerToolStatsPanel.test.tsx) | 2 | Tests: empty state, populated rows with computed rates, refresh action wiring. |
| `LeasePipelinePanel` (NEW) | [src/components/cockpit/LeasePipelinePanel.tsx](../../../src/components/cockpit/LeasePipelinePanel.tsx) | 3 | New panel. Three large stats: uploads (24 h), avg clauses per lease, total clauses (24 h). Workspace-scoped. |
| `LeasePipelinePanel.test.tsx` (NEW) | [src/components/cockpit/LeasePipelinePanel.test.tsx](../../../src/components/cockpit/LeasePipelinePanel.test.tsx) | 3 | Tests: empty zeros, populated numbers, refresh wiring. |
| `SeverityDistributionPanel` (NEW) | [src/components/cockpit/SeverityDistributionPanel.tsx](../../../src/components/cockpit/SeverityDistributionPanel.tsx) | 4 | New panel. Horizontal stacked-bar visualisation across HIGH / MED / LOW / OK using `SeverityBadge` for legend; CSS-only bars (no chart lib). |
| `SeverityDistributionPanel.test.tsx` (NEW) | [src/components/cockpit/SeverityDistributionPanel.test.tsx](../../../src/components/cockpit/SeverityDistributionPanel.test.tsx) | 4 | Tests: empty state, populated severity counts render in correct order, badge for each row. |
| `queries.ts` (extended) | [src/lib/cockpit/queries.ts](../../../src/lib/cockpit/queries.ts) | 2 / 3 / 4 | Add `listPerToolStats(db, opts)`, `getLeasePipelineStats(db, opts)`, `getSeverityDistribution(db, opts)`. Each workspace-scoped, all SQL hand-rolled, no ORM. |
| `types.ts` (extended) | [src/lib/cockpit/types.ts](../../../src/lib/cockpit/types.ts) | 2 / 3 / 4 | New types: `PerToolStat`, `LeasePipelineStats`, `SeverityDistribution`. Add optional fields to `CockpitInitialData` (`perToolStats?`, `leasePipeline?`, `severityDistribution?`). |
| `actions.ts` (extended) | [src/app/cockpit/actions.ts](../../../src/app/cockpit/actions.ts) | 2 / 3 / 4 | Add `refreshPerToolStats()`, `refreshLeasePipeline()`, `refreshSeverityDistribution()`. Each wrapped in `requireOperator()`. |
| `CockpitDashboard.tsx` | [src/components/cockpit/CockpitDashboard.tsx](../../../src/components/cockpit/CockpitDashboard.tsx) | 5 | Compose the three new panels into the existing 2-column grid. Right column expands: SpendPanel, PerToolStatsPanel, LeasePipelinePanel, SeverityDistributionPanel, EvalHealthPanel, (existing) SchedulePanel, (admin) ApprovalsPanel. |
| `cockpit/page.tsx` | [src/app/cockpit/page.tsx](../../../src/app/cockpit/page.tsx) | 5 | Hydrate the three new snapshots into `CockpitInitialData`. |

### 3c. New query signatures

```ts
// listPerToolStats — aggregates last-24h audit_log rows by tool_name.
interface PerToolStat {
  tool_name: string;
  invocations: number;
  success_rate: number;        // [0, 1] — % of rows with status='executed'
  rollback_rate: number;       // [0, 1] — % rolled back
  last_invoked_at: number;     // Unix seconds
}

// getLeasePipelineStats — last-24h lease + clause stats for the workspace.
interface LeasePipelineStats {
  uploads_24h: number;
  total_clauses_24h: number;
  avg_clauses_per_lease: number;  // computed when uploads_24h > 0
  lifetime_uploads: number;       // all-time, for "you've reviewed N leases"
}

// getSeverityDistribution — counts of HIGH / MED / LOW / OK across all
// grade_clause_severity audit_log rows in the workspace. Parses
// output_json for the `severity` field; tolerates missing/malformed.
interface SeverityDistribution {
  high: number;
  medium: number;
  low: number;
  ok: number;
  total: number;       // sum
  graded_clauses: number; // distinct clause_ids graded (from input_json)
}
```

### 3d. New server-action signatures

```ts
async function refreshPerToolStats(): Promise<PerToolStat[]>;
async function refreshLeasePipeline(): Promise<LeasePipelineStats>;
async function refreshSeverityDistribution(): Promise<SeverityDistribution>;
```

All three call `requireOperator()` at the top, resolve the workspace cookie identically to the existing actions, and return the snapshot. No mutation, no audit-log writes.

---

## 4. Acceptance criteria

A code review accepts this sprint when:

- [ ] `CockpitPanel` primitive exists; all five existing panels render through it; no visual regression (manual side-by-side on `/cockpit`).
- [ ] `/cockpit` renders three new panels in the right column: PerToolStats, LeasePipeline, SeverityDistribution.
- [ ] Each new panel shows real data from a seeded workspace (sample lease + any grading actions yet performed).
- [ ] Each new panel handles empty state (no data in last 24 h) without errors.
- [ ] Refresh button on each new panel re-runs the server action and updates the visible numbers.
- [ ] `npm test` ≥ 823 (existing) + ≥ 10 new tests (CockpitPanel + per-new-panel + query coverage).
- [ ] `npm run typecheck` clean.
- [ ] `npm run lint` 0 errors.
- [ ] No new dependencies in `package.json`.
- [ ] Tenant role visiting `/cockpit` still redirects to `/` (RBAC preserved).
- [ ] Admin sees the same three new panels as Reviewer (no Admin-only data among these three).

---

## 5. Out-of-scope (parked for follow-ups)

- Sparklines / trend lines (need a small SVG primitive — separate sprint).
- Time-range selector (URL state + propagate to all queries — separate sprint).
- SSE / live data (long-lived connection management — separate sprint).
- Retire / repurpose SchedulePanel + ApprovalsPanel (stakeholder decision).
- Per-user activity breakdown (needs a UX call on what aggregation to show).
- Eval-drift trend chart (needs rolling history retention).
- Drill-down filters (per-tool name → audit feed filter; needs query plumbing).
- Anomaly callouts (spend > 2σ flag — needs trend data first).
- Schema migration: persist `severity` to `clauses` (cleaner than JSON-parse but defer).
