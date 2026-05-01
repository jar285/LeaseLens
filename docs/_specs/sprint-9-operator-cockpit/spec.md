# Spec — Sprint 9: Operator Cockpit Dashboard + Typing Indicator

**Sprint:** 9
**Status:** QA-revised; sprint-QA amended
**Date:** 2026-05-01 (drafted), 2026-05-01 (spec-QA fixes applied), 2026-05-01 (sprint-QA amendments — §12.5 / §12.7 enumerated, §12.12 / §13 / §18 test counts updated to 167)
**Author:** Cascade

---

## 1. Problem Statement

Sprint 8 delivered the data foundations a cockpit needs — `audit_log` rows for every mutating tool call, `content_calendar` rows for scheduled items, `approvals` rows for approved drafts — and the read APIs to surface them ([src/app/api/audit/route.ts](src/app/api/audit/route.ts), [POST /api/audit/[id]/rollback](src/app/api/audit/[id]/rollback/route.ts)). What's missing is an operator-facing surface that pulls those signals into one place. Today an Editor or Admin who wants to see "what has the assistant done lately, what's scheduled, is the eval still green" has no entry point — the data exists but is only reachable transactionally through the chat. Charter Section 5 item 7 (rollback controls) and the v1.6 amendment of charter §16 commit Sprint 9 to closing this gap.

