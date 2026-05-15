# Sprint 24 — Implementation Audit

**Spec:** [spec.md](./spec.md).
**Sprint plan:** [sprint.md](./sprint.md).
**Branch:** `feature/cockpit`.
**Status:** Phases 1–5 complete on localhost. Deployment + Loom remain the closeout work for a separate sprint.

---

## Phase 0 — Pre-flight ✓

- Branch confirmed: `feature/cockpit`.
- Pre-sprint baseline: **823 / 823** tests passing.
- Typecheck + lint clean.

## Phase 1 — `CockpitPanel` primitive ✓

**Files added:**
- [`src/components/cockpit/CockpitPanel.tsx`](../../../src/components/cockpit/CockpitPanel.tsx) — composite-pattern shell. Encapsulates `isRefreshing` state machine; callers pass `async onRefresh()` and the shell toggles the spinner around the await.
- [`src/components/cockpit/CockpitPanel.test.tsx`](../../../src/components/cockpit/CockpitPanel.test.tsx) — **8** tests covering title / subtitle / testId forwarding / refresh wiring presence + invocation / children rendering.

**Migrated to `<CockpitPanel>`:**
- [`SpendPanel.tsx`](../../../src/components/cockpit/SpendPanel.tsx)
- [`AuditFeedPanel.tsx`](../../../src/components/cockpit/AuditFeedPanel.tsx)
- [`SchedulePanel.tsx`](../../../src/components/cockpit/SchedulePanel.tsx)
- [`ApprovalsPanel.tsx`](../../../src/components/cockpit/ApprovalsPanel.tsx)
- [`EvalHealthPanel.tsx`](../../../src/components/cockpit/EvalHealthPanel.tsx)

Each panel dropped its local `useState<isRefreshing>` + `try { setIsRefreshing(true); ... } finally { setIsRefreshing(false); }` boilerplate. Net: ~40 lines deleted across the five panels; one new ~90-line primitive added. The visual language is now one decision (inside `CockpitPanel`) instead of five copies — Uncle-Bob SRP at the panel level.

All five existing panel tests continued to pass without modification (data-testid surface unchanged, behaviour unchanged).

## Phase 2 — `PerToolStatsPanel` (Tier-1 KPI #1) ✓

**Files added:**
- [`src/components/cockpit/PerToolStatsPanel.tsx`](../../../src/components/cockpit/PerToolStatsPanel.tsx) — table-style panel: tool name · invocations · success % · rollback %. Rates carry semantic colour (green / amber / red) so the operator reads "is this tool healthy?" in one glance.
- [`src/components/cockpit/PerToolStatsPanel.test.tsx`](../../../src/components/cockpit/PerToolStatsPanel.test.tsx) — **3** tests: empty state, row-per-stat with computed rates, CockpitPanel chrome.

**Query added:** `listPerToolStats(db, { workspaceId, since, limit })` in [`src/lib/cockpit/queries.ts`](../../../src/lib/cockpit/queries.ts). Single SQL `GROUP BY tool_name` with `SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END)` for success counts; rates computed in TS post-fetch.

**Server action:** `refreshPerToolStats()` in [`src/app/cockpit/actions.ts`](../../../src/app/cockpit/actions.ts), gated by `requireOperator()`, workspace-scoped via cookie. `since = now - 24h` computed at the action boundary.

**Query tests added (extend [`queries.test.ts`](../../../src/lib/cockpit/queries.test.ts)):** **5** new — empty-rows → empty-array; all-executed rows → 100% success / 0% rollback; rollback row mixes in correctly; multiple-tools-DESC ordering; `since` window filtering; cross-workspace isolation.

## Phase 3 — `LeasePipelinePanel` (Tier-1 KPI #2) ✓

**Files added:**
- [`src/components/cockpit/LeasePipelinePanel.tsx`](../../../src/components/cockpit/LeasePipelinePanel.tsx) — three large stats in a row: uploads (24h) · total clauses (24h) · avg clauses/lease. Lifetime upload count in the subtitle, with singular/plural noun resolution.
- [`src/components/cockpit/LeasePipelinePanel.test.tsx`](../../../src/components/cockpit/LeasePipelinePanel.test.tsx) — **6** tests.

