# Spec — Sprint 8: Mutating Tools, Audit Log, and Rollback

**Sprint:** 8
**Status:** Implemented (QA-revised + post-impl amendment)
**Date:** 2026-05-01 (drafted), 2026-05-01 (QA fixes applied), 2026-05-01 (post-impl amendment to §6.2 / §7 — ISO 8601 datetime input for `schedule_content_item`; system-prompt tool-usage guidance)
**Author:** Cascade

---

## 1. Problem Statement

Sprint 7 delivered the `ToolRegistry`, the Anthropic tool-use loop, and a custom MCP server, but only for read-only tools. Charter Section 5 items 6 (RBAC) and 7 (rollback controls) require mutating tools that produce a `compensating_action` payload, an audit log surfaced to admins, and an Undo affordance in the cockpit.

Two adjacent gaps must close in the same sprint:

1. The architectural invariant — a single RBAC-filtered registry as the source of truth for prompt-visible schemas and runtime-executable tools — has only been exercised on tools with no side effects. Adding mutations without breaking the invariant requires the audit and rollback machinery to flow through the same registry, not around it.
2. Test infrastructure is duplicated: `createTestDb()` is reimplemented locally in three test files, the embedder mock is copy-pasted in three files, and seed helpers (`seedDocument`, `seedChunk`) appear in two. Sprint 7 flagged this as debt. Adding mutation-heavy test fixtures on top of the duplicated foundation would compound the cost.

Sprint 8 closes both gaps in one delivery.

---

## 2. Goals

1. **Mutating tool extension to the registry.** Extend `ToolDescriptor` with optional `compensatingAction` so a tool can be marked mutating without changing the read-only tool surface.
2. **Two mutating tools.** `schedule_content_item` (Editor + Admin) and `approve_draft` (Admin only). Both write SQLite rows; neither contacts a third-party service. Both return a serializable compensating-action payload.
3. **Audit log persisted in SQLite.** A new `audit_log` table records every successful mutating tool call: actor, role, tool, input, output, compensating-action payload, timestamps, and status (`executed` | `rolled_back`).
4. **Rollback path.** `POST /api/audit/[id]/rollback` runs the descriptor's compensating action and updates the audit row, atomically. Admin can roll back any row; non-admins only their own.
5. **Undo affordance in `ToolCard`.** When a `tool_result` event carries an `audit_id` and `compensating_available: true`, the card renders an Undo button that calls the rollback API and reflects the new status.
6. **Audit-log read API.** `GET /api/audit` returns RBAC-filtered rows. Admins see all; non-admins see their own. Anonymous demo visitors see nothing (Creator role + no admin overlay).
7. **Test architecture consolidation.** Move the existing `src/lib/db/test-helpers.ts` to `src/lib/test/db.ts`, add sibling modules for shared seed helpers and the embedder mock, and delete the per-file duplications.
8. **First Playwright smoke test.** Add `@playwright/test`, a `playwright.config.ts`, and one E2E test covering chat → tool_use → ToolCard render → Undo against the local dev server. Vitest still owns unit/integration; Playwright owns E2E.

---

## 3. Non-Goals

- **Cockpit dashboard.** Sprint 9. Sprint 8 ships the audit-log API and a per-card Undo button, not a full audit history page with filters.
- **Third-party side effects.** No real Google Calendar, no real publishing platform. All mutations stay in SQLite, consistent with charter Section 11b demo-mode constraints.
- **Multi-step undo / redo.** A rolled-back action stays rolled back. No re-do, no chained reverts.
- **Audit retention or purge.** The `audit_log` table grows unbounded for the demo lifetime. Retention is a future concern.
- **Schema migration framework.** ContentOps continues to use `CREATE TABLE IF NOT EXISTS`. New tables join the idempotent boot script.
- **Per-caller MCP authentication.** MCP-originated audit entries continue to attribute to actor `mcp-server` / role `Admin` (per the hardcoded context in [mcp/contentops-server.ts](mcp/contentops-server.ts)). Per-caller MCP auth is a Sprint 10 concern at earliest.
- **CI Playwright integration.** The smoke test runs locally only. Wiring Playwright into CI is Sprint 10 territory.
- **A `drafts` table.** `approve_draft` operates on existing `documents` rows by slug. Creating new draft documents via tool is out of scope.

---

## 4. Architecture

### 4.1 Mutating tools and the sync-transaction constraint

