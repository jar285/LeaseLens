# Spec — Sprint 11: Workspaces & Brand Onboarding

**Sprint:** 11
**Status:** QA-revised; sprint-QA amended
**Date:** 2026-05-04 (drafted), 2026-05-04 (spec-QA fixes applied), 2026-05-04 (sprint-QA amendments — §11 enumerated migrate/redirect/onboarding-page test categories; §11.10 counts updated to +44)
**Author:** Cascade

---

## 1. Problem Statement

ContentOps shipped Sprint 10 as an end-to-end demo of an AI operator cockpit grounded in the Side Quest Syndicate brand corpus. Architecturally this was sound — chunking, embedding, retrieval, RBAC, tool registry, audit, rollback, cockpit are all generic data-layer code — but the *product* is hardcoded: the corpus is seeded into `documents` and `chunks` at boot, the system prompt names "Side Quest Syndicate" inline, and a reviewer can't try the product with their own brand without forking the repo.

For the FDE / Applied-AI roles ContentOps targets ([target-job-links](../../target-job-links-and-claude-code-notes.md)), the customer-engagement onboarding story is exactly what those teams do daily. A demo where a reviewer uploads their employer's brand book and immediately gets a grounded AI workflow in 30 seconds is a meaningfully stronger talking point than a fictional-brand demo.

Sprint 11 closes that gap by making ContentOps **workspace-based**:

1. The `documents`, `chunks`, `audit_log`, `content_calendar`, and `approvals` tables gain a `workspace_id` column. A new `workspaces` table records each brand context.
2. Existing Side Quest data lives in a stable `sample` workspace. It is preserved as the default one-click path so reviewers face zero cold-start friction.
3. A new `/onboarding` route lets any operator either select the sample or upload up to five `.md` files describing their brand identity and audience profile, supplying a brand name + description.
4. The system prompt parameterizes on the active workspace. `'You are an AI assistant for Side Quest Syndicate, a gaming content brand'` becomes `'You are an AI assistant for {brand_name}. {brand_description}'`.
5. Every read path (chat retrieval, cockpit panels, MCP tools) filters by the active workspace.
6. Non-sample workspaces TTL after 24h via lazy cleanup invoked on each new workspace create.

The architectural invariant from prior sprints — *single RBAC-filtered registry as source of truth for prompt-visible schemas and runtime-executable tools* — survives unchanged. Workspaces are an orthogonal concern: every workspace still has Creator / Editor / Admin role behavior; every mutating tool still produces an audit row in a single sync transaction; every audit row still rolls back through the existing `POST /api/audit/[id]/rollback`.

---

## 2. Goals

1. **`workspaces` table.** Persistent, stable IDs. Records: `id` (TEXT PK), `name` TEXT, `description` TEXT, `is_sample` INTEGER (0/1), `created_at`, `expires_at` (NULL for sample).
2. **Per-workspace data isolation.** `documents`, `chunks`, `audit_log`, `content_calendar`, `approvals` each gain a `workspace_id TEXT NOT NULL` column. Existing seeded data lives in a stable `sample` workspace UUID.
3. **Onboarding flow.** A new `/onboarding` page presents two paths: *"Try sample brand"* (instant) and *"Upload your brand"* (form: brand_name + description + 1-5 markdown files, max 100KB each). Both paths set a workspace cookie and redirect to `/`.
4. **Workspace cookie.** A separate signed JWT cookie (`contentops_workspace`) carrying `{ workspace_id }`. Expires at 24h alongside non-sample workspace TTL. Decoded on every server request that needs workspace context. Distinct from `contentops_session` — workspace and role are orthogonal.
5. **Parameterized system prompt.** `buildSystemPrompt({ role, workspace, context })`. The brand-identity line templates on the workspace; tool-usage guidance lines stay identical.
6. **Workspace-scoped retrieval and tools.** `retrieve()` gains a required `workspaceId` parameter; ingestion ditto. `ToolExecutionContext` gains `workspaceId`. Every read across the chat / cockpit / MCP surface filters by workspace.
7. **Lazy TTL cleanup.** `purgeExpiredWorkspaces(db)` runs in a single transaction on every new workspace create — DELETE from each child table where `workspace_id` IN expired set, then DELETE the workspaces. No cron, no background job.
8. **Cockpit per-workspace.** The cockpit header surfaces the active workspace name + a "Switch workspace" link. Audit feed, schedule, approvals all filter by workspace_id. Eval health and Spend stay global (eval is sample-only by design; spend is a host-budget concern).

---

## 3. Non-Goals