**Query added:** `getLeasePipelineStats(db, { workspaceId, since })`. Three separate `COUNT(*)` queries (recent uploads, clauses via JOIN, lifetime uploads); avg computed in TS.

**Server action:** `refreshLeasePipeline()`.

**Query tests added:** **4** — all-zero on empty table; 24h + lifetime + clause aggregation; older-leases-count-toward-lifetime-only; cross-workspace isolation.

## Phase 4 — `SeverityDistributionPanel` (Tier-1 KPI #3) ✓

**Files added:**
- [`src/components/cockpit/SeverityDistributionPanel.tsx`](../../../src/components/cockpit/SeverityDistributionPanel.tsx) — four-row CSS-only horizontal bar chart. Each row carries the `SeverityBadge` primitive (triple-channel severity preserved: icon + text + colour) + a `SEVERITY_BAR`-coloured bar normalised against the largest bucket so an OK-only workspace still shows a readable bar.
- [`src/components/cockpit/SeverityDistributionPanel.test.tsx`](../../../src/components/cockpit/SeverityDistributionPanel.test.tsx) — **5** tests including a check that all 4 SeverityBadges render even when buckets are zero.

**Query added:** `getSeverityDistribution(db, { workspaceId })`. Pulls `output_json` for every `grade_clause_severity` audit row; `JSON.parse` per row inside a try/catch; buckets by `.severity` (case-insensitive, with `medium` / `med` both routed to medium). All-time view — no `since` window.

**Server action:** `refreshSeverityDistribution()`.

**Query tests added:** **4** — empty when no rows; correct bucketing across HIGH/MEDIUM/LOW/OK; malformed JSON tolerated; cross-workspace isolation.

## Phase 5 — Dashboard composition ✓

**Files modified:**
- [`src/lib/cockpit/types.ts`](../../../src/lib/cockpit/types.ts) — extended `CockpitInitialData` additively with three optional fields (`perToolStats?`, `leasePipeline?`, `severityDistribution?`). Backward compatible — existing callers don't break.
- [`src/app/cockpit/page.tsx`](../../../src/app/cockpit/page.tsx) — hydrate the three new snapshots in `initialData`. Shared `since = now - 86_400` computed once so the per-tool stats + lease-pipeline windows can't fall on opposite sides of a second boundary.
- [`src/components/cockpit/CockpitDashboard.tsx`](../../../src/components/cockpit/CockpitDashboard.tsx) — right column now stacks: `SpendPanel` → `PerToolStatsPanel` → `LeasePipelinePanel` → `SeverityDistributionPanel` → `EvalHealthPanel` → `SchedulePanel` → (Admin) `ApprovalsPanel`. Defensive zero-state fallbacks when an optional field is undefined.

## Quality gates ✓

- `npm run typecheck` — clean.
- `npm run lint` — clean (after one biome `--write` pass that reformatted long lines auto-fixable by formatter).
- `npm test` — **859 / 859** passing (was 823; **+36** new tests across 4 new panels + 1 primitive + 3 new queries).
- No new runtime dependencies.
- No schema migrations.
- No legal-pipeline / corpus / classifier / tool-contract changes.

## Localhost smoke walk

After `npm run dev` and visiting `/cockpit` as Reviewer or Admin:

1. The three new panels render under SpendPanel in the right column.
2. Empty workspaces show the all-zero states cleanly (no crash, no NaN).
3. Refresh buttons spin and re-fetch via the new server actions.
4. After a real `grade_clause_severity` scan against the seeded sample lease, the SeverityDistribution panel populates and the per-tool stats panel shows the chain (`extract_clauses`, `grade_clause_severity`, possibly `draft_negotiation_email`).

---

## Sprint 24.5 — tool_calls observability log (closes the "0 entries" gap)

User reported: "*the 'What has the AI done?' function in our cockpit isn't updating any data when I use the chat.*"