ContentOps uses `better-sqlite3`. Per Context7 verification of [`/wiselibs/better-sqlite3`](https://github.com/wiselibs/better-sqlite3/blob/master/docs/api.md): `db.transaction(fn)` does **not** support `async` functions, because the first `await` inside the wrapped function would commit the transaction prematurely.

This forces a real design decision. For the audit-log invariant — *if a mutation succeeds, an audit row must exist* — to hold, the mutation and the audit row insert must share a transaction. Sharing a transaction requires both writes to be synchronous.

**Decision.** A mutating tool's mutation phase is **synchronous**. The descriptor's `execute` function is split conceptually:

- Read-only tools' descriptor `execute` keeps its existing `Promise<unknown>` shape — bodies unchanged from Sprint 7.
- Mutating tools' descriptor `execute` returns a `MutationOutcome` synchronously: `{ result, compensatingActionPayload }`. Neither path inside execute may `await` after the SQL writes begin.

The registry distinguishes mutating from read-only by the presence of `compensatingAction` on the descriptor. When present, the registry wraps the call to `execute` in a `db.transaction(...)` and writes the audit row inside the same transaction. When absent, the registry awaits `execute` as before — no audit row written for read-only tools. (The registry's *own* return type changes for both paths to a `ToolExecutionResult` envelope — see Section 4.3 / Section 5. That change is independent of the descriptor's signature.)

**Why this design over alternatives:**

- *Best-effort audit logging* (write the audit row after a successful async execute, log a warning on failure) was rejected because rollback requires the audit row to exist; a missing audit row means a real mutation cannot be undone.
- *Two-phase commit across separate transactions* was rejected as overkill for a 5-document local-SQLite demo.
- *Splitting tool descriptors into "plan" + "apply"* was rejected as too much surface area for two tools.

The constraint is: mutating tools cannot do async work after they begin writing. For Sprint 8's two tools — both are pure SQL `INSERT` statements — this is fully sufficient.

### 4.2 `audit_log` table

Append-only on execute; `UPDATE` only the `status` and `rolled_back_at` columns on rollback. Timestamps are `INTEGER NOT NULL` (Unix **seconds**) to match the existing schema convention — every `created_at` column in [src/lib/db/schema.ts](src/lib/db/schema.ts) is written via `Math.floor(Date.now() / 1000)` (see [src/db/seed.ts:18](src/db/seed.ts#L18), [src/app/api/chat/route.ts:43](src/app/api/chat/route.ts#L43), [src/lib/db/rate-limit.ts:10](src/lib/db/rate-limit.ts#L10)).

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id                       TEXT PRIMARY KEY,
  tool_name                TEXT NOT NULL,
  tool_use_id              TEXT,
  actor_user_id            TEXT NOT NULL,
  actor_role               TEXT NOT NULL CHECK(actor_role IN ('Creator', 'Editor', 'Admin')),
  conversation_id          TEXT,
  input_json               TEXT NOT NULL,
  output_json              TEXT NOT NULL,
  compensating_action_json TEXT NOT NULL,
  status                   TEXT NOT NULL CHECK(status IN ('executed', 'rolled_back')) DEFAULT 'executed',
  created_at               INTEGER NOT NULL,
  rolled_back_at           INTEGER
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
```

`tool_use_id` is the LLM-issued ID from the Anthropic `tool_use` block. Nullable because MCP-originated calls don't have one. `conversation_id` is nullable for the same reason.

**No `REFERENCES` clauses on `actor_user_id` or `conversation_id`.** ContentOps does not enable `PRAGMA foreign_keys = ON` anywhere — every existing `REFERENCES` clause in `src/lib/db/schema.ts` is documentary only. Adding a documentary FK that would silently break under a future enforcement switch is misleading. Two cases the missing FK accommodates: (a) anonymous demo visitors whose session userId is the seeded Creator demo user — fine; (b) MCP-originated audit rows whose `actor_user_id` is `'mcp-server'`, which is not present in `users` (per the hardcoded `MCP_CONTEXT` at [mcp/contentops-server.ts:18-22](mcp/contentops-server.ts#L18-L22)). Integrity is enforced at the chat-route and MCP-server layers, not the database. See Section 14 open question #8 for the future-hardening path if FK enforcement is ever turned on.

### 4.3 Audit-aware execution

The registry's `execute()` method gains discriminated behavior. Its return type changes from `Promise<unknown>` to `Promise<ToolExecutionResult>` (defined in Section 5 — `{ result: unknown; audit_id: string | undefined }`) — an **envelope**, not a splat. Read-only paths return `{ result, audit_id: undefined }`; mutating paths return `{ result, audit_id }`. The field is always present on the envelope; only the value varies. This isolates the audit ID from the tool's logical result so it does not leak to the LLM, the persisted message body, or the MCP boundary.

```
async execute(name, input, ctx):
  descriptor = lookup
  RBAC check
  if descriptor.compensatingAction is set:
    audit_id = generated id
    return db.transaction(() => {
      outcome = descriptor.execute(input, ctx)        // sync MutationOutcome
      auditInsert.run({
        id: audit_id,
        tool_name: name,
        actor_user_id: ctx.userId,
        actor_role: ctx.role,
        conversation_id: ctx.conversationId,
        input_json: JSON.stringify(input),
        output_json: JSON.stringify(outcome.result),
        compensating_action_json: JSON.stringify(outcome.compensatingActionPayload),
        created_at: Math.floor(Date.now() / 1000),    // Unix seconds — see Section 4.2
        // status defaults to 'executed', rolled_back_at NULL
      })
      return { result: outcome.result, audit_id }
    })()
  else:
    rawResult = await descriptor.execute(input, ctx)
    return { result: rawResult, audit_id: undefined }
```

**Validation-failure contract.** A mutating tool's `execute` MUST throw on validation failures (e.g., unknown `document_slug`) and any other condition that would prevent the actual mutation. Returning a `MutationOutcome` is a commitment that the mutation has occurred. Returning a `MutationOutcome` for a non-mutation would corrupt the audit log with phantom entries and produce meaningless Undo buttons.

If either the mutation or the audit insert throws, the transaction rolls back and no row is left in either table. The chat route already catches errors at [src/app/api/chat/route.ts:460](src/app/api/chat/route.ts#L460) and surfaces them on the `tool_result` event's `error` field — that path is unchanged.

The registry needs a `db` reference to construct prepared statements for the audit insert. The Sprint 7 registry has none; Sprint 8 extends [src/lib/tools/registry.ts](src/lib/tools/registry.ts) so the constructor takes an optional `db` argument and the audit-write helper is built lazily on first mutating call. `createToolRegistry(db)` already has the database in scope at [src/lib/tools/create-registry.ts](src/lib/tools/create-registry.ts) — it forwards it to `new ToolRegistry(db)`.

### 4.4 Rollback path

`POST /api/audit/[id]/rollback`:

1. Authenticate. Resolve role from session cookie. Requests without a session cookie default to the Creator demo user, identical to the chat route fallback at [src/app/api/chat/route.ts:111-124](src/app/api/chat/route.ts#L111-L124).
2. Load audit row by `id`. 404 if not found.
3. **RBAC — audit-ownership policy.** Admin can roll back any row; Editor and Creator only rows where `actor_user_id === sessionUserId`. 403 otherwise. The descriptor's current `roles` array is **not** consulted at this step. See policy rationale below.
4. If `status === 'rolled_back'`, return 200 with `{ already_rolled_back: true }` (idempotent).
5. Look up the descriptor by `tool_name`. If the descriptor or its `compensatingAction` is missing, 410 Gone — the tool was removed from the registry.
6. Run inside `db.transaction()`:
   - Call `descriptor.compensatingAction(JSON.parse(row.compensating_action_json), ctx)` synchronously.
   - Compute `rolled_back_at = Math.floor(Date.now() / 1000)` (Unix seconds, per Section 4.2).
   - `UPDATE audit_log SET status = 'rolled_back', rolled_back_at = ? WHERE id = ?`.
7. If the compensating action throws, the transaction rolls back. Return 500 with the error message; the audit row stays `executed` so the user can retry.

**Rollback authorization policy (P1 — audit ownership only).** Rollback authorization is independent of the descriptor's current `roles` array. Concrete edge case the policy resolves: an Editor invokes `schedule_content_item` (allowed — descriptor.roles includes Editor). The user later flips their role overlay to Creator. A subsequent Undo click would hit step 3 with `actor_user_id === sessionUserId`, so audit-ownership RBAC passes; the rollback proceeds even though `descriptor.roles` no longer includes Creator. This is intentional. Rationale: rollback executes a pre-recorded compensating action whose authorization was already gated at the original mutation site. The architectural invariant (charter Section 4) governs prompt-visible tool *invocation* — undoing a recorded past invocation is a different operation, owned by audit ownership rather than current tool roles. The alternative (P2 — respect current `descriptor.roles`) would prevent users from undoing their own past actions after a role demotion, which violates intuitive Undo UX and gains no integrity benefit.

**Graceful-degradation note** (Kent Beck, surfaced in user message): when a compensating action fails because the world has moved on (e.g., the row to delete was already deleted by another action), the compensating action returns normally — it is responsible for being idempotent against current state. Only unexpected errors should throw.

### 4.5 Audit-log read API

`GET /api/audit` returns rows as JSON. Query parameters: `limit` (default 50, max 200), `since` (Unix seconds). RBAC at the route handler level:

- Admin: all rows, ordered by `created_at DESC`.
- Editor / Creator: only rows where `actor_user_id` matches their session user id.
- No session cookie: treated as the Creator demo user, identical to the chat route fallback at [src/app/api/chat/route.ts:111-124](src/app/api/chat/route.ts#L111-L124). The RBAC filter then returns 0 rows because the Creator demo user has not authored any audit entries (Creator is filtered out of every mutating tool's `roles` by the registry, so `actor_user_id` cannot match a Creator session id).

The route handler **must not** bypass the registry to write rows — it only reads. All writes flow through `ToolRegistry.execute` (Section 4.3) or the rollback handler (Section 4.4).

### 4.6 UI changes

The `ToolCard` ([src/components/chat/ToolCard.tsx](src/components/chat/ToolCard.tsx)) gains an Undo button, visible only when:

- The `tool_result` event includes `audit_id`.
- The card's local `status` is `executed` (initial state for any card with an `audit_id`).

Clicking Undo issues `POST /api/audit/<audit_id>/rollback`. On success, the card transitions to `rolled_back` state — Undo button replaced with a muted "Rolled back" label.

The NDJSON `tool_result` event variant in [src/lib/chat/parse-stream-line.ts](src/lib/chat/parse-stream-line.ts) gains two optional fields:

```
| { type: 'tool_result'; id: string; name: string; result: unknown; error?: string;
    audit_id?: string; compensating_available?: boolean }
```

`compensating_available` is set by the chat route when the registry call returned an `audit_id`. The chat route destructures the envelope `{ result, audit_id }` returned by `ToolRegistry.execute()` (Section 4.3). The `result` is what flows to the LLM and the persisted message body; `audit_id` flows only to the NDJSON `tool_result` event metadata.

### 4.7 What does *not* change

- Read-only tools — their `execute` bodies are unchanged; the registry's external return type changes to the `ToolExecutionResult` envelope (Section 4.3 / Section 5), so call sites that currently destructure or use the raw return value need a one-line update. The behavioral contract is unchanged.
- The MCP server ([mcp/contentops-server.ts](mcp/contentops-server.ts)) — it constructs the registry the same way, so mutating tools surface automatically. MCP-originated mutations produce audit rows attributed to actor `mcp-server` / role `Admin` per the hardcoded MCP context. The string `'mcp-server'` is not present in `users` and is stored as a free-text actor; this works because no FK enforcement is in play (Section 4.2 / Section 14 question #9). Per-caller MCP authentication is a Sprint 10 concern.
- The eval harness — `npm run eval:golden` operates on retrieval, not mutations, and stays at 5/5.
- The `messages` table schema — Sprint 7 already added the `'tool'` role; nothing further needed.

---

## 5. Domain types

All new types live in the existing [src/lib/tools/domain.ts](src/lib/tools/domain.ts).

```typescript
// Existing — unchanged
export type ToolCategory = 'corpus' | 'system';

// Existing — extended with two optional fields
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  roles: Role[] | 'ALL';
  category: ToolCategory;
  /** Read-only tools: async, returns the raw result.
   *  Mutating tools: sync, returns MutationOutcome.
   *  Mutating tools MUST throw on validation failures (see Section 4.3). */
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<unknown> | MutationOutcome;
  /** When set, this tool is mutating. The registry runs `execute` inside a
   *  sync transaction with an audit-row insert. The function below is the
   *  rollback path. */
  compensatingAction?: (
    payload: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => void;
}

// New — what mutating tool execute() returns synchronously
export interface MutationOutcome {
  result: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

// New — uniform envelope returned by ToolRegistry.execute() for ALL tools.
// Read-only paths set audit_id to undefined; mutating paths set it to the
// freshly-written audit_log row id. Keeps audit_id out of `result` so it
// cannot leak into the LLM-visible tool_result content or persisted messages.
export interface ToolExecutionResult {
  result: unknown;
  audit_id: string | undefined;
}

// New
export interface AuditLogEntry {
  id: string;
  tool_name: string;
  tool_use_id: string | null;
  actor_user_id: string;
  actor_role: Role;
  conversation_id: string | null;
  input_json: string;
  output_json: string;
  compensating_action_json: string;
  status: 'executed' | 'rolled_back';
  created_at: number;
  rolled_back_at: number | null;
}
```

The discriminator that flips the registry into mutating mode is `compensatingAction`, not the `execute` return type — TypeScript cannot reliably narrow on the return type at the call site, but `compensatingAction` is a plain truthy check. Tests in `registry.test.ts` will assert that omitting `compensatingAction` from a mutating-shaped tool descriptor produces a runtime invariant violation when its execute returns a `MutationOutcome` — that descriptor would write its mutation but skip the audit row, which is exactly the failure mode the discriminator must prevent.

---

## 6. Tool implementations

### 6.1 New tables

```sql
CREATE TABLE IF NOT EXISTS content_calendar (
  id            TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL,    -- Unix seconds
  channel       TEXT NOT NULL,
  scheduled_by  TEXT NOT NULL,
  created_at    INTEGER NOT NULL     -- Unix seconds
);

CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  approved_by   TEXT NOT NULL,
  notes         TEXT,
  created_at    INTEGER NOT NULL     -- Unix seconds
);
```

`document_slug`, `scheduled_by`, and `approved_by` carry no `REFERENCES` clauses for the same reason as `audit_log` (Section 4.2): FK enforcement is off project-wide, and adding documentary-only FKs is misleading. Tools validate slug existence at execute-time (Section 6.2 / 6.3 — validation failures throw, transaction rolls back, no audit row).

Both tables join the `SCHEMA` constant in [src/lib/db/schema.ts](src/lib/db/schema.ts).

### 6.2 `schedule_content_item`

| Field | Value |
|---|---|
| Roles | `['Editor', 'Admin']` |
| Input | `{ document_slug: string, scheduled_for: string (ISO 8601 datetime, e.g. "2026-05-02T09:00:00Z"), channel: string }` |
| Behavior | Parses `scheduled_for` via `Date.parse` and stores Unix seconds in `content_calendar.scheduled_for`. Throws on invalid ISO. Validates the slug exists in `documents` — throws on miss (no audit row written, per Section 4.3 validation contract). Inserts into `content_calendar`. Returns the new row's `id` along with the original ISO string the caller provided. |
| Compensating-action payload | `{ schedule_id: string }` |
| Compensating action | `DELETE FROM content_calendar WHERE id = @schedule_id`. Idempotent — no-op if already deleted. |

### 6.3 `approve_draft`

| Field | Value |
|---|---|
| Roles | `['Admin']` |
| Input | `{ document_slug: string, notes?: string }` |
| Behavior | Validates the slug exists in `documents` — throws on miss (no audit row written, per Section 4.3 validation contract). Inserts into `approvals`. Returns the new row's `id`. |
| Compensating-action payload | `{ approval_id: string }` |
| Compensating action | `DELETE FROM approvals WHERE id = @approval_id`. Idempotent. |

Both tools live in `src/lib/tools/mutating-tools.ts`:

```typescript
export function createScheduleContentItemTool(db: Database): ToolDescriptor;
export function createApproveDraftTool(db: Database): ToolDescriptor;
```

The registry factory in [src/lib/tools/create-registry.ts](src/lib/tools/create-registry.ts) registers both alongside the existing read-only tools.

---

## 7. Chat route surface changes

[src/app/api/chat/route.ts](src/app/api/chat/route.ts) changes are minimal:

1. The call site at [route.ts:455](src/app/api/chat/route.ts#L455) destructures the envelope: `const { result: toolResult, audit_id } = await toolRegistry.execute(...)`. `toolResult` retains its existing role — what flows into the `tool_result` event's `result` field at [route.ts:466](src/app/api/chat/route.ts#L466) and the persisted `tool_result` message body at [route.ts:479+](src/app/api/chat/route.ts#L479). `audit_id` is **only** read for the new metadata fields.
2. The `tool_result` NDJSON emit at [route.ts:466](src/app/api/chat/route.ts#L466) gains two optional fields, set only when `audit_id` is non-undefined: `audit_id: <id>` and `compensating_available: true`.
3. Persistence of tool messages (the block starting at [route.ts:479](src/app/api/chat/route.ts#L479)) is unchanged — the persisted body uses `toolResult` (the raw result), not the envelope.

No new event types. No change to the existing `chunk`, `error`, `quota`, `tool_use` events. The `audit_id` is metadata about the call, not part of the tool's logical output, so it never crosses into the LLM-visible content or the persisted message body.

---

## 8. New API routes

### 8.1 `GET /api/audit`

| | |
|---|---|
| File | `src/app/api/audit/route.ts` |
| Roles | Any session (or no cookie — Creator default per Section 4.5); results filtered by RBAC. |
| Query | `?limit=<n>&since=<unix_seconds>` |
| Response | `{ entries: AuditLogEntry[], next_since: number | null }` |

### 8.2 `POST /api/audit/[id]/rollback`

| | |
|---|---|
| File | `src/app/api/audit/[id]/rollback/route.ts` |
| Roles | Admin (any row) or row owner (Creator/Editor on own rows). No-cookie requests default to Creator demo user (per Section 4.4 step 1) and will receive 403 since they cannot own any audit rows. |
| Authorization scope | Audit ownership only — the descriptor's current `roles` array is **not** consulted (Section 4.4 policy P1). |
| Request body | None. |
| Response | `200 { rolled_back: true, audit_id }` or `200 { already_rolled_back: true }` |

**Next.js 16 dynamic-route signature** (verified via Context7 — see [v16 upgrade guide](https://github.com/vercel/next.js/blob/v16.2.2/docs/01-app/02-guides/upgrading/version-16.mdx)): `params` is a `Promise` and must be awaited.

```typescript
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // ...
}
```

This is the breaking change from Next.js 15 noted in the v16 upgrade guide. ContentOps already targets Next.js 16, so the signature is correct from the first commit.

---

## 9. UI changes

### 9.1 `ToolCard.tsx`

Extend `ToolCardProps` with `auditId?: string` and `compensatingAvailable?: boolean`. Internal state machine: `executed` → `rolling_back` → `rolled_back` (or `executed` on failure with an error label).

When `compensatingAvailable && status === 'executed'`, render an Undo button. Click handler issues `POST /api/audit/${auditId}/rollback`. On 200, transitions to `rolled_back`. On error, shows a small error state but stays `executed` (re-clickable).

### 9.2 `parse-stream-line.ts` and downstream

The `tool_result` variant gains two optional fields (Section 4.6). [src/components/chat/ChatUI.tsx](src/components/chat/ChatUI.tsx) and [src/components/chat/ChatMessage.tsx](src/components/chat/ChatMessage.tsx) thread them through to `ToolCard` props. No new event-handling branches are needed — the existing `tool_result` arrival path applies them.

---

## 10. Test architecture consolidation

### 10.1 Where tests live

Tests stay **colocated** (e.g., `foo.ts` next to `foo.test.ts`) per the user-message guidance. The existing [vitest.config.ts](vitest.config.ts) already lists `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}`. Vitest continues to own unit + integration. Playwright (Section 10.4) lives under `tests/e2e/` with `*.spec.ts` files — Vitest's `*.test.{ts,tsx}` include pattern does not match `*.spec.ts`, so the runners do not collide. Playwright is configured via its own `playwright.config.ts`, separate from `vitest.config.ts`.

### 10.2 Shared helpers under `src/lib/test/`

| File | Exports | Replaces |
|---|---|---|
| `src/lib/test/db.ts` | `createTestDb()` | The existing single-export [src/lib/db/test-helpers.ts](src/lib/db/test-helpers.ts) (file is moved) and the local re-implementations in 3 test files. |
| `src/lib/test/seed.ts` | `seedUser`, `seedConversation`, `seedDocument`, `seedChunk` | The local copies in `src/lib/evals/runner.test.ts`, `src/lib/rag/retrieve.test.ts`. Also a new `seedDocument` helper for mutating-tool tests. |
| `src/lib/test/embed-mock.ts` | `mockEmbedding`, `applyEmbedderMock` (calls `vi.mock('@/lib/rag/embed')` with a deterministic 384-dim normalized vector) | The duplicated `vi.mock` blocks in 3 RAG / eval test files. |

### 10.3 Characterization-test discipline

Per Michael Feathers — surfaced in user message — every test file affected by helper consolidation is run **before and after** the refactor; assertion outputs must be byte-identical. The sprint plan will name this verification step as a separate task with explicit before/after diff capture.

### 10.4 First Playwright smoke test

| | |
|---|---|
| New dep | `@playwright/test` (devDependency) |
| Config file | `playwright.config.ts` (project root) |
| Test file | `tests/e2e/chat-tool-use.spec.ts` |
| Coverage | Loads `/`, sends a prompt that triggers a mutating tool, waits for the `ToolCard` Undo button to render, clicks Undo, asserts the card transitions to rolled-back. |
| Session | The test imports the existing `encrypt()` helper from [src/lib/auth/session.ts](src/lib/auth/session.ts) and signs an Admin session cookie with `CONTENTOPS_SESSION_SECRET` from `.env.local`, then attaches it via Playwright's `context.addCookies()`. No new test-only API routes are introduced. |
| Web server | `playwright.config.ts` `webServer.command = 'npm run dev'`, `url = 'http://localhost:3000'`, `reuseExistingServer = !process.env.CI`. The test loads its env via `dotenv` so `CONTENTOPS_SESSION_SECRET` is available to the test process, not just the dev server. |
| Script | `"test:e2e": "playwright test"` added to `package.json`. |
| CI | Out of scope — local-only this sprint. |

The Playwright config and basic `test('name', async ({ page }) => { ... })` shape were verified via Context7 against `@microsoft/playwright`.

**Charter alignment.** Charter Section 11a lists "Playwright + Lighthouse + release evidence scripts" under "Explicitly NOT borrowed from Ordo." That exclusion targets *Ordo's full Playwright + Lighthouse + release-evidence stack* — not Playwright as a tool. Sprint 8 introduces a single smoke test, not the full stack. Authorization for the introduction comes from the session-start instruction set; nothing in the charter prohibits Playwright as a standalone E2E runner.

---

## 11. File inventory

### Created

| File | Purpose |
|---|---|
| `src/lib/tools/mutating-tools.ts` | `createScheduleContentItemTool`, `createApproveDraftTool` |
| `src/lib/tools/mutating-tools.test.ts` | Integration tests for both mutating tools |
| `src/lib/tools/audit-log.ts` | Audit-row writer + reader helpers used by registry and the `/api/audit` route |
| `src/lib/tools/audit-log.test.ts` | Unit tests for audit-row insert/update/select shape |
| `src/app/api/audit/route.ts` | `GET /api/audit` |
| `src/app/api/audit/route.integration.test.ts` | RBAC + filtering tests |
| `src/app/api/audit/[id]/rollback/route.ts` | `POST /api/audit/[id]/rollback` |
| `src/app/api/audit/[id]/rollback/route.integration.test.ts` | Atomicity + idempotency tests |
| `src/lib/test/db.ts` | Shared `createTestDb()` |
| `src/lib/test/seed.ts` | Shared seed helpers |
| `src/lib/test/embed-mock.ts` | Shared embedder mock |
| `playwright.config.ts` | Playwright config |
| `tests/e2e/chat-tool-use.spec.ts` | First E2E smoke test |

### Modified

| File | Change |
|---|---|
| `src/lib/tools/domain.ts` | Add `MutationOutcome`, `ToolExecutionResult`, `AuditLogEntry`; extend `ToolDescriptor` with optional `compensatingAction` and union return type on `execute` |
| `src/lib/tools/registry.ts` | Constructor accepts optional `db`; `execute()` returns `ToolExecutionResult` envelope (breaking change to the existing return type) for both read-only and mutating paths; mutating path is wrapped in a sync transaction with an audit insert |
| `src/lib/tools/registry.test.ts` | Update existing read-only tests to read `result` from the envelope; add new tests for the audit hook, the validation-throw contract, and the envelope shape on read-only tools |
| `src/lib/tools/create-registry.ts` | Pass `db` to `new ToolRegistry(db)`; register the two new mutating tools |
| `src/lib/db/schema.ts` | Append `audit_log`, `content_calendar`, `approvals` tables + indexes |
| `src/components/chat/ToolCard.tsx` | Add Undo button + `executed` / `rolling_back` / `rolled_back` state |
| `src/lib/chat/parse-stream-line.ts` | Add `audit_id` and `compensating_available` to `tool_result` variant |
| `src/components/chat/ChatUI.tsx` | Thread `audit_id` / `compensating_available` to message state |
| `src/components/chat/ChatMessage.tsx` | Thread the same to `ToolCard` props |
| `src/app/api/chat/route.ts` | Destructure `{ result, audit_id }` envelope at the registry call site; emit `audit_id` and `compensating_available` on the `tool_result` event when present |
| `mcp/contentops-server.ts` | Adjust the registry-call wrapper to read `.result` from the envelope (mechanical change required by the registry's new return type — does not affect MCP behavior) |
| `mcp/contentops-server.test.ts` | Add the contract test for mutating-tool MCP parity (Section 12.6) |
| `package.json` | Add `@playwright/test` devDep, `test:e2e` script |
| `tsconfig.json` | Add `tests/**/*.ts` to `include` |

### Deleted (or stripped from)

| File | Stripped content |
|---|---|
| `src/lib/db/test-helpers.ts` | File moved to `src/lib/test/db.ts`; old path deleted |
| `src/lib/evals/runner.test.ts` | Local `createTestDb`, `seedDocument`, `seedChunk`, `mockEmbedding` re-implementations |
| `src/lib/rag/ingest.test.ts` | Local `createTestDb`, `vi.mock('./embed')` |
| `src/lib/rag/retrieve.test.ts` | Local `createTestDb`, `seedDocument`, `seedChunk`, `mockEmbedding` |

---

## 12. Testing strategy

### 12.1 Unit tests — `registry.test.ts` extension (~3 new)

1. Mutating tool descriptor with `compensatingAction` set: `execute` runs inside a transaction; audit row is written.
2. Mutation throws → both rows absent (transaction rollback verified by SELECT counts).
3. Read-only tool descriptor (no `compensatingAction`): no audit row written; existing async path unchanged.

### 12.2 Unit tests — `audit-log.test.ts` (~2 new)

1. Audit-row writer round-trips JSON columns.
2. Status transitions only: `executed` → `rolled_back` succeeds; reverse direction not provided.

### 12.3 Integration tests — `mutating-tools.test.ts` (~4 new)

1. `schedule_content_item` writes a `content_calendar` row and returns a deletable payload.
2. `schedule_content_item` rejects an unknown `document_slug`.
3. `approve_draft` writes an `approvals` row.
4. Compensating actions are idempotent (re-running deletes-an-already-deleted-row is a no-op, no throw).

### 12.4 Integration tests — `/api/audit` (~3 new)

1. Admin session: sees rows from all actors.
2. Editor session: sees only rows where `actor_user_id` matches.
3. Anonymous (Creator default): sees zero rows.

### 12.5 Integration tests — `/api/audit/[id]/rollback` (~4 new)

1. Admin rolls back another user's row → `200`, row UPDATEd, mutation reversed.
2. Non-admin attempts to roll back another user's row → `403`, no state change.
3. Second rollback on already-rolled-back row → `200 { already_rolled_back: true }`, no double-revert.
4. Compensating action throws (forced via a tool double-registered with a throwing `compensatingAction`) → 500 returned, audit row stays `executed`, `rolled_back_at` stays NULL, no UPDATE applied. Verifies the transaction-rollback contract from Section 4.4 step 7.

### 12.6 MCP contract tests — `mcp/contentops-server.test.ts` (~1 new)

1. The two new mutating tools surface via MCP `list_tools` and execute against the registry, producing audit rows attributed to `mcp-server`.

### 12.7 E2E — Playwright (~1 new)

1. Chat → Anthropic mock returns a `schedule_content_item` tool_use → `ToolCard` renders → Undo click → card transitions to rolled-back. Local dev server only.

### 12.8 Eval

`npm run eval:golden` continues to pass 5/5. No retrieval surface changed.

### 12.9 Counts

| Category | Sprint 7 baseline | New | Sprint 8 target |
|---|---:|---:|---:|
| Vitest unit + integration + contract | 106 | +17 | 123 |
| Playwright E2E | 0 | +1 | 1 |
| Eval (golden) | 5/5 | 0 | 5/5 |

The 17-test net (3 registry + 2 audit-log + 4 mutating-tools + 3 audit-list + 4 rollback + 1 MCP contract) assumes the helper consolidation does not change assertion counts (only locations of fixtures change). Characterization runs (Section 10.3) verify this.

---

## 13. Acceptance criteria

- `src/lib/tools/domain.ts` — `MutationOutcome`, `ToolExecutionResult`, `AuditLogEntry` exported; `ToolDescriptor` carries optional `compensatingAction`.
- `src/lib/tools/registry.ts` — constructor accepts `db`; `execute()` writes an audit row inside a transaction for mutating tools.
- `src/lib/tools/mutating-tools.ts` — `createScheduleContentItemTool` and `createApproveDraftTool` exported, registered in `createToolRegistry`.
- `src/lib/db/schema.ts` — `audit_log`, `content_calendar`, `approvals` tables and audit-log indexes present.
- `src/app/api/audit/route.ts` and `src/app/api/audit/[id]/rollback/route.ts` — both routes implemented with RBAC.
- `src/components/chat/ToolCard.tsx` — Undo button rendered for mutating tool results; rolls back through the API and reflects new state.
- RBAC matrix verified end-to-end:
  - Creator: cannot invoke either mutating tool (registry filters both from manifest); audit list returns empty.
  - Editor: can invoke `schedule_content_item`; **cannot invoke `approve_draft`** (registry filters it from manifest); can roll back own audit rows; cannot roll back others'. Role-overlay flips during a session do not change rollback authorization for previously-recorded actions (Section 4.4 policy P1).
  - Admin: can invoke both; can roll back any row.
- `src/lib/test/db.ts`, `src/lib/test/seed.ts`, `src/lib/test/embed-mock.ts` — exist; per-file duplications removed.
- `playwright.config.ts` and `tests/e2e/chat-tool-use.spec.ts` — present; `npm run test:e2e` passes locally.
- `npm run typecheck` — 0 errors.
- `npm run lint` — 0 errors.
- `npm run test` — ≥ 123 passing (106 baseline + 17 new).
- `npm run eval:golden` — 5/5 passing (no regression).
- `npm run mcp:server` — still starts without error.

---

## 14. Open questions (pre-decided)

| # | Question | Decision |
|---|---|---|
| 1 | Should `ToolDescriptor.execute` change its declared return type, or stay `Promise<unknown>` and accept that mutating tools' bodies are sync internally? | Declared type becomes `Promise<unknown> \| MutationOutcome`. Cleaner type narrowing at the registry; one source-of-truth signature instead of two. The registry's *own* `execute` return type also changes — to a `ToolExecutionResult` envelope `{ result, audit_id? }` — so that `audit_id` cannot leak into the LLM-visible `tool_result` content (Section 4.3 / Section 5). |
| 2 | Should the audit row store the LLM's `tool_use_id` for cross-reference with the `tool_result` event? | Yes. `tool_use_id TEXT` column, nullable for MCP-originated calls. |
| 3 | Should rollback be idempotent? | Yes. Second rollback on the same row is `200 { already_rolled_back: true }`. |
| 4 | Should anonymous demo visitors (Creator role default) see audit entries? | No. Charter Section 11b — anonymous role is restricted; audit list returns empty for Creator who is not the actor. |
| 5 | If the registered descriptor is later removed (a tool deprecated mid-session), can old audit rows still roll back? | No. Returns `410 Gone`. The compensating-action implementation is owned by the descriptor, not the audit row. Tradeoff: tool deprecations need a migration plan in a future sprint. |
| 6 | Should `/api/audit` paginate? | Cursor-based via `since` query parameter. `limit` defaults to 50, max 200. Sufficient for the demo; no offset-based pagination. |
| 7 | Should we wrap the existing read-only registry path in a transaction too, for symmetry? | No. Read-only tools have nothing to be atomic with. The simplicity meta-rule rejects symmetry-for-its-own-sake. |
| 8 | Does rollback authorization respect the descriptor's current `roles` array, or only audit ownership? | **Audit ownership only (P1).** A user can roll back any audit row they originally authored, even if their current role no longer includes the tool's `roles`. Rollback executes a pre-recorded compensating action whose authorization was already gated at the original mutation site; the architectural invariant covers prompt-visible *invocation*, not historical undo. See Section 4.4 for the policy text. |
| 9 | Should ContentOps turn on `PRAGMA foreign_keys = ON` and add real FK clauses on `audit_log` (and elsewhere)? | **Not in Sprint 8.** Currently every `REFERENCES` clause in `src/lib/db/schema.ts` is documentary only because FK enforcement is off project-wide. Sprint 8's new tables (`audit_log`, `content_calendar`, `approvals`) follow that same convention — no `REFERENCES` clauses, with integrity enforced at the chat-route / MCP-server layers. Turning on FK enforcement is a future hardening that would require seeding a synthetic `mcp-server` user row (currently `'mcp-server'` is a free-text actor for MCP-originated entries) and reviewing every existing schema reference. Out of scope here. |

---

## 15. Reference alignment

| Borrowed pattern | Source | Adaptation |
|---|---|---|
| Audit-log table shape (immutable, append-only, JSON metadata column) | [docs/_references/ai_mcp_chat_ordo/src/lib/db/tables.ts](docs/_references/ai_mcp_chat_ordo/src/lib/db/tables.ts) `conversation_purge_audits` | ContentOps's `audit_log` is general-purpose (any mutating tool), where Ordo's is purge-specific. Column shape echoes the actor + role + json-metadata + timestamp pattern. |
| Registry-wraps-execute concept (audit + RBAC at the registry, not at the tool) | [docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts](docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts) | ContentOps does **not** borrow `composeMiddleware`, the JSONL runtime audit, or the full `ToolExecutionHook` interface. ContentOps wraps execution at one site with one concern (audit). The simplicity meta-rule rejects a composer for one wrap. |
| Compensating-action concept | Original to ContentOps. Ordo does not attach compensating actions to descriptors. | ContentOps adds `compensatingAction` directly on the descriptor — colocates the rollback logic with the mutation. |
| Test-helper consolidation | Originated by Sprint 7's "Known Follow-Up" section in [docs/_specs/sprint-7-tool-registry/sprint.md](docs/_specs/sprint-7-tool-registry/sprint.md) | Direct execution of the deferred work. |

---

## 16. Risk assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Mutating tool's `execute` body inadvertently uses `await` after a SQL write — better-sqlite3 commits the transaction prematurely, audit invariant breaks | High — silent corruption of the audit guarantee | Section 4.1 documents the constraint; `registry.test.ts` adds a test that asserts audit-row presence after a mutation. Code review checklist for mutating tools includes the sync-body rule. |
| `audit_id` leaks into the LLM-visible tool result, the persisted message body, or the MCP boundary | High — schema drift, history pollution, MCP contract drift | `ToolRegistry.execute()` returns a `ToolExecutionResult` envelope (Section 4.3 / Section 5). The `result` field carries the tool's logical output to the LLM, persistence, and MCP; `audit_id` is metadata read only by the chat route for the NDJSON `tool_result` event. The two never combine. |
| Compensating action runs against state that has moved on (e.g., the row was already deleted manually) | Low — only affects the specific rollback request | Compensating actions are idempotent against current state (Section 4.4 — DELETE WHERE id matches; missing row is a no-op). |
| Audit-log table grows unbounded over a long demo session | Low — local SQLite, single-user demo | Out of scope (Section 3 non-goal). Future sprint can add retention. |
| Playwright flake on CI | Out of scope this sprint | Not run on CI in Sprint 8. CI Playwright is Sprint 10 territory. |
| Mutating tool added to MCP without compensating action | Medium — silent skip of audit row | The discriminator check (`compensatingAction` present) is the same in both paths. A descriptor with a `MutationOutcome`-shaped return but no `compensatingAction` is malformed; a unit test asserts this is rejected at registration. |
| Test-helper consolidation accidentally changes test behavior | Medium | Characterization-test discipline (Section 10.3): every affected test file is run before and after the move; outputs must match byte-for-byte. |
| Next.js 16 dynamic-route signature mismatch (`params` async vs sync) | Low — would surface immediately on first request | Verified via Context7. Spec uses the async-await signature from the start. |

---

## 17. Commit strategy

```
feat(s8): mutating tools, audit log, rollback, and test consolidation

- Extend ToolRegistry with mutating-tool path: sync execute + audit-row insert
  inside a single better-sqlite3 transaction.
- Add 2 mutating tools: schedule_content_item (Editor+Admin), approve_draft (Admin).
- Add audit_log, content_calendar, approvals tables.
- Add GET /api/audit and POST /api/audit/[id]/rollback with RBAC filtering.
- Add Undo affordance in ToolCard for mutating tool results.
- Consolidate test fixtures into src/lib/test/{db,seed,embed-mock}.ts.
- Add @playwright/test + first E2E smoke spec under tests/e2e/.
- 123+ Vitest tests passing (106 baseline + 17 new) + 1 Playwright spec.
- eval:golden: 5/5 passing (no regression).
```