- **User accounts.** No persistent identity beyond the session cookie. Sprint 12+ work.
- **Real auth.** No OAuth, magic links, password resets. Demo-mode anonymous session continues.
- **Multi-tenant data isolation beyond `workspace_id` filtering.** No row-level security, no per-workspace database connections, no cross-workspace audit-tampering protections beyond what `workspace_id` filtering naturally provides. Demo-grade.
- **Workspace sharing, permissions, team roles.** A workspace is a single-operator construct in this sprint. No invites, no transferring ownership.
- **Per-workspace billing or spend caps.** The existing daily-spend ceiling stays global to the host (it's a demo-mode safety, not a per-tenant policy).
- **Auto-generating eval cases from uploaded content.** The eval harness continues to run against the sample workspace only.
- **PDF / Word / structured ingestion.** Markdown-only for Sprint 11. PDF can be a Sprint 13+ candidate.
- **LLM inference of brand metadata.** Brand name and description come from explicit form fields. No "we'll figure out your brand voice from the doc" magic; that's prompt-iteration risk for a feature that lives in two text inputs.
- **Replacing the existing role overlay.** Workspace and role are orthogonal concerns. Every workspace still uses Creator / Editor / Admin role behavior via the existing role overlay.
- **Per-caller MCP workspace selection.** The MCP server hardcodes the sample workspace context for Sprint 11. Per-caller workspace selection is Sprint 13+.
- **Multi-file-format support, OCR, chunking heuristics for non-markdown.** Out of scope.
- **Workspace search or "browse all workspaces" UX.** A user knows their own workspace (cookie-scoped); there's no listing across users in this sprint.

---

## 4. Architecture

### 4.1 Workspaces table + schema migration

New table appended to `SCHEMA` in [src/lib/db/schema.ts](src/lib/db/schema.ts):

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workspaces_expires ON workspaces(expires_at);
```

Five existing tables gain `workspace_id TEXT NOT NULL` plus an index. Adding a `NOT NULL` column requires either a default (which works even on existing rows in SQLite for `ADD COLUMN`) or a backfill. Per Sprint 8 §4.2 convention, FK clauses remain documentary; integrity is enforced at the query layer, not the database.

```sql
-- Each ALTER landing once via the existing CREATE TABLE / ALTER pattern.
-- Because ContentOps still uses `CREATE TABLE IF NOT EXISTS` (no migration
-- framework — Sprint 8 §3 non-goal), the addition strategy is:
-- 1. New databases get the new shape directly via the CREATE TABLE statements.
-- 2. Existing dev databases get the column via an idempotent boot-time migration
--    (PRAGMA user_version + conditional ALTER TABLE if column missing).
```

**`documents.slug` UNIQUE constraint.** The existing `slug TEXT UNIQUE NOT NULL` declaration is **removed** from the `CREATE TABLE documents` statement in SCHEMA. UNIQUE column constraints in SQLite are *not* documentary — they're enforced by an automatic internal UNIQUE INDEX, regardless of any additional indexes. Leaving the column-level UNIQUE in place would reject the second workspace's `brand-identity` slug on a fresh DB. Replacement: a composite `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id)` in SCHEMA. New DBs get composite-only enforcement; existing dev DBs still carry the old column-level UNIQUE in their stored schema until rebuilt — the spec instructs operators to run `npm run db:seed` (truncate + reseed) for a clean Sprint 11 slate. Demo-grade posture (Sprint 8 §3 non-goal: no migration framework). Verification: a dedicated test (`migrate.test.ts`) inserts the same slug into two different workspaces against an in-memory DB and asserts both succeed.

**Documentary-FK posture.** `workspace_id` columns do NOT carry a `REFERENCES workspaces(id)` clause, consistent with the Sprint 8 §4.2 documentary-FK posture. Integrity is enforced at the application layer: the migrate/seed paths populate the column with a known-valid UUID; the upload route validates the workspace exists before INSERT. Adding documentary FKs would mislead a future reader into thinking `PRAGMA foreign_keys = ON` is safe — it is not, until every existing schema reference is reviewed.

**Migration strategy.** The schema module gains a `migrate(db)` function called from `lib/db/index.ts` after `db.exec(SCHEMA)`. It runs:

```typescript
function columnExists(db: Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

const SAMPLE_WORKSPACE_ID = '00000000-0000-0000-0000-000000000010';

export function migrate(db: Database): void {
  for (const table of ['documents', 'chunks', 'audit_log', 'content_calendar', 'approvals']) {
    if (!columnExists(db, table, 'workspace_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${SAMPLE_WORKSPACE_ID}'`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_workspace ON ${table}(workspace_id)`);
    }
  }
}
```

**Sample workspace UUID.** Stable across boots: a fixed UUID literal exported from `src/lib/workspaces/constants.ts`. The seed script (`src/db/seed.ts`) ensures the sample workspace row exists before seeding documents, and tags every seeded document with this UUID.

**Why ALTER with DEFAULT and not a backfill UPDATE.** SQLite's `ALTER TABLE ADD COLUMN ... DEFAULT 'literal'` is a constant-time operation that backfills the literal into existing rows. The sample-workspace UUID is the correct default for every pre-Sprint-11 row (which were all seeded from Side Quest). New rows always pass an explicit non-default workspace_id. The DEFAULT clause exists only for the migration moment; it's never relied on at the application layer.

### 4.2 Sample workspace and seeding

`src/lib/workspaces/constants.ts`:

```typescript
export const SAMPLE_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Side Quest Syndicate',
  description: 'A gaming content brand for players who treat every session as an adventure worth talking about.',
} as const;
```

The seed script:

1. Calls `migrate(db)` first.
2. INSERT OR IGNORE into `workspaces` with `(id: SAMPLE_WORKSPACE.id, name, description, is_sample: 1, expires_at: NULL)`.
3. Reads `src/corpus/*.md`, calls the existing `ingest(db, { ...content, workspaceId: SAMPLE_WORKSPACE.id })` for each.
4. Eval golden cases continue to test against `SAMPLE_WORKSPACE.id` (passed from `scripts/eval-golden.ts`).

### 4.3 Workspace cookie

A new signed JWT cookie `contentops_workspace` carrying `{ workspace_id }`. Mirrors the `contentops_session` shape — same `jose` HS256 + `CONTENTOPS_SESSION_SECRET`. Helpers in `src/lib/workspaces/cookie.ts`:

```typescript
export interface WorkspaceCookiePayload { workspace_id: string }
export async function encodeWorkspace(p: WorkspaceCookiePayload): Promise<string>;
export async function decodeWorkspace(t: string): Promise<WorkspaceCookiePayload | null>;
export const WORKSPACE_COOKIE_NAME = 'contentops_workspace';
```

**Why a separate cookie, not extending the session cookie.** Workspace and role are orthogonal — a single user might switch workspaces while keeping their role. Combining them couples two unrelated state changes into one JWT rotation. The separate cookie also keeps the existing role-overlay code path untouched.

**Expiry.** 24h via JWT `exp` claim. Aligned with non-sample workspace TTL.

### 4.4 Onboarding route

`/onboarding` (server component, `runtime = 'nodejs'`) renders `<WorkspacePicker />`. Two CTAs:

- **"Try sample brand"** → POSTs to `/api/workspaces/select-sample`. The route sets the workspace cookie to `SAMPLE_WORKSPACE.id` and redirects to `/`.
- **"Upload your brand"** → reveals an inline form: `name` (text), `description` (textarea), and a file input accepting up to 5 `.md` files. Submits `multipart/form-data` to `POST /api/workspaces`.

Server-side validation (both routes return 400 with field-specific error on violation):

| Field | Constraint |
|---|---|
| `name` | string, 1-80 chars, trimmed |
| `description` | string, 1-280 chars, trimmed |
| files | 1-5 files, each ≤ 100,000 bytes, accepted if **either** MIME is `text/markdown` / `text/plain` **or** filename ends in `.md` (case-insensitive). The OR-fallback handles browser inconsistency: some send `application/octet-stream` for `.md`, some send `text/x-markdown`. Server-side is authoritative; the client-side `<input accept>` attribute is a hint only. |

Total upload size cap: 5 × 100,000 = 500,000 bytes — well within Node.js's default request body parsing.

**Synchronous ingestion.** The `POST /api/workspaces` handler runs the full ingest pipeline (chunk + embed + insert) **inline** before responding. Embedding uses the existing local WASM model (no API cost, ~50ms per chunk). For 5 × 100KB markdown ≈ 50 chunks total, ingestion completes well under 5 seconds. Sync is correct here: the user is staring at the page; we don't need a job queue.

The route returns the workspace cookie and redirects to `/`. The cockpit and chat then render against the new workspace.

### 4.5 Cleanup of expired workspaces

`src/lib/workspaces/cleanup.ts` exports:

```typescript
export function purgeExpiredWorkspaces(db: Database): { purged: number };
```

Implementation: a single sync transaction that DELETEs from `chunks`, `audit_log`, `content_calendar`, `approvals`, `documents`, then `workspaces` — in that order, restricted to `workspace_id` IN (SELECT id FROM workspaces WHERE is_sample = 0 AND expires_at IS NOT NULL AND expires_at < unixepoch()). Returns the count of purged workspaces.

Called from `POST /api/workspaces` immediately before the new workspace INSERT. Lazy. No cron.

**Why "before insert."** Avoids the race where a near-simultaneous create reads stale data while another deletes it. Both runs in the same transaction with the new INSERT. SQLite's `BEGIN IMMEDIATE` (default for write transactions in `db.transaction()`) serializes the two.

### 4.6 Retrieval and tool-execution plumbing

`retrieve()` ([src/lib/rag/retrieve.ts](src/lib/rag/retrieve.ts)) gains a required `workspaceId` parameter. The vector and BM25 SQL both add `WHERE workspace_id = @workspace_id` in their respective subqueries. Every call site updates:

- Chat route ([src/app/api/chat/route.ts](src/app/api/chat/route.ts)) — reads workspace cookie, passes to retrieve.
- Eval runner ([src/lib/evals/runner.ts](src/lib/evals/runner.ts)) — accepts `workspaceId` parameter; eval CLI script passes `SAMPLE_WORKSPACE.id`.
- Search corpus tool ([src/lib/tools/corpus-tools.ts](src/lib/tools/corpus-tools.ts)) — reads workspace from `ToolExecutionContext`, passes to retrieve.
- Get document summary tool, list documents tool — same treatment.

**`ToolExecutionContext` extension.** Currently carries `userId`, `role`, `conversationId`, `toolUseId`. Sprint 11 adds `workspaceId: string` (required). Constructed at the chat route from the workspace cookie; constructed in MCP server with the sample workspace UUID (per §4.10).

**Mutating tools.** `schedule_content_item` and `approve_draft` both write rows to their respective tables — they receive `workspaceId` via `ToolExecutionContext` and write it into the new column. Validation against `documents` (e.g., `WHERE slug = ? AND workspace_id = ?`) ensures a tool can't reach into another workspace's slugs.

### 4.7 System prompt parameterization

[src/lib/chat/system-prompt.ts](src/lib/chat/system-prompt.ts) signature:

```typescript
import type { Workspace } from '@/lib/workspaces/types';

export function buildSystemPrompt(args: {
  role: Role;
  workspace: Workspace;
  context?: RetrievedChunk[];
}): string;
```

The brand identity line:

> Before: `'You are an AI assistant for Side Quest Syndicate, a gaming content brand. You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling gaming content.'`
> After: `'You are an AI assistant for ${workspace.name}. ${normalizeDescription(workspace.description)}. You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling content for this brand.'`

The description is normalized to avoid double-period artifacts:

```typescript
function normalizeDescription(d: string): string {
  return d.trim().replace(/\.$/, '');
}
```

Operator inputs `"A test brand"` or `"A test brand."` both render as `"...for FooBrand. A test brand. You help..."` — exactly one trailing period. `system-prompt.test.ts` (§11.2) verifies normalization with both variants.

Tool-usage guidance lines (`list_documents` before guessing slugs; ISO 8601 input + human-friendly output) stay byte-identical.

The chat route reads the workspace from the cookie, fetches the row from `workspaces`, and passes it to `buildSystemPrompt`. If the cookie is missing or expired, the chat route redirects to `/onboarding` rather than defaulting to sample — the demo intent is that the user explicitly picked a workspace.

### 4.8 Cockpit per-workspace

Every helper in [src/lib/cockpit/queries.ts](src/lib/cockpit/queries.ts) gains `workspaceId: string` as a required parameter. The `WHERE` clauses in audit-feed, schedule, approvals queries gain `AND a.workspace_id = @workspace_id`. Server actions in [src/app/cockpit/actions.ts](src/app/cockpit/actions.ts) read the workspace cookie alongside the session cookie and pass it through.

The cockpit page reads workspace from cookie and shows the workspace name in the header next to "Operator Cockpit", along with a **"Switch workspace"** Link to `/onboarding`.

**Per-workspace filtering exceptions:**

- **Eval health panel** stays global (eval runs against sample workspace; only one eval result file matters).
- **Spend panel** stays global (spend is host-budget; per-workspace billing is non-goal).

**Rollback path workspace handling.** The `POST /api/audit/[id]/rollback` route does NOT add workspace filtering. Audit-row IDs are global UUIDs; the existing audit-ownership check (`actor_user_id === sessionUserId` for non-Admins; Admin allowed for any row, per Sprint 8 §4.4 P1) remains the authoritative gate. A user whose cookie scopes them to Workspace A cannot acquire an audit-row ID from Workspace B in normal usage, and even if they did, the audit-ownership check would only pass if they happen to own that row — which means they took the action, which means rolling it back is consistent. Workspace_id is a *retrieval* concern (which rows the user sees), not an *ownership* concern (whose action it was). The existing P1 policy already handles cross-workspace edge cases correctly without modification.

### 4.9 Cockpit empty states

A freshly-created workspace has no audit rows, no scheduled items, no approvals. Each panel's existing empty state copy already handles this; no new code. The eval health and spend panels look the same regardless of workspace.

### 4.10 MCP server workspace handling

[mcp/contentops-server.ts](mcp/contentops-server.ts) hardcodes its `MCP_CONTEXT` (per Sprint 7 §4.7). Sprint 11 extends that hardcoded context with `workspaceId: SAMPLE_WORKSPACE.id`. MCP-originated tool calls operate against the sample workspace. Per-caller MCP workspace selection is Sprint 13+ at earliest.

Surfaces this limitation in the README: *"MCP integration currently operates against the sample workspace. Per-workspace MCP support is a future sprint."*

### 4.11 Eval harness handling

`scripts/eval-golden.ts` passes `SAMPLE_WORKSPACE.id` into `runGoldenEval(db, GOLDEN_SET, { workspaceId })`. The runner threads it into every `retrieve()` call. The golden set itself doesn't change — the cases still target the seeded Side Quest documents, which now live in the sample workspace.

README documents: *"The eval harness validates retrieval quality on the sample workspace. Uploaded brands inherit retrieval quality from the architecture; per-brand eval generation is out of scope."*

### 4.12 Landing page redirect

[src/app/page.tsx](src/app/page.tsx) checks for the workspace cookie. If absent, `redirect('/onboarding')`. If present and decodes to a non-existent workspace (e.g., expired and purged), `redirect('/onboarding')` and clear the cookie. If present and valid, render the chat as before.

### 4.13 Workspace expiry semantics (cookie vs `expires_at`)

A workspace's `expires_at` and its cookie's JWT `exp` are both 24h from create time, but they tick at different precisions and the lazy purge only runs on the next `POST /api/workspaces` create. There's a window where the cookie is still valid but the workspace's `expires_at` has passed.

**Definition.** A workspace is *active* when its row exists AND (`is_sample = 1` OR `expires_at > unixepoch()`). Read paths (chat route, cockpit page, MCP context resolution, every server action) check this predicate, not bare row existence.

**Helper.** `getActiveWorkspace(db, id): Workspace | null` in `src/lib/workspaces/queries.ts` encapsulates the predicate. Every read site calls this instead of bare `getWorkspace`. An expired-but-not-yet-purged workspace is treated as if not present: clear the cookie, redirect to `/onboarding`. The next workspace create will purge it.

**Why not run cleanup in the read path.** Cleanup mutates; read paths shouldn't. Treating expired workspaces as not-present is read-side; actual deletion stays at the create-write site. Eventually consistent.

### 4.14 What does *not* change

- The chat NDJSON stream contract.
- Tool registry RBAC (Creator / Editor / Admin filtering).
- Audit-row schema except for the new `workspace_id` column.
- Rollback path — the audit-row UPDATE doesn't need to filter by workspace because audit row IDs are workspace-scoped at insert time.
- Chat-route streaming + tool-use loop logic.
- The Anthropic SDK integration.
- The eval harness's measurement logic (only the parameter `workspaceId` is added).

---

## 5. Domain types

`src/lib/workspaces/types.ts`:

```typescript
export interface Workspace {
  id: string;
  name: string;
  description: string;
  is_sample: 0 | 1;     // SQLite stores boolean as integer
  created_at: number;
  expires_at: number | null;
}

export interface WorkspaceCookiePayload {
  workspace_id: string;
}
```

`src/lib/workspaces/constants.ts`:

```typescript
export const SAMPLE_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Side Quest Syndicate',
  description:
    'A gaming content brand for players who treat every session as an adventure worth talking about.',
} as const;

export const WORKSPACE_TTL_SECONDS = 60 * 60 * 24; // 24h
```

`ToolExecutionContext` ([src/lib/tools/domain.ts](src/lib/tools/domain.ts)) gains:

```typescript
export interface ToolExecutionContext {
  userId: string;
  role: Role;
  conversationId: string;
  toolUseId?: string;
  workspaceId: string;  // Sprint 11
}
```

---

## 6. Onboarding UX

### 6.1 `<WorkspacePicker>` (top-level onboarding component)

Two-card layout. Card 1: *"Try sample brand"* with a one-line description of Side Quest Syndicate and a CTA button. Card 2: *"Upload your brand"* with a CTA button that expands into `<UploadForm>` inline.

### 6.2 `<UploadForm>`

Three field groups:

- **Brand name** (text, required, max 80 chars). Inline error if blank.
- **One-line description** (textarea, required, max 280 chars). Counter shows remaining chars.
- **Brand documents** (file input, required, accept=".md,text/markdown,text/plain", multiple, max 5 files). Per-file size shown; per-file error if `> 100KB`. Submit disabled until all client-side validations pass.

Submit button → `POST /api/workspaces` as `multipart/form-data`. Loading spinner during the (synchronous) ingest. On success, server sets the workspace cookie and redirects to `/`. On error, render the error inline.

**Tip text near the form:** *"Markdown files only. Aim for one file per topic — brand identity, audience profile, content pillars, style guide. Each file should be ≤ 100KB."*

### 6.3 Workspace switcher in cockpit header

The cockpit header (`src/app/cockpit/page.tsx`) currently shows "← Chat | Operator Cockpit". Sprint 11 adds, between those two: a dimly-colored *"{workspace.name}"* with a small pencil/edit icon linking to `/onboarding`. Clicking it does not clear the cookie immediately — it just navigates to onboarding, where the user can pick a different workspace.

### 6.4 Header on `/`

The chat-page header at [src/app/page.tsx](src/app/page.tsx) already has a "Cockpit" link for non-Creator roles (Sprint 9). Sprint 11 adds the active workspace name immediately after the logo, in muted color. No edit affordance on the chat page — switching workspaces happens through the cockpit or `/onboarding`.

---

## 7. New API / route surface

| Route | Method | Notes |
|---|---|---|
| `/onboarding` | GET (page) | Renders `<WorkspacePicker>`. No redirect logic — landing page enforces cookie. |
| `/api/workspaces` | POST (multipart) | Create new workspace from upload + ingest. Returns workspace cookie + redirects. |
| `/api/workspaces/select-sample` | POST | Sets workspace cookie to sample id + redirects. |

No GET endpoint for listing workspaces — a user knows their own (cookie-scoped) and there's no inter-workspace browsing UX.

No DELETE endpoint — TTL handles cleanup. If we add manual deletion in Sprint 13+, it'll be a separate route.

---

## 8. File inventory

### Created

| File | Purpose |
|---|---|
| `src/lib/workspaces/types.ts` | `Workspace`, `WorkspaceCookiePayload` |
| `src/lib/workspaces/constants.ts` | `SAMPLE_WORKSPACE`, `WORKSPACE_TTL_SECONDS` |
| `src/lib/workspaces/cookie.ts` | `encodeWorkspace`, `decodeWorkspace`, `WORKSPACE_COOKIE_NAME` |
| `src/lib/workspaces/cookie.test.ts` | Round-trip + tampering rejection |
| `src/lib/workspaces/queries.ts` | `getWorkspace`, `createWorkspace`, `listExpiredWorkspaceIds` |
| `src/lib/workspaces/queries.test.ts` | CRUD + expiry-filter tests |
| `src/lib/workspaces/cleanup.ts` | `purgeExpiredWorkspaces(db)` |
| `src/lib/workspaces/cleanup.test.ts` | Sample workspace never purged; expired non-sample purged with cascade |
| `src/lib/workspaces/ingest-upload.ts` | Helper that takes parsed multipart files + workspace fields and runs the ingest pipeline; encapsulates validation |
| `src/lib/workspaces/ingest-upload.test.ts` | Validation matrix (size, count, MIME), happy path |
| `src/app/onboarding/page.tsx` | Server component wrapper |
| `src/app/onboarding/page.test.tsx` | Renders without redirect when no cookie; redirects when cookie set |
| `src/components/onboarding/WorkspacePicker.tsx` | Two-card layout |
| `src/components/onboarding/WorkspacePicker.test.tsx` | Renders both CTAs; sample button wires to action |
| `src/components/onboarding/UploadForm.tsx` | Form with client-side validation |
| `src/components/onboarding/UploadForm.test.tsx` | Validation states + submit |
| `src/app/api/workspaces/route.ts` | POST handler (upload + ingest) |
| `src/app/api/workspaces/route.integration.test.ts` | Validation + happy path + cookie set |
| `src/app/api/workspaces/select-sample/route.ts` | POST handler |
| `src/app/api/workspaces/select-sample/route.integration.test.ts` | Cookie-set + redirect |
| `src/components/cockpit/WorkspaceHeader.tsx` | Active workspace label + Switch link + edit-pencil icon. **Cockpit-only**; the chat-page header gets a small inline `<span>` directly in `src/app/page.tsx`, not a shared component. (Two surfaces, two concerns: the cockpit header has a "Switch" affordance; the chat-page header is read-only.) |
| `tests/e2e/workspace-onboarding.spec.ts` | Upload a brand → chat → cockpit → audit row scoped to new workspace |

### Modified

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Append `workspaces` table; add `migrate()` exporting idempotent ALTER for the 5 affected tables |
| `src/lib/db/index.ts` | Call `migrate(db)` after `db.exec(SCHEMA)` |
| `src/db/seed.ts` | Seed sample workspace; pass workspace_id into ingest |
| `src/lib/rag/ingest.ts` | Accept `workspaceId` param; INSERT into `documents` and `chunks` with the column |
| `src/lib/rag/retrieve.ts` | Accept `workspaceId` param; add `WHERE workspace_id = @workspace_id` to vector + BM25 subqueries |
| `src/lib/chat/system-prompt.ts` | Signature change to `{role, workspace, context}`; brand-identity line parameterized |
| `src/lib/tools/domain.ts` | Add `workspaceId: string` to `ToolExecutionContext` |
| `src/lib/tools/corpus-tools.ts` | Pass workspace from ctx into retrieve / list_documents query |
| `src/lib/tools/mutating-tools.ts` | Pass workspace from ctx into INSERT statements; validate slug existence within workspace |
| `src/app/api/chat/route.ts` | Read workspace cookie; redirect if missing/invalid; pass to retrieve, system prompt, and ToolExecutionContext |
| `src/lib/cockpit/queries.ts` | Add `workspaceId` param to every helper; add `WHERE workspace_id` to each query |
| `src/app/cockpit/actions.ts` | Read workspace cookie alongside session; thread to queries |
| `src/app/cockpit/page.tsx` | Read workspace cookie; redirect to `/onboarding` if missing; render workspace name + Switch link in header |
| `src/app/page.tsx` | Read workspace cookie; redirect to `/onboarding` if missing; show workspace name in header (muted) |
| `mcp/contentops-server.ts` | Add `workspaceId: SAMPLE_WORKSPACE.id` to MCP_CONTEXT; surface limitation in module comment |
| `scripts/eval-golden.ts` | Pass `SAMPLE_WORKSPACE.id` to `runGoldenEval` |
| `src/lib/evals/runner.ts` | Accept `workspaceId` param; thread to retrieve |
| `src/lib/evals/runner.test.ts` | Pass sample workspace id in setup |
| `src/lib/test/seed.ts` | Update `seedDocument` / `seedChunk` to require `workspaceId` |
| Existing tests touching `seedDocument` / `seedChunk` | Pass sample workspace id |

### Modified — test files that construct `ToolExecutionContext` (sprint-QA H3)

Required updates because `ToolExecutionContext.workspaceId: string` is now non-optional. Sprint plan must enumerate via `grep -r 'ToolExecutionContext\\|registry\\.execute\\|context: {' src/` before committing.

| File | Change |
|---|---|
| `src/lib/tools/registry.test.ts` | Add `workspaceId: SAMPLE_WORKSPACE.id` to every test-context literal |
| `src/lib/tools/mutating-tools.test.ts` | Same |
| `src/lib/tools/audit-log.test.ts` | Same |
| `src/app/api/audit/[id]/rollback/route.integration.test.ts` | If the test seeds audit rows directly, add `workspace_id` to the INSERT (audit-log table now has the column) |
| `src/app/api/chat/route.integration.test.ts` | Any direct INSERT into per-data tables needs `workspace_id` |
| `src/lib/cockpit/queries.test.ts` | Any direct INSERT into per-data tables needs `workspace_id` |
| `src/components/cockpit/AuditFeedPanel.test.tsx` | If fixture data builds `CockpitAuditRow` objects, add `workspace_id` field |

### Deleted

None. Sprint 11 is purely additive and refactors-existing.

---

## 9. UI changes summary

### 9.1 New: `/onboarding`

Server-rendered page with `<WorkspacePicker>`. No auth needed; visible to anyone. If a workspace cookie is already set, the page renders normally — the user came here intentionally to switch.

### 9.2 New: workspace name in chat-page header

Between the "ContentOps Studio" logo and the Cockpit link, a muted-color span: *"· {workspace.name}"*. No edit affordance here.

### 9.3 New: workspace switcher in cockpit header

The cockpit's existing header gets a workspace label + a Switch link to `/onboarding`. Visible on every cockpit page load.

### 9.4 Landing-page redirect

If no workspace cookie, redirect to `/onboarding`. The first-visit experience for any user is the onboarding picker.

---

## 10. Domain types and constants summary

```typescript
// src/lib/workspaces/types.ts
export interface Workspace { id; name; description; is_sample; created_at; expires_at; }
export interface WorkspaceCookiePayload { workspace_id: string; }

// src/lib/workspaces/constants.ts
export const SAMPLE_WORKSPACE = { id: '...sample-uuid...', name: 'Side Quest Syndicate', description: '...' };
export const WORKSPACE_TTL_SECONDS = 86400;

// src/lib/tools/domain.ts (extended)
export interface ToolExecutionContext { userId; role; conversationId; toolUseId?; workspaceId; }
```

---

## 11. Testing strategy

### 11.1 Unit (~14 tests)

- `cookie.test.ts` (3): round-trip; tampered token rejected; invalid signature rejected.
- `queries.test.ts` (5): create workspace; get by id (existing + missing); list expired (filters sample, filters non-expired); **`getActiveWorkspace` returns null for an expired non-sample workspace** (sprint-QA H2).
- `cleanup.test.ts` (3): no expired → no-op; expired non-sample → cascade DELETEs; sample workspace never purged.
- `migrate.test.ts` (3) — **added in sprint-QA H1.** No-op when columns already exist (fresh schema); adds `workspace_id` to a pre-Sprint-11 schema; cross-workspace duplicate slug succeeds against the new SCHEMA (verifies the column-level UNIQUE on `documents.slug` was correctly dropped per §4.1).

### 11.2 Unit — system prompt (~2 tests)

- `system-prompt.test.ts` (extended): brand-identity line includes workspace name; tool-usage guidance unchanged.

### 11.3 Integration — ingest upload helper (~5 tests)

- `ingest-upload.test.ts`: rejects oversized file; rejects too many files; rejects bad MIME *and* missing `.md` extension (both fallbacks fail); **accepts `.md` filename with `application/octet-stream` MIME** (sprint-QA M2 — MIME-or-extension fallback); happy path produces N chunks. Idempotent re-run is **not** in scope for Sprint 11 (each upload creates a fresh workspace; same brand uploaded twice = two distinct workspaces).

### 11.4 Integration — API routes (~6 tests)

- `POST /api/workspaces` (4): validation cases (name, description, file count, file size); success returns workspace cookie.
- `POST /api/workspaces/select-sample` (2): cookie set; redirect 303.

### 11.5 Integration — chat route + workspace (~3 tests)

- Chat with workspace cookie hits retrieve with the correct workspace_id (verifiable via spy or via DB-fixture cross-workspace data isolation).
- Chat without workspace cookie redirects to `/onboarding`.
- Chat with expired/purged workspace cookie redirects to `/onboarding`.

### 11.6 Integration — cockpit + workspace (~4 tests)

Three isolation tests in `queries.test.ts` (one per helper — sprint-QA M1) plus one actions-layer guard:

- `listRecentAuditRows` returns only the active workspace's audit rows when given a non-undefined `workspaceId` filter.
- `listScheduledItems` returns only the active workspace's calendar entries.
- `listRecentApprovals` returns only the active workspace's approvals.
- `actions.test.ts`: any cockpit refresh action throws when workspace cookie is missing.

The audit-rollback-in-active-workspace test (originally listed here as #4 per spec-QA M4) lands in **§11.5 chat-route integration** instead — that's where `/api/audit/[id]/rollback` is exercised. See §11.5.

### 11.6.5 Integration — workspace-cookie redirect paths (~5 tests)

**New sub-section** (sprint-QA H1). The workspace cookie gate appears on three pages; each redirect path needs a regression test.

- Home page (`/`): no workspace cookie → redirects to `/onboarding`.
- Home page: cookie decodes but `getActiveWorkspace` returns null (expired/purged) → redirects + clears cookie.
- Home page: valid cookie → renders normally; workspace name visible in header.
- Cockpit page (`/cockpit`): no workspace cookie → redirects to `/onboarding`.
- Cockpit page: expired cookie → redirects.

(Cockpit page with valid cookie + workspace name visible is implicitly covered by Sprint 9's existing cockpit page tests, which the implementer extends to set the workspace cookie alongside the session cookie.)

### 11.7 Integration — page tests (~2 tests)

**New sub-section** (sprint-QA H1).

- `/onboarding` page renders `<WorkspacePicker>` and the "Set up your brand" header.
- `/onboarding` does NOT redirect even if a valid workspace cookie is set — the user might be intentionally switching.

### 11.8 Component — onboarding UI (~4 tests)

- `<WorkspacePicker>`: renders both CTAs; sample button submits to action.
- `<UploadForm>`: blank submit shows errors; valid submit triggers POST with `multipart/form-data`; oversized file shows per-file error.

### 11.9 E2E — `tests/e2e/workspace-onboarding.spec.ts` (~1 spec)

End-to-end: navigate to `/`, get redirected to `/onboarding`, upload 2 small `.md` files with brand name "Acme" and description "A test brand", submit, land back on `/`, send a chat message that triggers retrieval, see the assistant reference Acme content (not Side Quest), navigate to `/cockpit`, see the audit row scoped to the new workspace.

### 11.10 Eval

`npm run eval:golden` continues to pass 5/5. The script now passes `SAMPLE_WORKSPACE.id` explicitly. No regression.

### 11.11 Counts

| Category | Sprint 10 baseline | New | Sprint 11 target |
|---|---:|---:|---:|
| Vitest unit + integration + component | confirmed at sprint-plan preflight (post-Sprint-10 commit `1f646c7`; Sprint 9's 168 + Sprint 10's polish-related additions; expect ≈ 170-180) | **+44** | baseline + 44 |
| Playwright E2E specs | 2 | +1 | 3 |
| Eval (golden) | 5/5 | 0 | 5/5 |

The +44 net subtotal (sprint-QA H1 — was +35 before sprint plan revealed the missing test categories): **14 unit** (3 cookie + 5 queries + 3 cleanup + 3 migrate) + **2 prompt** + **5 ingest** + **6 API** + **4 chat-route + workspace** (3 cookie path + 1 audit-rollback in active workspace, per spec-QA M4 + sprint-QA M2 — moved here from §11.6) + **4 cockpit** (3 queries-isolation + 1 actions-throw) + **5 redirect** + **2 onboarding-page** + **4 component** = 46 enumerated; 2 extension-of-existing tests (Task 24's seed.ts updates and audit-log workspace_id round-trip) don't add net-new test cases. Final pinned target: **+44 net-new**. The sprint-plan preflight pins the exact baseline at impl time.

---

## 12. Acceptance criteria

- `workspaces` table exists; sample workspace seeded with stable UUID.
- All five existing per-data tables have a `workspace_id` column with a backfill default of the sample UUID.
- `/onboarding` renders; both "Try sample" and "Upload" CTAs work end-to-end.
- Uploading 2 small `.md` files creates a workspace, ingests them into chunks scoped to the new workspace, sets the workspace cookie, and redirects to `/`.
- Chat from the new workspace: retrieval returns chunks only from the new workspace; system prompt names the new brand.
- Cockpit shows audit / schedule / approvals filtered to the active workspace; eval health and spend stay global.
- Switching workspaces (via header link → `/onboarding` → pick) updates everything seamlessly.
- TTL purges run on each `POST /api/workspaces`; the sample workspace is never purged.
- MCP server starts cleanly with sample workspace context.
- Eval golden 5/5 passes against sample workspace.
- All standard verification commands pass: typecheck, lint (no new errors over baseline), test (≥ baseline + 44 — sprint-QA H1), test:e2e (3 specs), eval:golden (5/5 against sample workspace), mcp:server (clean start).

---

## 13. Open questions (pre-decided)

| # | Question | Decision |
|---|---|---|
| 1 | Workspace identity: cookie or URL param? | Signed JWT cookie. Mirrors session cookie. URL params would leak workspace IDs into shared links, browser history. |
| 2 | Brand metadata source: form fields or LLM-inferred? | Form fields. Cheaper, deterministic, operator-controllable. LLM inference is iteration risk for a 2-field problem. |
| 3 | Allowed file formats? | `.md` only. Matches existing pipeline. PDF / DOCX is Sprint 13+. |
| 4 | Workspace switching mid-session? | Yes, via header Switch link → `/onboarding`. Same pattern as RoleSwitcher. |
| 5 | Sample workspace seed: separate file or current `src/corpus/`? | Current `src/corpus/` stays. Seed script writes to sample workspace. |
| 6 | Cockpit per-workspace or global? | Per-workspace for audit / schedule / approvals. Global for eval health and spend. |
| 7 | TTL cleanup mechanism? | Lazy: runs on each `POST /api/workspaces` before the new INSERT. No cron. |
| 8 | Eval harness scope? | Sample workspace only. README documents this as a deliberate architectural claim. |
| 9 | Workspace count limits? | None. TTL keeps the table small naturally. Per-IP rate limits are a future hardening. |
| 10 | MCP server workspace selection? | Hardcoded to sample for Sprint 11. Per-caller MCP workspace is Sprint 13+. |
| 11 | Combined session + workspace cookie? | Separate cookies. Workspace and role are orthogonal; combining couples unrelated state changes. |
| 12 | Persist file content blobs? | No. Markdown content is parsed into chunks, content stored in `chunks.content` (existing schema). The original .md file is not separately archived. |
| 13 | Show "ingestion in progress" state? | Sync ingestion + a loading spinner on the form. ≤ 5s for the cap (5 × 100KB). No streaming progress; the user just waits. |
| 14 | Cross-workspace name collisions? | Allowed. Two users uploading "Acme" workspaces have distinct UUIDs and isolated data. The display is by name, but identity is by UUID. |
| 15 | Slug collisions across workspaces? | Allowed. The column-level `documents.slug UNIQUE` is dropped from SCHEMA; uniqueness moves to a composite `UNIQUE INDEX (slug, workspace_id)`. See Section 14 for the SQLite-specific reasoning. |

---

## 14. Schema-collision tradeoff (resolved post-QA)

The existing `documents` table had `slug TEXT UNIQUE NOT NULL`. Sprint 11 needs slugs to be unique *per workspace*, not globally. Otherwise the second user uploading "brand-identity.md" would collide with the sample workspace's `brand-identity` slug.

**Options considered:**

A. **Drop column-level UNIQUE in SCHEMA + add composite UNIQUE INDEX.** Standard SQL pattern. Spec adopts this — see §4.1 "`documents.slug` UNIQUE constraint." UNIQUE column constraints in SQLite are *not* documentary; the automatic internal index always enforces them. Removing the UNIQUE keyword from the column declaration is the only correct fix on a fresh DB.

B. **Drop UNIQUE altogether.** Lookup correctness shifts from DB constraint to application code. Not great — silent duplicates would be possible if a query layer forgot to enforce uniqueness.

C. **Prefix slugs with workspace ID.** `acme/brand-identity` vs `sample/brand-identity`. Avoids the constraint problem but pollutes user-facing slugs in the chat ("the brand-identity document" becomes "the acme/brand-identity document"). Bad UX.

**Decision:** Option A. Spec QA H1 confirmed that leaving the existing column-level UNIQUE in `CREATE TABLE` would reject cross-workspace duplicate slugs on a fresh DB. The fix lands in §4.1: drop UNIQUE from the slug column declaration; add `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id)` to SCHEMA.

**Existing dev databases.** The old column-level UNIQUE persists in stored schemas until the table is rebuilt. Spec instructs operators to run `npm run db:seed` (truncate + reseed) for a clean Sprint 11 slate — same demo-grade posture as Sprint 8 §3 (no migration framework). If a future operator skips that and tries to use Sprint 11 without rebuilding, they hit the old UNIQUE on the second workspace and get a clear error; they then run `db:seed` and continue.

**Verification.** A dedicated test (`migrate.test.ts`) constructs a fresh in-memory DB from the new SCHEMA, INSERTs the same slug into two different workspaces, and asserts both succeed. If the test fails (which would mean the SCHEMA constant still has UNIQUE on slug), spec-QA H1 hasn't been applied correctly.

---

## 15. Reference alignment

| Borrowed pattern | Source | Adaptation |
|---|---|---|
| Multi-tenancy via tenant column on existing tables | Standard pattern, no specific Ordo source | ContentOps's "tenant" is a workspace; column shape matches. |
| Lazy TTL cleanup on write | Standard pattern | ContentOps's `purgeExpiredWorkspaces` runs in same transaction as the new INSERT. |
| Onboarding picker UX (sample vs. custom) | Common SaaS pattern (Vercel, Supabase onboarding) | Two-card layout; sample is one click; upload is a small form. |
| Eval harness scoped to a known corpus | [src/lib/evals/runner.ts](src/lib/evals/runner.ts) (existing ContentOps Sprint 6) | Eval continues against sample only; uploaded brands inherit retrieval quality. |

**Explicitly not borrowed from Ordo:**

- Ordo's full multi-tenant infrastructure (per-tenant DB connections, row-level security policies). ContentOps stays single-database with `workspace_id` filtering — demo-grade.
- Ordo's tenant onboarding flows (account creation, invitation links, etc.). ContentOps has no accounts.
- Ordo's tenant-aware MCP server. ContentOps's MCP stays sample-only this sprint.

---

## 16. Pre-write Context7 verifications

Before naming APIs in this spec (charter §7 step 3 / §15a), the following will be re-verified before sprint plan drafting:

- **`next` (Next.js 16)** — `multipart/form-data` parsing in App Router route handlers (`request.formData()` for the upload route). Verify the API hasn't changed in a recent patch.
- **`jose`** — JWT signing pattern unchanged from the existing session cookie use; no fresh verification needed.
- **`better-sqlite3`** — `PRAGMA table_info` for the migrate function's column-existence check. Standard SQLite.

Skipped (verified Sprint 7-9):
- `@anthropic-ai/sdk` — no surface change.
- `@playwright/test` — config + cookie pattern unchanged.

If Context7 surfaces an API mismatch during sprint plan drafting that requires a stack change, sprint plan follows charter §9 stop-the-line.

---

## 17. Risk assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Existing dev DBs without `workspace_id` columns crash on first Sprint 11 boot | High — broken local dev | `migrate(db)` runs at boot, idempotent ALTER ADD COLUMN with sample-uuid default. Tested in `migrate.test.ts` (new). |
| `documents.slug UNIQUE` blocks cross-workspace duplicates on fresh DB | High — feature broken | §14 calls out the composite-unique-index decision; spec-QA verifies with a cross-workspace duplicate-slug test. |
| Retrieval forgets workspace filter in one path → cross-workspace data leak | High — tenant isolation breach | `workspaceId` made required on `retrieve()` signature; grep audit of every call site lands in sprint plan; integration tests assert isolation. |
| Upload route accepts oversized or malformed file | Medium — server crash or DoS | Multi-layer validation: client-side, server-side body limits, per-file MIME and size checks. Tested with bad inputs. |
| Synchronous ingestion is too slow for 500KB total | Low — UX delay | Local WASM embedding is fast (~50ms/chunk × 50 chunks = 2.5s). Loading spinner during. If empirically slow, switch to streaming + progressive UI. |
| `purgeExpiredWorkspaces` race with create | Low — same transaction prevents | Both run in `db.transaction()`; SQLite's BEGIN IMMEDIATE serializes writes. |
| Workspace cookie outlasts the workspace it points to | Medium — broken UX (chat redirects to onboarding) | Landing page detects expired/purged workspace, clears the cookie, redirects to `/onboarding`. Tested. |
| MCP-originated audit rows attribute to sample workspace | Low — limitation, not bug | Documented in README; per-caller MCP workspace is Sprint 13+. |
| Eval harness fails after `retrieve()` signature change | Medium — CI break | Eval CLI script and runner both updated in same sprint; tested. |
| Sprint 11 over-budget; Sprint 12 deployment delays | Medium — portfolio submission slips | Hold the line on non-goals (no PDF, no auth, no LLM inference). If scope creeps, defer LLM-inferred metadata or workspace switcher; never defer the sample-workspace path. |
| Test sweep misses a `ToolExecutionContext` construction site → typecheck or test failure (sprint-QA H3) | Medium — caught at impl-time `npm run typecheck`, but adds a fix-iteration cycle | Sprint plan task list enumerates each affected file; grep audit (`grep -r 'ToolExecutionContext\\|registry\\.execute' src/`) before sprint-plan drafting confirms the list is complete. |
| Cross-workspace audit-row rollback (sprint-QA M4) | Low — Sprint 8 P1 audit-ownership check already prevents misuse | §4.6 documents the explicit reasoning — workspace_id is a retrieval concern, not an ownership concern. No code change to the rollback path. |

---

## 18. Commit strategy

```
feat(s11): workspaces & brand onboarding (chat-first)

- Pivot from Side-Quest-Syndicate-only demo to a workspace-based product:
  any operator can supply their own brand identity + audience profile by
  dragging .md files into the chat surface. Side Quest stays as a
  one-click sample workspace, loaded by default on first visit.
- New `workspaces` table + `workspace_id` column on `documents`, `chunks`,
  `audit_log`, `content_calendar`, `approvals`. Idempotent migrate() at
  boot for existing dev DBs.
- Composite UNIQUE (slug, workspace_id) on documents — same slug can exist
  in different workspaces.
- Chat-first homepage: middleware issues a sample-workspace cookie when
  none is present so first-time visitors land directly in chat. Workspace
  management lives in a header popover (WorkspaceMenu) with "Use sample"
  and "Start a new brand" entries; the standalone /onboarding route is
  removed in favor of in-chat upload (FileDropZone + AttachButton +
  BrandUploadModal with prefilledFiles).
- Synchronous ingest pipeline against the new workspace_id; signed JWT
  cookie carries the active workspace; lazy TTL purge on each create
  cleans up workspaces older than 24h (sample never expires).
- System prompt parameterized on workspace; chat / cockpit / MCP all
  filter by workspace. Eval harness stays sample-only by design.
- Cockpit reframed: per-panel headings labelled by the question they
  answer ("What has the AI done?", "Today's spend", "Is retrieval
  grounded?", "What's queued to publish?", "Awaiting sign-off"); audit
  feed collapses to top 5 with View-all expand; spend panel carries a
  "Global · all workspaces" badge.
- MCP server hardcodes sample workspace context; per-caller MCP
  workspace selection is Sprint 13+ (documented in README).
- 242 Vitest tests passing (target: 232; net +57 over Sprint 10 baseline
  of 185), 3 Playwright specs (workspace-onboarding rewritten for
  sample-by-default; chat-tool-use + cockpit-dashboard unchanged), 5/5
  eval:golden against sample workspace.
```

## 19. Post-implementation UX revision

**Status:** Applied 2026-05-05. All findings authorized via brainstorm session referenced in [/.claude/plans/you-are-a-coding-rustling-lagoon.md](file:///C:/Users/Jesus%20Adonis%20Rosario/.claude/plans/you-are-a-coding-rustling-lagoon.md).

Operator validation of the Sprint 11 implementation surfaced three product issues. Because Sprint 11 had not yet been committed, corrections were applied in-place on top of the Sprint 11 working tree rather than as a separate sprint. Charter v1.7 framing (Sprint 11 = Workspaces & Brand Onboarding) holds; only the routing and UX surfaces changed.

### 19.1 Onboarding-as-homepage was wrong (resolved)

**Symptom:** A first-time visitor at `/` was redirected to `/onboarding`, gating the chat behind setup. Exactly the friction Sprint 11 was supposed to remove.

**Resolution:**
- [src/middleware.ts](src/middleware.ts) now issues a sample-workspace cookie when none is present (alongside the existing default-Creator session cookie). First-time visitors land directly in chat with the sample workspace already active.
- [src/app/page.tsx](src/app/page.tsx) and [src/app/cockpit/page.tsx](src/app/cockpit/page.tsx) tolerate a "workspace gone" race (cookie valid but workspace TTL-purged): they fall back to an in-memory sample workspace and clear the stale cookie so middleware re-issues on the next request. No more redirects to `/onboarding`.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) 401 redirect hint changed from `/onboarding` to `/` — the home page is now the recovery surface.

### 19.2 `/onboarding` route deleted; WorkspacePicker replaced by header popover (resolved)

**Symptom:** Standalone setup page is unnecessary once sample-by-default works; managing workspaces from a header affordance is more discoverable than a route.

**Resolution:**
- Deleted `src/app/onboarding/`, `src/components/onboarding/WorkspacePicker.tsx`, `src/components/onboarding/UploadForm.tsx` and their tests.
- New [src/components/workspaces/WorkspaceMenu.tsx](src/components/workspaces/WorkspaceMenu.tsx) — popover triggered from the workspace label in the header. Shows current workspace, "Use sample brand" (POSTs to `/api/workspaces/select-sample`), and "Start a new brand…" (opens BrandUploadModal). Replaces the `<Link href="/onboarding">` in [src/components/cockpit/WorkspaceHeader.tsx](src/components/cockpit/WorkspaceHeader.tsx).
- New [src/components/workspaces/BrandUploadModal.tsx](src/components/workspaces/BrandUploadModal.tsx) — reusable modal hosting the upload form. Accepts an optional `prefilledFiles: File[]` prop; when provided, hides the file input and renders a read-only file list (used by the chat-drop flow in §19.3).

### 19.3 Brand upload now happens in chat (resolved)

**Symptom:** The form-on-a-route pattern is mechanically correct but doesn't match how 2026-era AI products handle file ingestion. Users expect Claude/ChatGPT-style attach-in-chat.

**Resolution (3b — persist + embed; see plan for hybrid rejection rationale):**
- New [src/components/chat/FileDropZone.tsx](src/components/chat/FileDropZone.tsx) — wraps the entire chat surface. HTML5 drag-and-drop. Filters dropped files to `.md`, ≤100KB, max 5 (matches server validation in [src/lib/workspaces/ingest-upload.ts](src/lib/workspaces/ingest-upload.ts)). Non-md drops are silently ignored.
- New [src/components/chat/AttachButton.tsx](src/components/chat/AttachButton.tsx) — paperclip button next to the send button, opens the OS file picker. Critical for keyboard-only and touch users; drag-and-drop alone is not accessible.
- [src/components/chat/ChatUI.tsx](src/components/chat/ChatUI.tsx) holds `pendingFiles` state, wraps content in `FileDropZone`, renders `BrandUploadModal` when files are pending, and threads `onAttachFiles` into `ChatComposer` so the paperclip funnels into the same modal.
- Submit flow: BrandUploadModal POSTs to `/api/workspaces` (unchanged), receives the new workspace cookie, then `router.refresh()` re-renders the route with the new workspace context.

**Rejected:** the conversational metadata-collection variant (assistant asks "what should I call this brand?") and the hybrid persist-vs-attach toggle. Inline mini-form is deterministic, accessible, and reuses the existing form validation 1:1.

### 19.4 Cockpit reframing + visual cleanup (resolved)

**Symptom:** Dense tables with no copy explaining purpose made the cockpit read as a debug pane rather than a product surface.

**Resolution (framing + visual cleanup; structural rebuild deferred):**
- [src/app/cockpit/page.tsx](src/app/cockpit/page.tsx) — added a subhead under the header: `"What your team sees while the AI works on behalf of {workspace.name}."`
- Per-panel headings now ask the question they answer:
  - `AuditFeedPanel`: "What has the AI done?" + "Tool actions logged on this brand · {n} entries"
  - `SpendPanel`: "Today's spend" + a `Global · all workspaces` pill (clarifies why the panel doesn't change on workspace switch)
  - `EvalHealthPanel`: "Is retrieval grounded?" + "Golden eval against the sample brand"
  - `SchedulePanel`: "What's queued to publish?" + "Posts the AI has scheduled across channels"
  - `ApprovalsPanel`: "Awaiting sign-off" + "Recent approvals · Admin only"
- `AuditFeedPanel` collapses to top 5 rows by default with a `View all (N)` / `Show fewer` toggle. The dense view stays available; the default is calmer.

### 19.5 Test impact

Net +17 Vitest tests vs the pre-revision baseline of 225 → 242 total (target was 232). Breakdown:

| Added | Removed |
|---|---|
| BrandUploadModal: 5 | UploadForm: 2 |
| WorkspaceMenu: 5 | WorkspacePicker: 3 |
| FileDropZone: 5 | onboarding/page: removed |
| AttachButton: 4 | |
| ChatUI upload integration: 2 | |
| AuditFeedPanel collapse: 2 | |

Playwright `tests/e2e/workspace-onboarding.spec.ts` rewritten for the sample-by-default flow. The other two specs (chat-tool-use, cockpit-dashboard) are unchanged.

### 19.6 What this revision did NOT touch

- `workspaces` table schema, the `migrate()` function, the cookie format, ingestion pipeline, retrieval signature, system-prompt parameterization, eval harness, MCP server. Architecture from §4 stands.
- Charter v1.7. Sprint 11 still framed as "Workspaces & Brand Onboarding"; the routing layout changed but not the goal.
- Sprint 12 (Demo Deployment + README + Loom) — still the next sprint.

## 20. Round 3 — workspace-scoped conversations + templated empty state

**Status:** Applied 2026-05-05 (TDD discipline: red → green → docs). All findings authorized via the brainstorm session referenced in the plan file.

The operator manual smoke after Round 2 surfaced two more bugs that automated tests couldn't catch. Both were Sprint 11 architectural gaps that became visible the moment a real user uploaded a custom brand and switched workspaces.

### 20.1 Bug A: `conversations` not scoped to `workspace_id` (resolved)

**Symptom:** After uploading a new workspace, the chat panel still showed the previous workspace's conversation history. Sending a message would have appended to the old conversation row, which is keyed to the old workspace's content — cross-workspace data bleed in both directions.

**Root cause:** Sprint 11 §4.1 listed five per-data tables (`documents, chunks, audit_log, content_calendar, approvals`) but missed `conversations`. The chat history is intrinsically per-brand; it should have been on the list.

**Resolution:**
- [src/lib/db/schema.ts](src/lib/db/schema.ts) — `conversations` now declares `workspace_id TEXT NOT NULL`.
- [src/lib/db/migrate.ts](src/lib/db/migrate.ts) — `'conversations'` added to `TABLES_NEEDING_WORKSPACE`. ALTER TABLE ADD COLUMN with DEFAULT sample-workspace UUID for pre-Round-3 dev DBs (constant-time backfill).
- New [src/lib/chat/conversations.ts](src/lib/chat/conversations.ts) — `getLatestConversationForWorkspace(db, { userId, workspaceId })` — extracted helper, unit-tested.
- [src/app/page.tsx](src/app/page.tsx) — uses the helper instead of an inline `WHERE user_id = ?` query.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) — existing-conversation lookup filters on `(id, user_id, workspace_id)`. New conversation INSERT writes `workspace_id` from the cookie. A `conversationId` from a foreign workspace falls through to a fresh conversation in the current one.
- [src/lib/workspaces/cleanup.ts](src/lib/workspaces/cleanup.ts) — TTL-purge cascade now also deletes messages (via the JOIN through conversations) then conversations themselves, before removing the workspace row. Children before parents.

**§4.1 amendment:** the per-data-table list is now `documents, chunks, audit_log, content_calendar, approvals, conversations`. Messages are NOT on the list — they're scoped through `conversation_id` (avoiding redundant `workspace_id` data that could drift).

### 20.2 Bug B: `ChatEmptyState` hardcoded "Side Quest Syndicate" (resolved)

**Symptom:** After uploading a custom brand, the empty-state heading still read "Side Quest Syndicate" and clicking "Define Brand Voice" sent a prompt that named Side Quest literally. The assistant correctly searched its corpus, found no Side Quest content (correct — wrong workspace), and asked for clarification. The assistant's behavior was correct; the prompt was wrong.

**Root cause:** Sprint 11's testing checklist (spec §11) covered system-prompt parameterization but missed `ChatEmptyState`, which is pure UI with no backend wiring.

**Resolution:**
- [src/components/chat/ChatEmptyState.tsx](src/components/chat/ChatEmptyState.tsx) — accepts a **required** `workspaceName: string` prop. The four hardcoded prompts now interpolate `${workspaceName}`. The heading renders `workspaceName` directly. No fallback to a default — a missing prop is a TypeScript error so the bug can't recur silently.
- [src/components/chat/ChatTranscript.tsx](src/components/chat/ChatTranscript.tsx) — accepts and forwards `workspaceName` to ChatEmptyState.
- [src/components/chat/ChatUI.tsx](src/components/chat/ChatUI.tsx) — accepts `workspaceName` in `ChatUIProps`, passes to ChatTranscript.
- [src/app/page.tsx](src/app/page.tsx) — passes `workspaceName={workspace.name}` to ChatUI.

### 20.3 Test impact

Net +13 vitest tests (242 → 255 target).

| Test file | Added |
|---|---|
| `migrate.test.ts` | +2 (Round 3 conversations migration + idempotence) |
| `cleanup.test.ts` | +2 (cascade through conversations + messages, sample exempt) |
| `route.integration.test.ts` | +3 (workspace_id persisted, foreign conversationId rejected, own conversationId appended) |
| `conversations.test.ts` (new) | +3 (most-recent, cross-workspace isolation, null-when-empty) |
| `ChatEmptyState.test.tsx` (new) | +3 (heading, prompt templating, all-four propagation) |
| `ChatTranscript.test.tsx` | +1 (workspaceName propagation to empty state) |

### 20.4 What Round 3 did NOT touch

- The `messages` table — scoped through `conversation_id`, no redundant `workspace_id` column.
- The audit-log / scheduling / approvals path — already workspace-scoped in Sprint 11.
- The MCP server — still hardcoded to sample (per spec §13.10).
- The eval harness — still sample-only.
- Charter v1.7. Sprint 11 framing unchanged.

## 21. Round 4 — legacy `documents.slug` UNIQUE rebuild + popover redundancy

**Status:** Applied 2026-05-05 (TDD discipline; root-cause analysis via 5 Whys). All findings authorized via the brainstorm session referenced in the plan file.

The Round 3 manual smoke caught a runtime 500 (`UNIQUE constraint failed: documents.slug`) when uploading a custom brand onto a dev DB that pre-dated Sprint 11. Sprint 11 §4.1 had explicitly punted on dropping the legacy column-level UNIQUE on `documents.slug`, accepting "operator must run `npm run db:seed`" as the workaround. Round 4 closes that debt.

### 21.1 The 5-Why root cause

1. **Why did the upload fail?** `UNIQUE constraint failed: documents.slug` fired when inserting `brand-identity` into a new workspace.
2. **Why is there a unique constraint on `slug` alone?** The pre-Sprint-11 schema declared `slug TEXT UNIQUE NOT NULL` at the column level, generating an `sqlite_autoindex_documents_*` unique index that survives any `ALTER TABLE ADD COLUMN`.
3. **Why didn't `migrate()` remove it?** Because [migrate.ts](src/lib/db/migrate.ts) explicitly punted: "SQLite's ALTER TABLE doesn't support modifying constraints." That's true for `ALTER TABLE` — but SQLite's [12-step table-rebuild procedure](https://www.sqlite.org/lang_altertable.html#otheralter) handles exactly this case.
4. **Why was punting acceptable in Sprint 11?** The migration was framed as *additive* ("add workspace_id columns") rather than *transformative* ("evolve the slug-uniqueness model"). Additive migrations feel safe; transformative ones feel scary. Easy framing won.
5. **Why didn't a test catch this?** The migration test asserted the migration *ran* (workspace_id column landed) but never asserted the migrated DB satisfied the same invariants as a fresh DB. Cross-workspace duplicate slug *was* tested — but only on a fresh `SCHEMA`, never on a migrated old DB. The test boundary was wrong.

The deeper lesson: **test what you want, not what's easy to assert.** Mechanic tests pass; behavior tests catch the bug.

### 21.2 Resolution

- New helper [src/lib/db/migrate.ts:hasLegacySlugUnique](src/lib/db/migrate.ts) — `PRAGMA index_list(documents)` filtered to `unique=1, origin='u', columns=['slug']`. Detects the legacy constraint without parsing `sqlite_master.sql`.
- New helper [src/lib/db/migrate.ts:rebuildDocumentsTableWithoutSlugUnique](src/lib/db/migrate.ts) — wraps the SQLite 12-step rebuild in `db.transaction(...)`. CREATE TABLE `documents_new` with the right shape → INSERT … SELECT (preserves all rows including the just-backfilled `workspace_id`) → DROP TABLE `documents` → RENAME `documents_new` → `documents`. Composite UNIQUE INDEX is re-created by the existing call below.
- `migrate()` now runs in three phases: ADD COLUMN loop → conditional rebuild → CREATE INDEX loop. Order matters: the rebuild needs `workspace_id` populated before it SELECTs.
- Header comment in `migrate.ts` corrected — the "operator must run db:seed" line is gone; the rebuild path is documented with the SQLite reference URL.
- **FK pragma wrap** (caught during implementation, not pre-planned). The first eval-golden run after the rebuild landed failed with `SQLITE_CONSTRAINT_FOREIGNKEY`. SQLite's docs are explicit: when the rebuild path drops a table other tables reference (here `chunks.document_id REFERENCES documents(id)`), `foreign_keys` must be turned OFF for the duration of the rebuild — the pragma can NOT be set inside a transaction. The helper now reads the current `foreign_keys` state, sets it OFF outside the transaction, runs the rebuild, and restores the original setting in a `try/finally`. (Aside: project docs claim FKs are project-wide-OFF, but the actual dev DB and `:memory:` test DBs enforce them. Worth verifying that claim in a future hardening pass; for now, the rebuild is robust either way.)

### 21.3 Boy Scout: popover redundancy

[src/components/workspaces/WorkspaceMenu.tsx](src/components/workspaces/WorkspaceMenu.tsx) — when `isSample === true`, the popover header already shows "Active brand: Side Quest Syndicate". A disabled "Sample brand (active)" menu item below was redundant noise. Removed the button entirely when on the sample workspace; only "Start a new brand…" remains.

### 21.4 Test impact

Net +3 vitest tests (256 → 259).

| Test file | Added |
|---|---|
| `migrate.test.ts` | +3 (Round 4 cross-workspace invariant on migrated DB; rebuild preserves rows + idempotence; FK-on regression guard) |
| `WorkspaceMenu.test.tsx` | 0 (existing "disables sample button" test rewritten in place to assert hidden behavior) |

The third test was added during implementation when an FK-enabled `:memory:` DB exposed the FK-pragma gap. It locks in the regression guard: a chunks row referencing documents.id, foreign_keys=ON before migrate, FK setting must be preserved as ON after, both rows survive the rebuild.

### 21.5 §4.1 amendment

The "Schema migration on existing dev DBs" risk in spec §17 is now addressed in code, not deferred to operator action. The bullet that read *"Document the `npm run db:seed` reset path for clean slate"* is preserved as a fallback option, but the migrate function now self-heals on its own for the specific failure mode that surfaced (legacy column-level UNIQUE on documents.slug).

### 21.6 What Round 4 did NOT touch

- Production DB shape — the SCHEMA constant was already correct.
- Composite UNIQUE INDEX on `(slug, workspace_id)` — already correct.
- Any non-`documents` table — only `documents` carries the legacy constraint.
- Charter v1.7. No version bump.

## 22. Round 5 — chunk-ID workspace namespacing + orphan-workspace prevention

**Status:** Applied 2026-05-05 (TDD discipline; root-cause analysis via 5 Whys). All findings authorized via the brainstorm session referenced in the plan file.

After Round 4 closed the schema migration, the operator's first cross-workspace upload failed at a different layer: `SqliteError: UNIQUE constraint failed: chunks.id` (SQLITE_CONSTRAINT_PRIMARYKEY). Round 5 closes that gap and a sibling orphan-row gap that surfaced in the same dev DB inspection.

### 22.1 The 5-Why root cause

1. **Why** does INSERT into `chunks` fail with PRIMARY KEY collision? Two rows are being inserted with the same `chunks.id`.
2. **Why** do the IDs collide? `chunk.id` was generated deterministically as `${slug}#document:0` and `${slug}#${level}:${index}` in [chunk-document.ts](src/lib/rag/chunk-document.ts) with no workspace dimension. The first GitLab upload created chunks with IDs like `content-style-guide#document:0`. The second upload regenerated the same IDs.
3. **Why** does the formula exclude workspace? Sprint 11 added `workspace_id` to the `chunks` *table* but never updated the *id derivation logic*. Partial fix.
4. **Why** wasn't this caught during Sprint 11? The cross-workspace retrieval test at [retrieve.test.ts:104](src/lib/rag/retrieve.test.ts#L104) supplied explicit chunk IDs (`chunk-a`, `chunk-b`) via `seedChunk()` — never exercising `chunkDocument()` on identical content into two workspaces.
5. **Why** is there a related half-fix in test code? [test/seed.ts:28](src/lib/test/seed.ts#L28) computes `docId = doc-${slug}-${workspaceId.slice(-6)}` — Sprint 11 anticipated the collision risk for *documents* and applied a workspace suffix in tests, but **never propagated the same idea to chunk IDs in production**. The pattern was foreseen, then dropped.

The Uncle Bob lesson: **partial fixes leave landmines.** When a constraint becomes per-workspace (slug uniqueness), every artifact derived from that constraint needs the same per-workspace upgrade.

### 22.2 Resolution — Bug E (chunk-ID collision)

- [src/lib/rag/chunk-document.ts](src/lib/rag/chunk-document.ts) — public signature changes from `chunkDocument(slug, title, content)` to `chunkDocument(documentId, title, content)`. The `slug` parameter is dropped entirely (it was used only in ID templates). Internal builders (`buildDocumentChunk`, `buildSectionChunks`, `buildChunk`) all updated to thread `documentId`.
- ID templates: `${slug}#document:0` → `${documentId}#document:0`; `${slug}#${level}:${index}` → `${documentId}#${level}:${index}`.
- [src/lib/rag/ingest.ts](src/lib/rag/ingest.ts) — `documentId` is hoisted above the `chunkDocument` call. `documentId` is `existing?.id ?? randomUUID()` — already per-workspace because the `existing` lookup filters by `(slug, workspace_id)`.
- Two ID formats coexist on the operator's dev DB: 6 pre-Round-5 chunks use the slug-prefixed format; new chunks use the documentId-prefixed UUID format. They don't collide because the prefixes are visually distinct.

### 22.3 Resolution — Bug F (orphan workspaces)

- [src/lib/workspaces/ingest-upload.ts](src/lib/workspaces/ingest-upload.ts) — wraps the per-file ingest loop in `try/catch`. On any throw, a single sync transaction deletes from `chunks`, `documents`, and `workspaces` (in child→parent order; the schema does NOT have `ON DELETE CASCADE`). Then the original error is rethrown so the route's 500 response carries the real diagnostic.
- The operator's existing 4 orphan GitLab workspaces are pre-Round-5 — Round 5's catch-and-delete only prevents *future* orphans. Validation-notes documents the one-off SQL cleanup (preserved here for the spec record):

```sql
DELETE FROM workspaces
 WHERE is_sample = 0
   AND id NOT IN (SELECT DISTINCT workspace_id FROM documents);
```

### 22.4 Test impact

Net +2 vitest tests (259 → 261).

| Test file | Added |
|---|---|
| `ingest.test.ts` | +1 (Round 5 cross-workspace identical-content uploads succeed without chunk-id collision) |
| `ingest-upload.test.ts` | +1 (Round 5 orphan-prevention: failed ingest mid-flight rolls back workspace + documents + chunks) |
| `chunk-document.test.ts` | 0 net (existing 6 tests updated for the new signature; ID-pattern test rewritten in place to assert documentId-prefixed format) |

The cross-workspace test in `ingest.test.ts` is the test we *should* have written in Sprint 11 and didn't. It would have caught both Round 4's slug-UNIQUE bug and Round 5's chunk-ID bug in the same red.

### 22.5 What Round 5 did NOT touch

- Schema. `chunks.id` PRIMARY KEY constraint stands; the fix is in the *derivation*, not the *storage*.
- The 6 existing pre-Round-5 chunk rows on the operator's dev DB. They use the legacy slug-prefixed ID format and remain queryable; new uploads use the new format.
- BM25 scoring / retrieval. `chunk.id` is treated as opaque by these consumers (verified via grep: no `chunk.id.split` or `startsWith` callers).
- Schema-level `ON DELETE CASCADE`. Tracked as a future hardening pass; Cycle 4's manual DELETE chain handles the rollback in the meantime.
- Charter v1.7. No version bump.

### 22.6 Implementation arc — Sprint 11 final shape

After Round 5, Sprint 11 has gone through five revision passes (all uncommitted, all bundled into the single Sprint 11 commit):

- **Round 1 (in-sprint).** Original Sprint 11 implementation: workspaces table, per-workspace data, upload route, MCP gating, eval continuity.
- **Round 2 (post-impl UX).** Chat-first homepage; in-chat upload; cockpit reframing; spec §19.
- **Round 3 (architectural).** `conversations` workspace-scoped; templated empty state; spec §20.
- **Round 4 (legacy migration).** Drop legacy `documents.slug` UNIQUE via SQLite 12-step rebuild; FK pragma wrap; popover redundancy; spec §21.
- **Round 5 (derivation parity).** Chunk IDs namespaced by documentId; orphan-workspace prevention; spec §22.

The recurring pattern across rounds: each fix was a Sprint 11 architectural gap that became visible only when a real cross-workspace flow exercised it. The bundled commit ships everything as one Sprint 11 result; the sprint-qa rounds capture what was missed and how each gap was closed.