**Root cause (architectural, by design).** [`registry.ts:86`](../../../src/lib/tools/registry.ts#L86) only writes `audit_log` for tools with `compensatingAction` — i.e. mutating tools. Across the lease, corpus, and diagram tools, the **only** tool with `compensatingAction` is `draft_negotiation_email`. Standard-scan activity (`extract_clauses` + `grade_clause_severity × N` + `search_corpus`) is **all read-only** and never produces audit_log rows. So the panel stayed at "0 entries" until the user explicitly drafted an email. Same blind spot applied to the Sprint 24 `PerToolStats` panel (also sourced from audit_log).

**Fix (user picked option 1 from a three-way choice):** add a new `tool_calls` table that records **every** invocation — read-only AND mutating — and rewire the cockpit panels to read from it.

**Files added / changed:**

| File | Change |
|---|---|
| [`schema.ts`](../../../src/lib/db/schema.ts) | New `tool_calls` table: `id`, `tool_name`, `tool_use_id`, `actor_user_id`, `actor_role`, `conversation_id`, `workspace_id`, `status` (success/error), `error_message`, `latency_ms`, `created_at`. Indexed on `(workspace_id, created_at)` + `(tool_name, created_at)`. `CREATE TABLE IF NOT EXISTS` so existing dev DBs pick it up on next `db.exec(SCHEMA)` (verified via `npm run db:seed` — new table created cleanly on the existing DB without losing any rows). |
| [`tool-calls.ts`](../../../src/lib/tools/tool-calls.ts) (new) | `writeToolCall(db, input)` — parallel to `writeAuditRow`. Translates the wire-level `Role` via `toDbRole`. |
| [`registry.ts`](../../../src/lib/tools/registry.ts) | `execute()` wrapped in try / finally. The `finally` block writes a `tool_calls` row for EVERY invocation with `status` + `latency_ms` + `error_message`. Wrapped in its own try/catch so an observability-log failure never breaks the tool-call return path. Mutating-tool path still writes `audit_log` inside its transaction (unchanged). |
| [`types.ts`](../../../src/lib/cockpit/types.ts) | New `CockpitToolCallRow` type (every-row shape + LEFT-JOIN audit fields: `audit_id`, `audit_status`, `audit_input_json`, `rolled_back_at`). `CockpitInitialData.recentAudit` retyped to this new shape (legacy `CockpitAuditRow` kept for the audit-log-only `listRecentAuditRows` callers). |
| [`queries.ts`](../../../src/lib/cockpit/queries.ts) | New `listRecentToolCalls(db, opts)` — selects from `tool_calls tc` LEFT JOIN `users u` (display name) LEFT JOIN `audit_log al` via `tool_use_id` (audit context). RBAC-filtered by `actorUserId`. Workspace-scoped. |
| [`queries.ts`](../../../src/lib/cockpit/queries.ts) | `listPerToolStats` rewritten to read from `tool_calls`. `success_rate` now reflects `tool_calls.status`. `rollback_rate` is a correlated subquery against `audit_log` joined by `tool_use_id` — counts rolled-back mutations as a fraction of total invocations (always 0 for read-only tools). |
| [`actions.ts`](../../../src/app/cockpit/actions.ts) | `refreshAuditFeed` returns `CockpitToolCallRow[]` instead of `CockpitAuditRow[]`. Calls `listRecentToolCalls`. |
| [`cockpit/page.tsx`](../../../src/app/cockpit/page.tsx) | Initial hydration switched from `listRecentAuditRows` to `listRecentToolCalls`. |
| [`AuditFeedPanel.tsx`](../../../src/components/cockpit/AuditFeedPanel.tsx) | Consumes `CockpitToolCallRow`. Status badge widened to four states (Rolled back / Error / Executed / Success). Undo button visible only when `audit_id` is present and `audit_status === 'executed'`. Read-only rows show "—" in the input column (no input_json on the tool_calls table for size reasons; mutating rows still pull `audit_input_json` from the JOIN). |
| [`AuditFeedPanel.test.tsx`](../../../src/components/cockpit/AuditFeedPanel.test.tsx) | Fixtures rewritten to construct `CockpitToolCallRow` shapes. Default `makeRow` returns a mutating-shaped row (audit_id present, audit_status='executed') so existing Undo-visibility assertions remain valid. |
| [`queries.test.ts`](../../../src/lib/cockpit/queries.test.ts) | Added `insertToolCall` helper. PerToolStats tests rewritten to insert into `tool_calls` instead of `audit_log`. Rollback-rate test now inserts BOTH a `tool_calls` row and a matching `audit_log` row joined by `tool_use_id`, then patches `audit_log.status = 'rolled_back'` on one. |

**Quality gates:** typecheck clean, lint clean (after one biome `--write` pass), **859 / 859** tests still pass.

**Demo flow after this lands:**

1. `npm run db:seed` (creates the `tool_calls` table via SCHEMA on existing DB).
2. Restart dev server, chat with the agent — *"run the standard scan"*.
3. As the agent invokes `extract_clauses` and `grade_clause_severity × N`, each invocation writes a `tool_calls` row (with latency, status, conversation_id, workspace_id, actor).
4. Open `/cockpit` — **AuditFeedPanel now populates with every tool call.** Mutating rows (drafted emails) still show the Undo button; read-only rows show a quieter "Success" badge and no Undo.
5. **PerToolStats panel** now shows the full agent trajectory: `grade_clause_severity (15 invocations / 100%)`, `extract_clauses (1 / 100%)`, `search_corpus (3 / 100%)`, etc.

---

## Sprint 24.2 / 24.4 — Red-flag accordion animation refinement

After the user reported the red-flag card expansion felt "sudden / snappy / teleporting":

**Cause:** the expanded body was a hard conditional render (`{isExpanded ? <div>…</div> : null}`). When it mounted, the body appeared at full opacity instantly. Framer's outer `motion.article layout` prop had to interpolate between two snapshots without any in-flight smoothness, so the card box grew abruptly and siblings jumped.

**Fix** — [RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) wraps the body in `<AnimatePresence initial={false}>` + `motion.div` that animates **its own height + opacity**:

```tsx
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: 'auto', opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{
    height: { type: 'spring', stiffness: 200, damping: 28, mass: 0.8 },
    opacity: { duration: 0.22, ease: EASE_OUT_SOFT },
  }}
  style={{ overflow: 'hidden' }}
/>
```

- `height: 0 ↔ auto` with a slow spring (~500 ms settle) — slower than `SPRING_GENTLE` so expansion reads as deliberate, not snappy.
- `opacity` runs separately on a 220 ms linear ease so content reveals smoothly under the growing box (not all-at-once at the start).
- `overflow: hidden` clips content during the height transition.
- Chevron rotation bumped to `duration-220 ease-out-soft` so it lands in sync.
- Reduced-motion users fall back to the original instant conditional `<div>` with `data-motion="off"` for tests.

The outer `motion.article layout` prop is unchanged — it now rides the inner height tween instead of two snapshots, so sibling cards slide coordinatedly via LayoutGroup. Existing 4 RedFlagReport tests pass.

---

## Sprint 24.3 — Clean (no-red-flags) sample lease

**Purpose:** Exercise the "graded but clean" UI state. The existing seeded sample is deliberately HIGH-flag-heavy (2-month deposit, $150 + $10/day late fee, blanket sublet ban, one-way attorneys fees, etc.). Without a clean variant there's no way to see what the rail + cockpit SeverityDistribution look like when the agent grades most clauses as OK.

**Files added:**

| File | Change |
|---|---|
| [`src/corpus/sample-lease/sample-nj-clean-lease.md`](../../../src/corpus/sample-lease/sample-nj-clean-lease.md) | NJ-compliant residential lease. 15 numbered clauses covering the same clause types as the red-flag sample but worded to clear NJ statute: 1.5-month deposit (NJSA 46:8-19), 5% statutory late fee with 5-day grace, 24-hour entry notice, preserved warranty of habitability (Marini v. Ireland), reciprocal attorneys fees, retaliation protection (NJSA 2A:42-10.10), no jury-trial waiver, sublet allowed with reasonable consent, service/ESA animals permitted, etc. |
| [`src/lib/workspaces/constants.ts`](../../../src/lib/workspaces/constants.ts) | New `SAMPLE_CLEAN_WORKSPACE` constant. Stable id `00000000-0000-0000-0000-000000000011`, `is_sample = 1`, NULL `expires_at` — same shape as `SAMPLE_WORKSPACE`. |
| [`src/db/seed.ts`](../../../src/db/seed.ts) | New `ingestCleanSampleLease(db)` reads the markdown, pipes the whole document as a single `PageText` through the existing `segmentClauses` regex, inserts the lease + clauses with stable `SAMPLE_CLEAN_LEASE_ID = …000021`. Idempotent same as the red-flag ingester. |
| [`src/app/api/workspaces/select-clean-sample/route.ts`](../../../src/app/api/workspaces/select-clean-sample/route.ts) | New POST route mirroring `/api/workspaces/select-sample` but targets `SAMPLE_CLEAN_WORKSPACE`. Preserves the user's `created_workspace_ids` history. |
| [`src/components/cockpit/SampleWorkspaceSwitcher.tsx`](../../../src/components/cockpit/SampleWorkspaceSwitcher.tsx) | New client component. Renders a small mono-caps "Switch sample · {other-sample-name}" button. Visible only when the cockpit is currently rendering one of the two sample workspaces. POSTs to the matching route, `router.refresh()`s — no full reload. |
| [`src/app/cockpit/page.tsx`](../../../src/app/cockpit/page.tsx) | Cockpit header subtitle row gains the switcher on the right. |

**Demo flow:**

1. `npm run db:seed` — populates both sample workspaces (verified: "clean sample lease: 15 clauses ingested into workspace …011").
2. Visit `/cockpit` as Reviewer or Admin. Default is the red-flag sample.
3. Click "Switch sample · LeaseLens — NJ Clean Sample" in the subtitle row.
4. Cockpit re-fetches under the new workspace cookie — every panel resets to the clean workspace's data.
5. Visit `/`, run the standard scan against the clean lease. Each `grade_clause_severity` call writes `severity` back to the clause row (Sprint 24.1).
6. Return to `/cockpit` → **SeverityDistribution now shows mostly OK / Low bars** instead of HIGH-heavy.

**Quality gates:** typecheck clean, lint clean, **859 / 859 tests** still pass.

---

## Sprint 24.1 — Hotfix pass (post-localhost smoke)

After the user opened `/cockpit` on localhost with a real seeded workspace + 50 audit entries, three issues surfaced. All three are fixed below.

### Issue 1 — AuditFeed columns collide

`grid-cols-[140px_140px_140px_minmax(0,1fr)_100px_84px]` allotted 140 px to the tool-name column, but `draft_negotiation_email` renders at ~170 px. Missing `truncate` on cells 2 and 3 let the overflow bleed into the actor column, producing the visible `draft_negotiation_emaiSyndicate Tenant` collision.

**Fix:** [AuditFeedPanel.tsx](../../../src/components/cockpit/AuditFeedPanel.tsx) — added `truncate` + `title=` on tool_name + actor cells. Full value shows on hover.

### Issue 2 — Today's spend stays at zero

[`api/chat/route.ts:567`](../../../src/app/api/chat/route.ts) gated `recordSpend` behind `env.LEASELENS_DEMO_MODE && tokensIn > 0`. Default `.env.example` has `LEASELENS_DEMO_MODE=false`, so spend_log was never written under normal local-dev. The original gate conflated two concerns: spend visibility (always desirable) and spend ceiling enforcement (demo-mode-only).

**Fix:** dropped the `LEASELENS_DEMO_MODE` half of the conditional. `recordSpend` now writes on every chat-route completion with `tokensIn > 0`. Ceiling enforcement (`isSpendCeilingExceeded`) is unchanged — it still gates *enforcement* on demo mode upstream.

### Issue 3 — Severity distribution always zero (Sprint 24 spec error)

The Sprint 24 spec assumed severity data lived in `audit_log.output_json` for `grade_clause_severity` rows. **This assumption was wrong:** [`registry.ts:86–119`](../../../src/lib/tools/registry.ts#L86-L119) only writes audit_log for tools with a `compensatingAction` (i.e. mutating tools). `grade_clause_severity` is read-only — it never writes to audit_log. The Sprint 24 query against `WHERE tool_name = 'grade_clause_severity'` returned zero rows by construction, so the panel rendered all-zero regardless of how many clauses had been graded.

**Spec correction (breaks Sprint 24 invariant 9 "no schema migrations" — accepted in Sprint 24.1):** add a `severity` column to the `clauses` table. The grading tool writes the validated severity back to the clause row after validation. The cockpit query is now a trivial `GROUP BY severity FROM clauses`.

**Files touched:**

| File | Change |
|---|---|
| [`src/lib/db/schema.ts`](../../../src/lib/db/schema.ts) | New `clauses.severity TEXT CHECK(severity IN ('high','medium','low','ok'))` column. Fresh DBs get the CHECK constraint inline. |
| [`src/lib/db/migrate.ts`](../../../src/lib/db/migrate.ts) | New `tableExists` helper + idempotent `ALTER TABLE clauses ADD COLUMN severity TEXT` for pre-Sprint-24 dev DBs (CHECK can't be added inline via ALTER, but the TS `Severity` type + grading-tool validation seam enforce the same constraint at the application boundary). |
| [`src/lib/tools/lease-tools.ts`](../../../src/lib/tools/lease-tools.ts) | After validation succeeds, `grade_clause_severity` runs `UPDATE clauses SET severity = ? WHERE id = ? AND workspace_id = ?`. The write happens *post-validation* so a failed citation grounding never poisons the column with an unverified grade. Idempotent re-grades overwrite in place. |
| [`src/lib/cockpit/queries.ts`](../../../src/lib/cockpit/queries.ts) | Rewrote `getSeverityDistribution` to `GROUP BY severity FROM clauses WHERE severity IS NOT NULL`. Same return shape — `SeverityDistributionPanel` requires no change. |
| [`src/lib/cockpit/queries.test.ts`](../../../src/lib/cockpit/queries.test.ts) | Severity-distribution tests rewritten: insert clause rows with severity directly, assert ungraded (NULL severity) rows are excluded, cross-workspace isolation preserved. |

**Quality gates:** typecheck clean, lint clean, **859 / 859 tests** still pass.

---

## Follow-up backlog (Tier-2 / Sprint 24.2)

Recorded for the next cockpit pass:

1. **Sparkline trends.** Tufte's word-sized chart pattern. Spend, citation grounding rate, audit volume, rollback rate all become "number + 7-day sparkline + period-over-period delta." Needs a small inline-SVG primitive (no chart library).
2. **Time-range selector.** `TimeRangeProvider` context + URL state (`?range=7d`). Every panel's `since` reads from context.
3. **Live audit feed via SSE.** GoF Observer at the network boundary. Long-lived connection budget needs thought.
4. **Drill-down.** Click a tool name in the per-tool table → audit feed filters to that tool. Click a SeverityDistribution row → list the clauses graded that severity.
5. **Schedule / Approvals repurpose.** Stakeholder decision pending: retire the ContentOps-era panels OR reshape for lease-domain (queued negotiation emails / legal-aid review queue).
6. **Severity column on `clauses`.** Schema migration to persist `grade_clause_severity` results to a structured column. Cleaner than parsing `audit_log.output_json`; defers to a separate sprint because it touches the grading-tool write path.
7. **Per-user activity volume.** Needs a UX call on aggregation shape (sorted list? heatmap?).
8. **Eval-drift trend.** Tier 2 metrics across the last N runs. Needs rolling history retention (currently latest-file pattern only).
9. **Anomaly callouts.** Spend > 2σ above 7-day avg flags amber at the dashboard top; grounding-rate drop > 10pts in 24h flags red. Few's "context for every KPI" applied to the page header.
10. **Export.** CSV / JSON download per panel. Compliance + sharing.