A second, narrower gap surfaced from operator usage of the Sprint 8 build: between submit and first stream chunk (typically 2-3 seconds for Anthropic's first-token latency), the chat appears frozen. The existing "Composing response…" floating overlay at [src/components/chat/ChatUI.tsx:210-217](src/components/chat/ChatUI.tsx#L210-L217) does fire when `status === 'streaming'`, but it is small, centered at the bottom, and visually disconnected from the empty assistant bubble that has just appeared. Operators read the empty bubble as "nothing happened" and re-submit. Charter §16 v1.6 carves a typing indicator into Sprint 9 as a UX-bug fix (not a polish item) so the boundary with Sprint 10's polish pass stays clear.

Sprint 9 closes both gaps in one delivery.

---

## 2. Goals

1. **`/cockpit` route** — a single Operator Cockpit page, server-rendered, RBAC-gated. Editor and Admin see filtered state; Creator (and no-cookie demo visitors) are redirected to `/`.
2. **Audit feed panel** — paginated list of mutating-tool actions, RBAC-filtered identically to `GET /api/audit`. Each row shows tool name, actor (display name with `mcp-server` literal fallback for MCP-originated rows), input summary, status, timestamp, and an Undo button on rows the viewer is authorized to roll back. The Undo path goes through the existing `POST /api/audit/[id]/rollback` — no new mutating surface.
3. **Schedule panel** — current `content_calendar` rows visible to the viewer (Admin: all; Editor: own).
4. **Approvals panel** — recent `approvals` rows (Admin-only — see Section 4.5). History view, not a pending queue (no draft state exists in the data model).
5. **Eval health panel** — most recent `data/eval-reports/golden-*.json`, surfacing pass count / total cases / score / last-run timestamp.
6. **Spend panel** — today's row from `spend_log` (tokens in / tokens out / dollar estimate via the existing `estimateCost` function in [src/lib/db/spend.ts](src/lib/db/spend.ts)).
7. **Typing indicator** — in-bubble three-dot pulse rendered inside the empty assistant message between submit and first stream chunk, *and only when no tool invocation is already underway* (a `<ToolCard>` is the activity signal during tool use). The existing screen-reader `aria-live` announcement at [ChatUI.tsx:199-202](src/components/chat/ChatUI.tsx#L199-L202) is retained for accessibility parity.
8. **Cockpit-link entry point** — header gains a "Cockpit" link visible only to Editor / Admin sessions.

---

## 3. Non-Goals

- **Real-time push.** "Live state" in charter §16 is interpreted as *current at page-load + manual refresh*, not server-sent events or polling. Section 4.4 documents the rationale; Section 14 question #1 commits to it.
- **Pending-approval queue.** The Sprint 8 data model has no draft-pending-approval state (`approve_draft` writes a row when an approval *happens*; nothing tracks "draft awaiting approval"). The Approvals panel shows the *history of approvals*. Building a pending-queue would require a new table + a workflow change to mutating tools and is out of scope.
- **New mutating tools.** The cockpit reads. The only state-changing path is the existing rollback API.
- **Cross-actor analytics.** No charts, no aggregations beyond eval pass-count and today's spend. Sprint 10 is polish, not analytics.
- **New pricing module.** The cockpit reuses the existing `estimateCost` function in [src/lib/db/spend.ts](src/lib/db/spend.ts). A second pricing module (the original spec proposed `src/lib/cockpit/pricing.ts`) would let the cockpit display one number while the daily-spend ceiling check enforces another — a silent divergence.
- **Marketing-style hero / proof-point cards.** Charter §16 v1.6 explicitly excluded these from Sprint 10's polish pass; they are *also* excluded from Sprint 9. The cockpit is a working surface, not a landing page.
- **Visual-regression tooling.** Per charter §16 v1.6 aesthetic-verification policy, TDD covers state and behavior; aesthetics are human-eyeball review. No Chromatic/Percy.
- **Cockpit-side filters or search.** Pagination via the existing `since` cursor is sufficient for the demo. Filter / search is Sprint 10 territory at earliest if it surfaces in operator feedback.
- **`PRAGMA foreign_keys = ON`.** Same posture as Sprint 8 (spec §14 q9). New cockpit reads do not depend on FK enforcement; turning it on is a future hardening sprint.
- **CI Playwright integration.** Same as Sprint 8 — local-only `npm run test:e2e`. CI E2E is later.
- **Header sprint chip.** The chip at [src/app/page.tsx:78-79](src/app/page.tsx#L78-L79) (currently reading `sprint-3`) has not been updated since Sprint 3. Sprint 9 *removes* it rather than re-hardcoding a new value that will rot the same way (see Section 9.1).

---

## 4. Architecture

### 4.1 Cockpit route shape

A new App Router route lives at `src/app/cockpit/`:

| File | Purpose |
|---|---|
| `src/app/cockpit/page.tsx` | Server component. Reads session, redirects on Creator/no-cookie, fetches data via `src/lib/cockpit/queries.ts`, passes initial data into the client `<CockpitDashboard>`. |
| `src/app/cockpit/layout.tsx` | Light shell: header with "← Back to chat" link, page title, `<RoleSwitcher>` like the chat page. |
| `src/components/cockpit/CockpitDashboard.tsx` | Top-level client component. Holds the panels in a 2-column grid on desktop, single-column on mobile. Owns the manual-refresh button and re-fetches data via Server Actions. |

`runtime = 'nodejs'` is declared in `page.tsx` because the server component reads `data/eval-reports/` from disk via `fs.readdirSync` (Section 4.6). Edge runtime would not support this.

### 4.2 RBAC at the cockpit route

The route resolves session identically to the chat page ([src/app/page.tsx:14-33](src/app/page.tsx#L14-L33)):

```typescript
const cookieStore = await cookies();
const sessionCookie = cookieStore.get('contentops_session');
const payload = sessionCookie ? await decrypt(sessionCookie.value) : null;
const role = payload?.role ?? 'Creator';
const userId = payload?.userId ?? DEMO_USERS.find((u) => u.role === 'Creator')?.id;
```

If `role === 'Creator'` (or session-less), the page calls `redirect('/')` (Next.js 16 `redirect` from `next/navigation`) — Creator is the anonymous-demo role per charter §11b and is not an operator. Editor and Admin proceed.

The `CockpitDashboard` client component receives `role` and `userId` as props (read-only) and uses them for client-side query parameters and to gate the visible Undo buttons.

### 4.3 Data sources — direct DB reads on SSR, Server Actions on client refresh

The initial page render reads SQLite directly via helpers in `src/lib/cockpit/queries.ts`:

```typescript
listRecentAuditRows(db, { actorUserId?: string, limit: number }): CockpitAuditRow[]
listScheduledItems(db, { scheduledBy?: string, limit: number }): ScheduledItem[]
listRecentApprovals(db, { approvedBy?: string, limit: number }): ApprovalRecord[]
getTodaySpend(db): SpendSnapshot
```

The `actorUserId` / `scheduledBy` / `approvedBy` filter is `undefined` for Admin (returns all rows) and `userId` for Editor (returns own rows). This mirrors the RBAC predicate in `listAuditRows` at [src/lib/tools/audit-log.ts:64-86](src/lib/tools/audit-log.ts#L64-L86) — keeping the predicate identical between the cockpit query layer and the existing audit API is intentional so a future read-API sprint can collapse them.

**Audit-feed query shape.** `listRecentAuditRows` `LEFT JOIN`s `users` so the panel can show display names instead of opaque user IDs:

```sql
SELECT
  a.*,
  u.display_name AS actor_display_name
FROM audit_log a
LEFT JOIN users u ON u.id = a.actor_user_id
WHERE [actor_user_id filter]
ORDER BY a.created_at DESC
LIMIT @limit
```

`actor_display_name` is `NULL` for MCP-originated rows where `actor_user_id = 'mcp-server'` (Sprint 8 §4.7 — the literal `'mcp-server'` is not present in `users` because FK enforcement is off). The cockpit renders the literal `actor_user_id` (the string `'mcp-server'`) when display name is null. This is correct labeling: operators learn that MCP-driven actions show as `mcp-server`.

**Spend query shape.** `getTodaySpend(db)` issues:

```sql
SELECT date, tokens_in, tokens_out FROM spend_log WHERE date = date('now')
```

Using SQLite's `date('now')` (UTC) here is non-negotiable: the writer at [src/lib/db/spend.ts:32](src/lib/db/spend.ts#L32) uses the same function, so reader and writer agree on what "today" means regardless of the host machine's timezone. Computing today in JavaScript (`new Date().toISOString().slice(0, 10)`) would compute against the host timezone and silently miss the row during US daylight-saving overlap windows.

If no row exists, `getTodaySpend` returns `{ date: '<today via SQLite>', tokens_in: 0, tokens_out: 0, estimated_dollars: 0 }`.

**Client-side refresh.** The `<RefreshButton>` on each panel calls a Server Action in `src/app/cockpit/actions.ts` (Section 8). The cockpit does **not** introduce new HTTP read endpoints. Pagination on the audit feed uses the existing `GET /api/audit?since=...&limit=...` route from Sprint 8 — that route was already designed for cursor pagination and is reused unchanged.

**Why server actions over new GET routes:** The cockpit is a single-page operator surface, not a public API. Creating `GET /api/schedule` and `GET /api/approvals` would expose surfaces with no current consumers other than the cockpit itself, and would duplicate the RBAC predicate already in `queries.ts`. Server Actions co-locate the predicate and the page that uses it.

**Tradeoff acknowledged:** an MCP integration that wanted to surface "scheduled content" would need a separate read API. Out of scope for Sprint 9 — when it surfaces, Sprint 10+ can lift the queries out of `cockpit/actions.ts` into proper API routes.

### 4.4 "Live" interpreted as page-load + manual refresh

Charter §16 names "Live state" but does not commit to a delivery mechanism. Sprint 9 ships:

- **At page load:** SSR snapshot of all panels.
- **Manual refresh:** a `<RefreshButton>` on each panel re-fetches that panel's data via Server Actions; the panel state updates without a full page reload.
- **Optional auto-refresh:** *not in Sprint 9* (see Section 14 question #1).

This honors charter §6 simplicity meta-rule. Polling adds an interval that competes with the chat's NDJSON stream. Server-Sent Events would be a meaningful infrastructure investment with no current consumer beyond a single-user demo. Manual refresh is sufficient and avoids both costs.

### 4.5 Approvals panel — Admin-only history

The Sprint 8 spec ([§6.3](docs/_specs/sprint-8-mutating-tools/spec.md#L297-L312)) defines `approve_draft` with `Roles: ['Admin']`. Editors cannot invoke it; the `approvals` table therefore *never* has rows where `approved_by === editorUserId`. An Editor's RBAC-filtered Approvals panel is structurally always empty.

**Decision:** the Approvals panel is **Admin-only**. Editors do not see it (rendering an always-empty panel is dead UI). `<CockpitDashboard>` conditionally renders `<ApprovalsPanel>` only when `role === 'Admin'`. Editors see AuditFeed + Schedule + EvalHealth + Spend.

The panel's empty state for Admin sessions reads "No approvals recorded yet." (the table genuinely has no rows). It is labeled "Recent approvals" — *history*, not a pending queue.

A queue model would require a new schema column (`status: pending | approved | rejected`), a new mutating tool (`request_approval`), and changes to the chat-side approval flow. Adding all that to surface a UI panel is a scope failure (charter §6 simplicity). Queue model deferred indefinitely; if/when it surfaces in real operator usage, it becomes its own sprint.

### 4.6 Eval health panel — read most recent report from disk

`src/lib/cockpit/eval-reports.ts` exports:

```typescript
export interface EvalHealthSnapshot {
  passedCount: number;        // derived: caseResults.filter(r => r.passed).length
  totalCases: number;         // caseResults.length
  totalScore: number;         // overallScorecard.totalScore
  maxScore: number;           // overallScorecard.maxScore
  lastRunAt: string;          // report.completedAt — when the result became authoritative
  reportPath: string;         // relative path; server-side log only — not exposed to client
}

export function getLatestEvalReport(): EvalHealthSnapshot | null;
```

Implementation:

1. `fs.readdirSync(path.join(process.cwd(), 'data', 'eval-reports'))` (catch ENOENT → return `null`).
2. Filter to `^golden-.*\.json$`.
3. Sort lexicographically descending — the timestamp prefix from [src/lib/evals/reporter.ts:21](src/lib/evals/reporter.ts#L21) (`golden-${startedAt.replace(/[:.]/g, '-')}.json`) is monotonic.
4. `JSON.parse` the first file.
5. Project to `EvalHealthSnapshot`:
    - `passedCount = report.caseResults.filter(r => r.passed).length` (the `EvalRunReport` type at [src/lib/evals/domain.ts:36-44](src/lib/evals/domain.ts#L36-L44) does not expose `passedCount` directly — must derive).
    - `totalCases = report.caseResults.length`.
    - `totalScore = report.overallScorecard.totalScore`, `maxScore = report.overallScorecard.maxScore`.
    - `lastRunAt = report.completedAt`. (Both `startedAt` and `completedAt` exist on the report; `completedAt` is when the result became authoritative — the right field to surface.)

If the directory is missing or empty, the panel shows "No eval runs recorded yet — run `npm run eval:golden`." (Demo-mode constraint: this is expected on a fresh checkout.) The `reportPath` is for server-side logs; the client never receives it.

The panel is **read-only** and reflects whatever `npm run eval:golden` last produced. No "run eval from cockpit" button — running an eval makes Anthropic API calls and would burn the demo quota; it stays a developer-side command.

### 4.7 Spend panel — reuse existing `estimateCost`

Reads today's row from `spend_log` (table from [src/lib/db/schema.ts:27-31](src/lib/db/schema.ts#L27-L31)) — keyed on `date TEXT PRIMARY KEY` matching SQLite's `date('now')` UTC format (Section 4.3). Surface:

- `tokens_in`
- `tokens_out`
- `estimated_dollars` — computed via `estimateCost(tokens_in, tokens_out)` from [src/lib/db/spend.ts:7-13](src/lib/db/spend.ts#L7-L13). This is the **same function** the chat route uses to enforce the daily-spend ceiling at [src/lib/db/spend.ts:15-28](src/lib/db/spend.ts#L15-L28); keeping the cockpit display and the ceiling check on a single function prevents silent divergence.

The pricing constants (`HAIKU_INPUT_COST_PER_MTOK = 0.8`, `HAIKU_OUTPUT_COST_PER_MTOK = 4.0`) live where they already do — in `spend.ts`. Sprint 9 adds a one-line citation comment above them pointing to https://www.anthropic.com/pricing so the operator-editable single source of truth is self-documenting. No new pricing module is created.

If no row exists for today, the panel shows zeros. No multi-day chart in Sprint 9.

### 4.8 Audit feed panel — RBAC-filtered, paginated, with Undo

Reuses the existing audit-log mechanics:

- Initial render: SSR `listRecentAuditRows(db, { actorUserId: rbacFilter, limit: 50 })`.
- Pagination: "Load more" button calls `GET /api/audit?since=<oldest>&limit=50` (the existing route — Section 4.3).
- Undo: the existing `POST /api/audit/[id]/rollback`. Sprint 8's `ToolCard` component runs the same Undo state machine in the chat — the cockpit's row component **borrows the state-machine logic** but renders it as a table cell rather than a card. Both share a small hook in `src/lib/audit/use-rollback.ts`:

```typescript
export function useRollback(auditId: string | undefined): {
  status: 'idle' | 'rolling_back' | 'rolled_back' | 'rollback_failed';
  rollback: () => Promise<void>;
};
```

The hook lives at `src/lib/audit/`, **not** under `cockpit/`, because both the chat (`ToolCard`) and the cockpit (`AuditFeedPanel`) consume it; the chat shouldn't depend on a cockpit module. `src/lib/audit/` is a new folder reserved for audit-log domain code. Sprint 9 does not move the existing `markRolledBack` / `getAuditRow` / `listAuditRows` from [src/lib/tools/audit-log.ts](src/lib/tools/audit-log.ts) — that's a follow-up — but the new hook lands at the correct neighborhood from the start.

`ToolCard.tsx` is refactored to use this hook in the same sprint (it currently has the state inline at [src/components/chat/ToolCard.tsx:20-50](src/components/chat/ToolCard.tsx#L20-L50)). This is a small de-duplication, not a refactor sprint — the hook is ~30 lines and replaces ~30 lines of inline state.

**`ToolInvocation` interface dedup.** While extracting `useRollback`, Sprint 9 also deletes the local `ToolInvocation` interface in `ToolCard.tsx` (lines 6-14) and imports the exported one from `ChatMessage.tsx` (lines 5-15). Both interfaces agree today; two copies risk silent drift in future sprints. This is a small cleanup aligned with the `useRollback` extraction; it does not expand Sprint 9 scope materially.

**RBAC on Undo button visibility (cockpit):**

- Admin: Undo button on every `executed` row.
- Editor: Undo button on `executed` rows where `actor_user_id === userId`.
- Rolled-back rows: no Undo button; row shows "Rolled back at <ts>" instead.

This mirrors the [Sprint 8 §4.4 audit-ownership policy P1](docs/_specs/sprint-8-mutating-tools/spec.md#L137-L154). The rollback API itself enforces the same policy, so a stale visible button (e.g., role-overlay flipped after page render) returns 403 and the row goes into an error state — no integrity risk.

### 4.9 Typing indicator

A new `<TypingIndicator />` component renders three small dots that pulse with staggered animation delays. Mounted inside the assistant bubble when **all** of the following are true:

```
isStreaming && role === 'assistant' && !content && (toolInvocations === undefined || toolInvocations.length === 0)
```

The fourth clause is critical. ContentOps's chat already streams `tool_use` events that arrive *before* any text chunk — see [ChatUI.tsx:118-135](src/components/chat/ChatUI.tsx#L118-L135). When a `tool_use` arrives, the assistant message's `content` is still `''` but `toolInvocations.length > 0`. Without the fourth clause, the TypingIndicator would render *simultaneously* with the `<ToolCard>` — three pulsing dots above a Running… ToolCard. The ToolCard is already the "assistant is doing something" signal during tool use; the indicator is for the *pre-tool-use, pre-text-chunk* gap only.

`<ChatTranscript>` determines `isStreamingThisMessage` by passing `isStreaming && index === messages.length - 1 && msg.role === 'assistant'` to each rendered `<ChatMessage>`. The transcript component already declares `isStreaming?: boolean` ([ChatTranscript.tsx:7](src/components/chat/ChatTranscript.tsx#L7)) and already receives it from `<ChatUI>` at [ChatUI.tsx:207](src/components/chat/ChatUI.tsx#L207); the gap is that the component body destructures only `messages` ([line 10](src/components/chat/ChatTranscript.tsx#L10)) and never reads `isStreaming`. Sprint 9 destructures and threads it.

`<ChatMessage>` gains an `isStreaming?: boolean` prop. When the four-clause condition above is satisfied, render `<TypingIndicator />` in place of the (currently invisible) empty-content branch. As soon as the first chunk arrives (`content !== ''`) or a tool invocation appears (`toolInvocations.length > 0`), the indicator unmounts. No state internal to `ChatMessage`; the parent owns lifecycle.

The existing floating "Composing response…" overlay at [ChatUI.tsx:210-217](src/components/chat/ChatUI.tsx#L210-L217) **is removed** in this sprint. Reason: it was an awkward stand-in for the missing typing indicator. With a proper in-bubble indicator the overlay is redundant and visually noisy. The screen-reader `aria-live` announcement at [ChatUI.tsx:199-202](src/components/chat/ChatUI.tsx#L199-L202) stays — it is the accessibility surface for the same signal and was always meant for screen readers, not sighted users.

**Animation specifics.** Three `<span>` elements with `animate-bounce` (Tailwind 4 default — verified in `node_modules/tailwindcss/theme.css`) and staggered `animationDelay: 0ms / 150ms / 300ms` via inline style. No new CSS, no new Tailwind plugin. Disappears when first chunk or tool invocation arrives; the unmount is instant (no exit animation — keeping it tight).

### 4.10 Cockpit-link entry point in header

[src/app/page.tsx:62-80](src/app/page.tsx#L62-L80) renders the chat-page header. Sprint 9 adds a "Cockpit" link next to the existing logo, visible only when `currentRole !== 'Creator'`. Editor and Admin see it; demo visitors do not. The link uses Next.js 16 `<Link href="/cockpit">`.

The cockpit page's own header has the inverse: a "← Chat" link back to `/`.

### 4.11 What does *not* change

- The chat NDJSON stream contract (`tool_use`, `tool_result`, `chunk`, `error`, `quota`, `conversationId`).
- `ToolCard.tsx`'s observable behavior — only its internal state-machine implementation is refactored to use `useRollback` (Section 4.8); render output and props are unchanged. The local `ToolInvocation` interface in `ToolCard.tsx` is deleted in favor of importing the exported one from `ChatMessage.tsx`, but the interface contents are byte-identical so no consumer change.
- The `audit_log`, `content_calendar`, `approvals`, `spend_log` tables — read-only from Sprint 9's perspective.
- `src/lib/tools/registry.ts` — no registry changes. The cockpit reads through helpers; mutating writes (Undo) flow through the existing rollback API which already goes through the registry's compensating-action path.
- `mcp/contentops-server.ts` — no MCP changes. Cockpit is HTTP-only.
- The eval harness — `npm run eval:golden` continues to pass 5/5; the cockpit only *reads* its output.
- `estimateCost` and the pricing constants in [src/lib/db/spend.ts](src/lib/db/spend.ts) — Sprint 9 reuses them and adds only a one-line citation comment above the constants.

---

## 5. Domain types

All new types live in `src/lib/cockpit/types.ts`:

```typescript
import type { AuditLogEntry } from '@/lib/tools/domain';
import type { Role } from '@/lib/auth/types';

// Cockpit projection of audit_log rows — augments the existing AuditLogEntry
// with the LEFT JOIN result. The base AuditLogEntry in src/lib/tools/domain.ts
// is unchanged (Sprint 8 ABI preserved).
export interface CockpitAuditRow extends AuditLogEntry {
  /** From LEFT JOIN users. NULL for rows whose actor_user_id has no match —
   *  notably MCP-originated rows where actor_user_id = 'mcp-server'.
   *  Cockpit panel falls back to rendering actor_user_id literal in that case. */
  actor_display_name: string | null;
}

export interface ScheduledItem {
  id: string;
  document_slug: string;
  scheduled_for: number;     // Unix seconds, per Sprint 8 §6.1
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
  date: string;              // YYYY-MM-DD as written by SQLite date('now') (UTC)
  tokens_in: number;
  tokens_out: number;
  estimated_dollars: number; // computed via estimateCost from src/lib/db/spend.ts
}

export interface EvalHealthSnapshot {
  passedCount: number;
  totalCases: number;
  totalScore: number;
  maxScore: number;
  lastRunAt: string;         // report.completedAt (ISO 8601)
  reportPath: string;        // server-side log only
}

export interface CockpitInitialData {
  recentAudit: CockpitAuditRow[];
  scheduled: ScheduledItem[];
  approvals: ApprovalRecord[]; // empty array (panel hidden) for Editor sessions
  evalHealth: EvalHealthSnapshot | null;
  spend: SpendSnapshot;
  role: Role;
  userId: string;
}
```

`AuditLogEntry` is the existing type from [src/lib/tools/domain.ts](src/lib/tools/domain.ts) — re-imported, not re-declared. The cockpit-specific projection is `CockpitAuditRow` (extends `AuditLogEntry` with `actor_display_name`).

There is **no** `src/lib/cockpit/pricing.ts`. The dollar estimate uses `estimateCost(tokens_in, tokens_out)` from [src/lib/db/spend.ts](src/lib/db/spend.ts); see Section 4.7.

---

## 6. Cockpit panels — UI behavior

### 6.1 `<CockpitDashboard>`

Top-level client component. Layout: 2-column grid on `lg:` and above (left column: AuditFeed, right column stack: SpendPanel + EvalHealthPanel + SchedulePanel + ApprovalsPanel-if-Admin). Single column below `lg:`. Each child panel is a self-contained component with its own refresh state. The `<ApprovalsPanel>` is conditionally rendered only when `role === 'Admin'` (Section 4.5).

### 6.2 `<AuditFeedPanel>`

Renders a table-like list. Columns: timestamp, tool, actor, input summary (one-line truncation of `input_json`), status badge, Undo button.

The **actor column** renders `actor_display_name` when present, otherwise the literal `actor_user_id` string. For MCP-originated rows where `actor_user_id = 'mcp-server'`, this falls back to displaying `mcp-server` — correct labeling.

Status badge:
- `executed` → green pill
- `rolled_back` → gray pill with "Rolled back" + relative time

Pagination: "Load more" button at the bottom calls `GET /api/audit?since=<oldest_created_at>&limit=50`. Initial SSR returns 50; subsequent loads append.

Empty state: "No tool actions recorded yet."

### 6.3 `<SchedulePanel>`

Renders a list of `ScheduledItem` rows ordered by `scheduled_for ASC` (next-up first). Columns: scheduled_for (formatted as local date+time), channel, document_slug, scheduled_by.

Empty state: "Nothing scheduled."

### 6.4 `<ApprovalsPanel>` — Admin-only

Renders a list of `ApprovalRecord` rows ordered by `created_at DESC`. Columns: created_at, document_slug, approved_by, notes (truncated). Visible **only to Admin sessions** (Section 4.5). Editors do not see this panel; their `<CockpitDashboard>` skips its render entirely.

Empty state: "No approvals recorded yet."

### 6.5 `<EvalHealthPanel>`

If snapshot is `null`: "No eval runs recorded yet — run `npm run eval:golden`."

Otherwise: large "<passedCount> / <totalCases> passed" headline, secondary line "<totalScore.toFixed(1)> / <maxScore.toFixed(1)> points • <relative time of lastRunAt>" (where `lastRunAt` is `report.completedAt`). Color: green when `passedCount === totalCases`, amber otherwise.

### 6.6 `<SpendPanel>`

Three small stats: `tokens_in`, `tokens_out`, `≈ $<estimated_dollars.toFixed(4)>` — where `estimated_dollars` was computed via `estimateCost` (Section 4.7). Date-stamped with today's `date('now')` value.

### 6.7 `<RefreshButton>`

A small icon button in each panel header. Calls the relevant server action; sets the panel's local state to a loading shimmer for the duration of the call (typically <100ms for SQLite).

---

## 7. Typing indicator — UI behavior

`<TypingIndicator />` lives at `src/components/chat/TypingIndicator.tsx`. ~30 lines including JSX:

```tsx
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is composing"
      className="flex items-center gap-1.5 py-2"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
```

`role="status"` + `aria-label` keep accessibility parity with the `aria-live` region in `ChatUI` (which is retained — see Section 4.9). Tests assert both the visual presence (3 `<span>`s, `animate-bounce`) and the accessibility attributes.

The indicator unmounts as soon as `content !== ''` **or** a tool invocation appears (Section 4.9 four-clause condition). The transition is unstyled — content (or the ToolCard) replaces dots in the same DOM position.

---

## 8. Server actions

`src/app/cockpit/actions.ts`:

```typescript
'use server';

export const runtime = 'nodejs';

export async function refreshAuditFeed(opts: { since?: number; limit?: number }): Promise<{ entries: CockpitAuditRow[]; nextSince: number | null }>;
export async function refreshSchedule(opts: { limit?: number }): Promise<{ items: ScheduledItem[] }>;
export async function refreshApprovals(opts: { limit?: number }): Promise<{ items: ApprovalRecord[] }>;
export async function refreshSpend(): Promise<{ spend: SpendSnapshot }>;
export async function refreshEvalHealth(): Promise<{ snapshot: EvalHealthSnapshot | null }>;
```

**Explicit `runtime = 'nodejs'`** is declared on the actions module alongside `'use server'`. This is defensive: server actions inherit runtime from their importing route segment, so today the cockpit-page declaration covers the actions; explicit declaration on the actions module future-proofs against a different page (e.g., an embedded widget) importing them and inheriting edge runtime.

Each action:

1. Resolves session (same as the cockpit page — Section 4.2).
2. **If `role === 'Creator'`, throws (returned as a server-action error). This check is the primary security boundary, not defense-in-depth.** Server actions in Next.js 16 are invocable from any authenticated client that has the action ID; a Creator session cookie + JS console is sufficient to attempt a call. The cockpit page's redirect prevents only visual access. Each action's role check is therefore the only thing standing between a Creator session and cross-actor audit data — `refreshAuditFeed` without this check would, with the existing `listRecentAuditRows` filter behavior under `actorUserId: undefined`, return all rows.
3. Calls the corresponding helper in `src/lib/cockpit/queries.ts` with the RBAC filter applied (`actorUserId: undefined` for Admin; `actorUserId: userId` for Editor).
4. Returns the projected payload.

`refreshApprovals` additionally throws on `role === 'Editor'` — the panel is Admin-only (Section 4.5), so an Editor invoking this action is either UI drift or a probe; either way the answer is to refuse rather than return an empty array (which would mask the misuse).

Server actions in Next.js 16 — the `'use server'` directive at the top of a module exports each function as an RPC endpoint. Next.js 16 verified via Context7 (see Section 16) — the `'use server'` directive shape is unchanged from Next.js 15.

---

## 9. UI changes summary

### 9.1 `src/app/page.tsx`

- Add a `<Link href="/cockpit">` next to the existing logo in the header, visible only when `currentRole !== 'Creator'`.
- **Remove** the existing `sprint-3` chip at [page.tsx:78-79](src/app/page.tsx#L78-L79). The chip has not been updated since Sprint 3 (5 sprints of drift); rather than re-hardcoding `sprint-9` for the same outcome, the chip is dropped. The spec doc tracks current sprint; the homepage chip serves no operator function.

### 9.2 `src/components/chat/ChatTranscript.tsx`

Destructure `isStreaming` from props (currently received but ignored) and pass it to the last `<ChatMessage>` only:

```tsx
export function ChatTranscript({ messages, isStreaming }: ChatTranscriptProps) {
  // ...
  {messages.map((msg, idx) => (
    <ChatMessage
      key={msg.id}
      {...msg}
      isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
    />
  ))}
}
```

### 9.3 `src/components/chat/ChatMessage.tsx`

Add `isStreaming?: boolean` to props. Branch the content render with the four-clause condition from Section 4.9:

```tsx
{!content && isStreaming && role === 'assistant' && (!toolInvocations || toolInvocations.length === 0) ? (
  <TypingIndicator />
) : content ? (
  isUser ? content : renderMarkdown(content)
) : null}
```

### 9.4 `src/components/chat/ChatUI.tsx`

- Remove the floating "Composing response…" overlay block at [lines 210-217](src/components/chat/ChatUI.tsx#L210-L217).
- The `isStreaming` prop is already passed to `<ChatTranscript>` at [line 207](src/components/chat/ChatUI.tsx#L207); no change there. (The original spec text mistakenly described this prop as "not passed" — it has been passed since Sprint 1; the gap was solely that `<ChatTranscript>` ignored it. Sprint 9 fixes the consumer side.)
- The screen-reader `aria-live` block at lines 199-202 stays.

### 9.5 `src/components/chat/ToolCard.tsx`

- Replace the inline rollback state machine (introduced in Sprint 8 at [lines 20-50](src/components/chat/ToolCard.tsx#L20-L50)) with a call to the new `useRollback` hook in `src/lib/audit/use-rollback.ts`.
- Remove the local `ToolInvocation` interface duplicate at [lines 6-14](src/components/chat/ToolCard.tsx#L6-L14); import the exported one from `ChatMessage.tsx`.
- Render output and observable props unchanged. This is a Section 4.8 de-duplication, not a public-API change.

---

## 10. New API / route surface

| Route | Method | Notes |
|---|---|---|
| `/cockpit` | GET (page) | Server-rendered; redirects Creator/no-cookie to `/`. |
| Server actions in `src/app/cockpit/actions.ts` | POST (RPC) | `refreshAuditFeed`, `refreshSchedule`, `refreshApprovals` (Admin-only), `refreshSpend`, `refreshEvalHealth`. |

No new `route.ts` files. The existing `GET /api/audit` and `POST /api/audit/[id]/rollback` are reused unchanged.

---

## 11. File inventory

### Created

| File | Purpose |
|---|---|
| `src/app/cockpit/page.tsx` | Server-rendered cockpit entry point with RBAC gate |
| `src/app/cockpit/page.test.tsx` | RBAC redirect + initial-render integration tests |
| `src/app/cockpit/layout.tsx` | Cockpit shell |
| `src/app/cockpit/actions.ts` | Server actions for each panel's refresh; explicit `runtime = 'nodejs'` |
| `src/app/cockpit/actions.test.ts` | RBAC + return-shape tests for each action |
| `src/components/cockpit/CockpitDashboard.tsx` | Top-level client component; conditionally renders ApprovalsPanel for Admin |
| `src/components/cockpit/AuditFeedPanel.tsx` | Audit feed with Undo (consumes `useRollback`) |
| `src/components/cockpit/AuditFeedPanel.test.tsx` | Renders rows, Undo state machine, mcp-server fallback |
| `src/components/cockpit/SchedulePanel.tsx` | Scheduled items list |
| `src/components/cockpit/SchedulePanel.test.tsx` | Empty + populated render |
| `src/components/cockpit/ApprovalsPanel.tsx` | Approval history list (Admin sessions only) |
| `src/components/cockpit/ApprovalsPanel.test.tsx` | Empty + populated render; verifies Admin-only render guard |
| `src/components/cockpit/EvalHealthPanel.tsx` | Eval health surface |
| `src/components/cockpit/EvalHealthPanel.test.tsx` | Empty + green + amber states |
| `src/components/cockpit/SpendPanel.tsx` | Today's spend surface |
| `src/components/cockpit/SpendPanel.test.tsx` | Zero + populated states |
| `src/components/cockpit/RefreshButton.tsx` | Shared refresh-button micro-component |
| `src/components/chat/TypingIndicator.tsx` | Three-dot typing indicator |
| `src/components/chat/TypingIndicator.test.tsx` | Renders + a11y attributes |
| `src/components/chat/ChatMessage.test.tsx` | Three tests for `isStreaming` + `<TypingIndicator>` four-clause condition (file did not exist pre-Sprint-9) |
| `src/lib/audit/use-rollback.ts` | Rollback state-machine hook (extracted from ToolCard) |
| `src/lib/audit/use-rollback.test.ts` | State transitions and error handling |
| `src/lib/cockpit/queries.ts` | RBAC-aware DB read helpers (LEFT JOIN users on audit; `date('now')` on spend) |
| `src/lib/cockpit/queries.test.ts` | RBAC predicate tests + JOIN return-shape + spend round-trip |
| `src/lib/cockpit/eval-reports.ts` | `getLatestEvalReport()` filesystem reader |
| `src/lib/cockpit/eval-reports.test.ts` | Empty / single-report / multi-report cases |
| `src/lib/cockpit/types.ts` | `CockpitAuditRow`, `ScheduledItem`, `ApprovalRecord`, `SpendSnapshot`, `EvalHealthSnapshot`, `CockpitInitialData` |
| `tests/e2e/cockpit-dashboard.spec.ts` | Playwright smoke: SSR cockpit, click Refresh, click Undo |

### Modified

| File | Change |
|---|---|
| `src/app/page.tsx` | Add Cockpit link in header (Editor/Admin only); **remove** the `sprint-3` chip entirely |
| `src/components/chat/ChatTranscript.tsx` | Destructure `isStreaming` (already received but ignored); pass to last assistant message |
| `src/components/chat/ChatMessage.tsx` | Add `isStreaming?` prop; render `<TypingIndicator>` when empty + streaming + no tool invocations |
| `src/components/chat/ChatUI.tsx` | Remove floating "Composing response…" overlay |
| `src/components/chat/ToolCard.tsx` | Consume `useRollback` hook; remove local `ToolInvocation` interface duplicate; import from `ChatMessage.tsx` |
| `src/lib/db/spend.ts` | Add a one-line citation comment above `HAIKU_*_COST_PER_MTOK` constants pointing to https://www.anthropic.com/pricing. No constant value change. |

### Deleted

None. Sprint 9 is purely additive on the chat side and read-only on the data side.

---

## 12. Testing strategy

### 12.1 Unit — `TypingIndicator` (~2)

1. Renders three `<span>`s with `animate-bounce` and the expected staggered delays (0/150/300ms).
2. `role="status"` + `aria-label="Assistant is composing"` present.

### 12.2 Unit — `eval-reports.ts` (~3)

1. Returns `null` when `data/eval-reports/` does not exist (ENOENT).
2. Returns `null` when the directory exists but has no `golden-*.json` files.
3. Returns the lexicographically-greatest file's projection when multiple exist (verifies `passedCount` derivation, `lastRunAt = completedAt`).

### 12.3 Unit — `use-rollback.ts` (~3)

1. Initial state is `idle`.
2. Successful POST transitions `idle → rolling_back → rolled_back`.
3. Failed POST transitions `idle → rolling_back → rollback_failed`, with retry returning to `idle`.

### 12.4 Integration — `queries.ts` (~5)

1. `listRecentAuditRows` with no filter returns all rows DESC by `created_at`; `actor_display_name` is null for `actor_user_id` not present in `users` (verifies LEFT JOIN return shape).
2. `listRecentAuditRows` with `actorUserId` filters correctly.
3. `listScheduledItems` orders by `scheduled_for ASC`.
4. `listRecentApprovals` orders by `created_at DESC`.
5. `getTodaySpend` writer/reader round-trip: `recordSpend(N, M)` followed by `getTodaySpend()` returns matching values; with no row, returns zeros. Both sides use SQL `date('now')`.

### 12.5 Integration — server actions (~4)

1. `refreshAuditFeed` with Admin session: returns all rows.
2. `refreshAuditFeed` with Editor session: returns only own rows.
3. `refreshAuditFeed` with Creator session: throws (and `refreshSchedule`, `refreshSpend`, `refreshEvalHealth` likewise on Creator) — exercises the `requireOperator` gate.
4. `refreshApprovals` with Editor session: throws — distinct from #3 because this exercises the `requireAdmin` gate (Admin-only), not `requireOperator`.

### 12.6 Integration — `/cockpit` page (~4)

1. No-cookie request: redirects to `/`.
2. Editor session: renders the dashboard with own-rows-only data; Approvals panel absent.
3. Admin session: renders the dashboard with cross-actor data; Approvals panel present.
4. Creator session (cookie decrypts to `role: 'Creator'`): redirects to `/`. Distinct from #1 — exercises the role-check branch, not the no-cookie default branch.

### 12.7 Component — Panel render (~11)

Per-panel, with each test exercising one observable state (sprint-QA M2 — the original 5-test bundle was awkward and omitted SpendPanel coverage entirely).

**AuditFeedPanel** (2)
1. Empty state renders "No tool actions recorded yet."
2. Populated state shows Undo for executed rows the viewer owns; falls back to literal `actor_user_id` when display name is null (mcp-server fallback).

**SchedulePanel** (2)
3. Empty state renders "Nothing scheduled."
4. Populated state renders the four columns (scheduled_for, channel, document_slug, scheduled_by).

**ApprovalsPanel** (2)
5. Empty state renders "No approvals recorded yet."
6. Populated state renders rows. (The Admin-only render guard is asserted in §12.6 page tests, not panel tests — the panel itself does not enforce it.)

**EvalHealthPanel** (3)
7. Null snapshot → "No eval runs recorded yet" empty message.
8. Populated all-passed (`passedCount === totalCases`) → green badge + headline.
9. Populated some-failed → amber badge + headline.

**SpendPanel** (2)
10. Zero state renders "0", "0", "≈ $0.0000".
11. Populated state renders the three numbers from the snapshot.

### 12.8 Component — chat render with TypingIndicator (~3)

1. `<ChatMessage role="assistant" content="" isStreaming />` (no tool invocations) renders `<TypingIndicator>`.
2. `<ChatMessage role="assistant" content="hi" isStreaming />` renders the markdown content, not the indicator.
3. `<ChatMessage role="assistant" content="" isStreaming toolInvocations=[<one running ToolCard>] />` does **not** render `<TypingIndicator>` — the ToolCard alone is the activity signal. (Section 4.9 four-clause condition.)

### 12.9 E2E — `tests/e2e/cockpit-dashboard.spec.ts` (~1)

1. Sign Admin cookie, navigate to `/cockpit`, assert each panel header is visible, click an Undo on a seeded executed row, assert it transitions to "Rolled back". Local dev server only.

### 12.10 E2E — typing indicator covered by existing chat-tool-use spec

The Sprint 8 E2E spec at `tests/e2e/chat-tool-use.spec.ts` covers chat → tool_use → ToolCard render. Sprint 9 adds an assertion to that existing spec: between submit and first chunk, `[role="status"][aria-label="Assistant is composing"]` is present. No new E2E file required for the typing indicator — it's an in-flow assertion.

### 12.11 Eval

`npm run eval:golden` continues to pass 5/5. No retrieval surface changed.

### 12.12 Counts

| Category | Sprint 8 baseline | New | Sprint 9 target |
|---|---:|---:|---:|
| Vitest unit + integration + component | 132 | +35 | 167 |
| Playwright E2E specs | 1 | +1 | 2 |
| Eval (golden) | 5/5 | 0 | 5/5 |

The 35-test net subtotal: 2 (TypingIndicator) + 3 (eval-reports) + 3 (use-rollback) unit + 5 (queries) + 4 (server actions) + 4 (page) integration + 11 (5 panels) + 3 (chat render) component = 35. Counts revised after sprint-QA M2 — original spec bundled empty/populated/special-case into shared `it()` blocks (5 panel tests total) and omitted SpendPanel; the realistic per-state allocation is 11 across all five panels, and §12.5 splits Creator-throws vs Editor-throws-on-Approvals into two tests (4 actions tests, not 3).

Characterization-test discipline (Sprint 8 §10.3 pattern): the existing `ToolCard.test.tsx` is run before AND after the `useRollback` extraction; assertion outputs must be byte-identical. The `useRollback` extraction does not change the rollback-related test count in `ToolCard.test.tsx` (the inline state was tested via DOM behavior; after extraction, the same DOM behavior tests through the same component, with three new direct hook tests added under `use-rollback.test.ts`).

---

## 13. Acceptance criteria

- `src/app/cockpit/page.tsx` — present; redirects Creator (with or without cookie) and no-cookie to `/`; renders the dashboard for Editor/Admin.
- `src/app/cockpit/actions.ts` — five server actions exported; explicit `runtime = 'nodejs'`; each enforces RBAC as primary boundary (not defense-in-depth).
- `src/lib/cockpit/queries.ts` — RBAC-aware read helpers present; audit-row helper LEFT JOINs `users`; spend helper uses SQL `date('now')`.
- `src/lib/cockpit/eval-reports.ts` — `getLatestEvalReport()` exported; handles missing directory gracefully; `lastRunAt = completedAt`; `passedCount` derived from `caseResults`.
- `src/lib/audit/use-rollback.ts` — hook exported; both `ToolCard.tsx` and `<AuditFeedPanel>` consume it.
- `src/components/cockpit/*` — all six panels + dashboard component present; ApprovalsPanel rendered only for Admin.
- `src/components/chat/TypingIndicator.tsx` — present; rendered by `ChatMessage` only when empty + streaming + no tool invocations.
- `src/components/chat/ChatUI.tsx` — floating "Composing response…" overlay removed.
- `src/components/chat/ChatTranscript.tsx` — destructures `isStreaming` and threads it.
- `src/components/chat/ToolCard.tsx` — consumes `useRollback`; local `ToolInvocation` duplicate removed.
- `src/app/page.tsx` — Cockpit link present for Editor/Admin; `sprint-3` chip removed.
- `src/lib/db/spend.ts` — pricing-source citation comment added; no constant value change.
- RBAC matrix verified end-to-end:
  - Creator (with cookie) and no-cookie: `/cockpit` redirects to `/`. The header on `/` does not show the Cockpit link.
  - Editor: `/cockpit` renders; sees own audit / scheduled only; Approvals panel absent; can Undo own audit rows.
  - Admin: `/cockpit` renders; sees all rows; Approvals panel present; can Undo any row.
  - Direct call to a server action with Creator session throws.
  - Direct call to `refreshApprovals` with Editor session throws.
- `tests/e2e/cockpit-dashboard.spec.ts` — present and passing locally.
- `tests/e2e/chat-tool-use.spec.ts` — extended with the typing-indicator assertion; still passing.
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors (Sprint 7-era pre-existing format issues remain documented as out-of-scope debt — not Sprint 9's to fix).
- `npm run test` — ≥ 167 passing (132 baseline + 35 new).
- `npm run test:e2e` — 2 specs passing locally.
- `npm run eval:golden` — 5/5 passing (no regression).
- `npm run mcp:server` — still starts without error.

---

## 14. Open questions (pre-decided)

| # | Question | Decision |
|---|---|---|
| 1 | Should the cockpit auto-refresh, or is manual-refresh enough? | **Manual refresh.** Polling competes with the chat NDJSON stream; SSE is infrastructure overkill for a single-user demo. Section 4.4 documents the rationale. Auto-refresh becomes a Sprint 10+ polish question if it surfaces. |
| 2 | New HTTP routes for Schedule / Approvals / Spend, or Server Actions? | **Server Actions.** No current consumer beyond the cockpit; routes would duplicate the RBAC predicate. Section 4.3 documents the tradeoff for future MCP consumers. |
| 3 | Should the cockpit have a "Run eval" button? | **No.** Eval runs make Anthropic API calls; running from a UI surface burns demo quota. Stays a developer-side `npm run eval:golden`. |
| 4 | Approvals panel — pending queue or history? | **History only, Admin-only.** No draft-pending-approval state in the data model (Section 4.5). `approve_draft` is Admin-only; an Editor's filtered Approvals panel is structurally always empty, so the panel is hidden for Editors entirely. |
| 5 | Should the typing indicator have an exit animation? | **No.** First chunk (or tool invocation) replaces the indicator instantly. Tight is better than animated for this signal. Polish-style transitions are Sprint 10. |
| 6 | Should we keep the "Composing response…" floating overlay alongside the in-bubble typing indicator? | **Remove the overlay.** It was a stand-in for the missing in-bubble indicator. With the indicator in place the overlay is redundant. The screen-reader `aria-live` block stays — that's the a11y surface. If post-impl QA reveals scrolled-up chats miss the in-bubble indicator, restoring the overlay is a 7-line additive revert (§17). |
| 7 | Should the cockpit show *all* spend (cumulative), or just today? | **Today only.** Multi-day chart = analytics scope. Cumulative is "interesting" but not "operator action". Today's spend tells the operator whether they have headroom; that's the operator question. |
| 8 | Should `/cockpit` exist as a link only for sessions with a real cookie, or also for the demo-Creator anonymous role? | **Editor / Admin only.** Creator is anonymous demo per charter §11b; the cockpit is an operator tool. Showing a link that redirects on click is worse UX than not showing it. |
| 9 | Should the audit-feed Undo button reuse the chat-side `ToolCard` Undo, or be its own implementation? | **Extracted shared hook (`useRollback`) under `src/lib/audit/`.** Both sites consume the hook; render output differs (table cell vs card body). The hook's home is `src/lib/audit/`, not `src/lib/cockpit/`, because the chat shouldn't depend on a cockpit module. |
| 10 | Pricing constants — new module or reuse existing? | **Reuse existing `estimateCost` in `src/lib/db/spend.ts`.** Creating a parallel pricing module would let the cockpit display one number while the daily-spend ceiling check enforces another — a silent divergence. Sprint 9 adds only a one-line citation comment above the existing constants. |
| 11 | What does `lastRunAt` derive from in the eval-health panel? | **`report.completedAt`** — when the result became authoritative. `startedAt` is for debugging; not surfaced to the cockpit. |
| 12 | Hardcode the header sprint chip to `sprint-9`, or remove it? | **Remove.** The chip has been stuck at `sprint-3` since Sprint 3; updating it once doesn't fix the rot pattern. The spec doc tracks current sprint; the chip serves no operator function. |

---

## 15. Reference alignment

| Borrowed pattern | Source | Adaptation |
|---|---|---|
| RBAC-gated admin layout shell | [docs/_references/ai_mcp_chat_ordo/src/app/admin/layout.tsx](docs/_references/ai_mcp_chat_ordo/src/app/admin/layout.tsx) | Ordo's admin shell uses `requireAdminPageAccess` and a complex skip-link / scroll-region structure. ContentOps's `cockpit/layout.tsx` is ~10 lines: redirect-on-Creator + a `<main>` element. **Not borrowed:** the admin/operations split, the multi-page admin nav (Ordo has 11+ admin sub-pages), the `data-admin-*` data attributes, the CSS variable spacing system. |
| Eval-report reading from disk | [src/lib/evals/reporter.ts](src/lib/evals/reporter.ts) (existing ContentOps Sprint 6 code that *writes* the same files) | Sprint 9 adds the *reader* with the same filename convention. No new format. |
| Audit-feed display + Undo | [src/components/chat/ToolCard.tsx](src/components/chat/ToolCard.tsx) (Sprint 8) | The state machine is extracted to `src/lib/audit/use-rollback.ts`; both `ToolCard` and `<AuditFeedPanel>` rows consume it. |
| Three-dot typing-indicator pattern | None — original to Sprint 9. Common web pattern; no specific reference. | Tailwind 4 `animate-bounce` with staggered `animationDelay`. ~30 lines. |
| Pricing-via-existing-function | [src/lib/db/spend.ts](src/lib/db/spend.ts) (existing ContentOps Sprint 3 code) | Sprint 9 reuses `estimateCost` and the `HAIKU_*_COST_PER_MTOK` constants directly; adds a one-line citation comment. No new module. |

**Explicitly not borrowed from Ordo:**

- The 11+ admin sub-pages (`affiliates`, `deals`, `jobs`, `journal`, `leads`, etc.). ContentOps has *one* cockpit page.
- Ordo's `requireAdminPageAccess` indirection through a journal module — ContentOps inlines the session check at the page level.
- Ordo's spacing-CSS-variable system (`--space-frame-default` etc.). ContentOps uses Tailwind utility classes directly, consistent with the rest of the project.

---

## 16. Pre-write Context7 verifications

Before naming APIs in this spec (charter §7 step 3 / §15a), the following were resolved and queried via Context7:

- **`next` (Next.js 16)** — Server Actions (`'use server'` directive at module top) — shape unchanged from Next.js 15 per the v16 upgrade guide. `redirect` from `next/navigation` is the correct call for server-component redirects. `<Link>` API unchanged. `export const runtime = 'nodejs'` accepted on both page modules and server-action modules.
- **`react` (React 19)** — Hooks API (`useState`, `useEffect`, `useTransition`) — unchanged shape. No new patterns required for this sprint.

Skipped (already verified Sprint 7 / Sprint 8):

- `@anthropic-ai/sdk` — no new tool-use surface.
- `better-sqlite3` — no new query API; existing prepared-statement pattern continues. `LEFT JOIN` and `date('now')` are SQLite standard.
- `@playwright/test` — config + `test()` / `expect()` shape verified Sprint 8.
- `zod` — no new validation surface.
- `tailwindcss` (v4) — `animate-bounce` confirmed present in `node_modules/tailwindcss/theme.css`.

Skipped (Node built-ins — no Context7 entry expected):

- `node:fs` (`readdirSync`, `readFileSync`) — used in `eval-reports.ts`.
- `node:path` (`join`).

If Context7 surfaces an API mismatch during implementation that requires a stack change, Sprint 9 follows charter §9 stop-the-line and surfaces it before silently resolving.

---

## 17. Risk assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Cockpit RBAC predicate diverges from `/api/audit` predicate, allowing an Editor to see another Editor's audit rows on the cockpit | High — security regression | The two read helpers (`listAuditRows` for the API, `listRecentAuditRows` for the cockpit) share the same `actor_user_id` filter shape. Section 12.4 + 12.6 cross-verify both. A future sprint should collapse them into one helper; deferred to keep Sprint 9 small. |
| Server action exposed to direct call without going through the page redirect | High — would leak cross-actor data | Each action's role check is the **primary** security boundary, not defense-in-depth (Section 8). `refreshApprovals` additionally guards on Editor. Tested in Section 12.5. |
| `getTodaySpend` reads against host-timezone "today" while the writer wrote against UTC `date('now')` | High — silent divergence during DST overlap | Cockpit query is fixed at SQL `date('now')` (Section 4.3). Round-trip test in Section 12.4 #5. |
| `data/eval-reports/` missing on a fresh checkout / on Vercel | Low — panel shows empty state | `eval-reports.ts` catches ENOENT and returns null; UI shows "No eval runs recorded yet". Section 12.2. |
| Filesystem read in server component fails on edge runtime | Low — would surface immediately | `runtime = 'nodejs'` declared on `cockpit/page.tsx` *and* on `cockpit/actions.ts`. Sections 4.1, 8. |
| Typing indicator stays visible if the stream stalls indefinitely | Low — same lifetime as existing overlay; no new failure mode | The indicator unmounts when `content !== ''`, when a tool invocation arrives, or when status leaves `streaming`. The chat's existing error / quota / abort paths all transition status away from `streaming`. |
| Typing indicator and `<ToolCard>` render simultaneously during pre-text tool_use | Medium — visual noise, conflicting "the assistant is doing something" signals | Four-clause condition in Section 4.9 / 7 / 9.3 — indicator is hidden when `toolInvocations.length > 0`. Tested in Section 12.8 #3. |
| `ToolCard` extraction (`useRollback`) accidentally changes rollback DOM behavior | Medium — Sprint 8 regression | Characterization-test discipline (Section 12.12): existing `ToolCard.test.tsx` runs unchanged before + after the extraction; assertion outputs byte-identical. |
| `ToolCard`'s local `ToolInvocation` interface unification breaks consumers | Low — both definitions agree today | Same characterization discipline as the row above. |
| Cockpit refresh hammers SQLite under rapid clicks | Low — local SQLite, single-user demo, no real concurrency | Out of scope. If it surfaces in operator usage, debounce on the button is a one-line fix. |
| Audit-feed pagination misses rows when actions are taken between Loads | Low — cursor is `created_at` DESC, monotonic | New rows appear *above* the visible window on next refresh; `since` cursor reads strictly older rows. No double-display, no skip. |
| Operators with scrolled-up chats miss the in-bubble typing indicator (because the bubble is below the viewport) | Low — chats auto-scroll on submit per [ChatTranscript.tsx:24-31](src/components/chat/ChatTranscript.tsx#L24-L31) | If surfaced in post-impl QA, restoring the floating overlay is a 7-line additive change. No data implications. |
| Pricing constants drift from real Anthropic pricing | Low — display-only, demo-mode, single source of truth | Constants live in one place ([src/lib/db/spend.ts](src/lib/db/spend.ts)) with a one-line citation comment added by Sprint 9. Operator can edit one file. |

---

## 18. Commit strategy

```
feat(s9): operator cockpit dashboard + typing indicator

- /cockpit route (server-rendered, RBAC-gated): audit feed with Undo,
  schedule, approvals (Admin-only history), eval health, today's spend.
- Server actions for per-panel manual refresh; explicit nodejs runtime;
  primary RBAC boundary inside each action. No new HTTP routes.
- Typing indicator in empty assistant bubble between submit and first chunk;
  hidden when a tool invocation is underway. Removes the floating
  "Composing response…" overlay (now redundant).
- Extract useRollback hook to src/lib/audit/; ToolCard + AuditFeedPanel
  both consume it. Remove ToolCard's local ToolInvocation duplicate.
- Spend panel reuses existing estimateCost from src/lib/db/spend.ts
  (no new pricing module — single source of truth with the daily-spend
  ceiling check). Add citation comment above the constants.
- Audit-feed query LEFT JOINs users for actor display name; falls back
  to actor_user_id literal for mcp-server-attributed rows.
- Drop the stale sprint-3 header chip rather than re-hardcoding sprint-9.
- 167+ Vitest tests passing (132 baseline + 35 new) + 2 Playwright specs
  (cockpit smoke + chat-tool-use extended with typing-indicator assertion).
- eval:golden: 5/5 passing (no regression).
```
