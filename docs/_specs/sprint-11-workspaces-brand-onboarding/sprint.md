# Sprint Plan — Sprint 11: Workspaces & Brand Onboarding

**Sprint:** 11
**Status:** QA-revised
**Date:** 2026-05-04 (drafted), 2026-05-04 (sprint-QA fixes applied)
**Spec:** [spec.md](spec.md) (status: QA-revised; sprint-QA amended)

---

## Prerequisites

Before any implementation step:

1. Confirm Sprint 10 is fully committed and clean: `git log --oneline -1` shows the Sprint 10 commit `1f646c7 implemented sprint10`. `git status` is clean (excluding the new docs/_specs/sprint-11 directory).
2. Run `npm run test` — capture and pin the baseline. Spec §11.11 expected ≈ 170-180; **the actual count is the Sprint 11 baseline. Record it here in sprint-qa.md before running Task 1.** Sprint 11 target = baseline + **44 net-new** (sprint-QA H1 — was +35 in initial spec; the spec missed migrate, redirect, and onboarding-page test categories that the sprint correctly identifies as needed).
3. Run `npm run test:e2e` — must show **2 specs passing** (`chat-tool-use.spec.ts`, `cockpit-dashboard.spec.ts`).
4. Run `npm run eval:golden` — must show **5/5 passing**.
5. Run `npm run typecheck` — **0 errors**. Run `npm run lint` — pre-existing Sprint 7-era format issues remain documented out-of-scope debt; do not fix in Sprint 11.
6. Verify `.env.local` contains `CONTENTOPS_DB_PATH`, `CONTENTOPS_SESSION_SECRET` (≥ 32 chars; reused for the new workspace cookie), `ANTHROPIC_API_KEY`, `CONTENTOPS_DAILY_SPEND_CEILING_USD`.
7. **Critical: existing dev DBs.** Sprint 11 changes the `documents.slug UNIQUE` posture (spec §4.1, spec-QA H1). Running with an unmigrated dev DB will reject cross-workspace duplicate slugs at the column-level UNIQUE that persists in stored schema. Recommended: snapshot the current DB (`cp data/contentops.db data/contentops.db.bak-pre-s11`), then run `npm run db:seed` for a clean Sprint 11 slate after Task 1 lands. The backup is your rollback path if Sprint 11 hits an unforeseen issue.
8. Library API surfaces verified via Context7 against pinned versions:
   - `@vercel/next.js` v16.2.x — `request.formData()` for multipart parsing in App Router POST handlers; `cookies()` async; `redirect` from `next/navigation`.
   - `@wiselibs/better-sqlite3` — `PRAGMA table_info(<t>)` returns rows with `{cid, name, type, notnull, dflt_value, pk}`; `db.transaction(fn)` is sync-only (Sprint 8 §4.1 constraint still applies — purgeExpiredWorkspaces is sync).
   - `jose` — `SignJWT` + `jwtVerify` API unchanged from Sprint 2 / Sprint 8 use.
9. Confirm `node_modules/` installed; if not, `npm install` first.

---

## Task List

**Reordering note (sprint-QA H2 + H3):** Tasks 1 and 2 swapped (constants must exist before migrate.ts imports them). Old Tasks 9 and 11 merged into one Task 9 — `ToolExecutionContext.workspaceId` extension and `writeAuditRow` workspace_id INSERT must land together, otherwise integration tests fail in the gap. Total: 25 tasks (was 26).

| # | Task | Files | Type |
|---|---|---|---|
| 1 | Workspaces types + constants (`SAMPLE_WORKSPACE`, `WORKSPACE_TTL_SECONDS`, `Workspace`, `WorkspaceCookiePayload`) — *moved up from Task 2; constants must exist before Task 2 imports them (sprint-QA H2)* | `src/lib/workspaces/types.ts`, `src/lib/workspaces/constants.ts` | Create |
| 2 | Schema additions: `workspaces` table + drop `documents.slug UNIQUE` + composite index + `migrate()` | `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/migrate.ts`, `src/lib/db/migrate.test.ts` | Modify + Create |
| 3 | Workspace cookie helper + tests (TDD) | `src/lib/workspaces/cookie.ts`, `src/lib/workspaces/cookie.test.ts` | Create |
| 4 | Workspace queries (`getWorkspace`, `getActiveWorkspace`, `createWorkspace`, `listExpiredWorkspaceIds`) + tests | `src/lib/workspaces/queries.ts`, `src/lib/workspaces/queries.test.ts` | Create |
| 5 | Cleanup helper (`purgeExpiredWorkspaces`) + tests | `src/lib/workspaces/cleanup.ts`, `src/lib/workspaces/cleanup.test.ts` | Create |
| 6 | Refactor ingest pipeline: extract `ingestMarkdownFile(db, { slug, content, workspaceId })`; rewrite `ingestCorpus` to call it | `src/lib/rag/ingest.ts`, `src/lib/rag/ingest.test.ts` | Modify |
| 7 | Upload-validation + ingest-upload helper + tests | `src/lib/workspaces/ingest-upload.ts`, `src/lib/workspaces/ingest-upload.test.ts` | Create |
| 8 | `retrieve()` accepts `workspaceId`; SQL adds `WHERE workspace_id = ?` to vector + BM25 subqueries | `src/lib/rag/retrieve.ts`, `src/lib/rag/retrieve.test.ts` | Modify |
| 9 | **Tool plumbing (merged from old Tasks 9 + 11 per sprint-QA H3):** extend `ToolExecutionContext.workspaceId`; update `writeAuditRow` to write `workspace_id`; update `corpus-tools.ts` + `mutating-tools.ts` to thread it | `src/lib/tools/domain.ts`, `src/lib/tools/audit-log.ts`, `src/lib/tools/audit-log.test.ts`, `src/lib/tools/corpus-tools.ts`, `src/lib/tools/mutating-tools.ts` | Modify |
| 10 | **Test-context sweep (sprint-QA H3 from spec).** Add `workspaceId` to every test that constructs a `ToolExecutionContext` or seeds per-data tables directly | 6+ test files (enumerated in Task 10 body) | Modify |
| 11 | System prompt parameterization (`buildSystemPrompt({role, workspace, context})`) + normalization helper + tests | `src/lib/chat/system-prompt.ts`, `src/lib/chat/system-prompt.test.ts` | Modify |
| 12 | Chat route: read workspace cookie; redirect if missing/expired; thread workspaceId to retrieve + tools; **+1 audit-rollback test (spec §11.5 #4 / sprint-QA M2)** | `src/app/api/chat/route.ts`, `src/app/api/chat/route.integration.test.ts` | Modify |
| 13 | `POST /api/workspaces/select-sample` + tests | `src/app/api/workspaces/select-sample/route.ts`, `src/app/api/workspaces/select-sample/route.integration.test.ts` | Create |
| 14 | `POST /api/workspaces` (upload) + tests | `src/app/api/workspaces/route.ts`, `src/app/api/workspaces/route.integration.test.ts` | Create |
| 15 | `<WorkspacePicker>` component + tests | `src/components/onboarding/WorkspacePicker.tsx`, `src/components/onboarding/WorkspacePicker.test.tsx` | Create |
| 16 | `<UploadForm>` component + tests (client-side validation) | `src/components/onboarding/UploadForm.tsx`, `src/components/onboarding/UploadForm.test.tsx` | Create |
| 17 | `/onboarding` page + tests | `src/app/onboarding/page.tsx`, `src/app/onboarding/page.test.tsx` | Create |
| 18 | Home page (`/`): redirect to `/onboarding` if no workspace cookie + clear stale cookie (sprint-QA L2); render workspace name span in header | `src/app/page.tsx`, `src/app/page.test.tsx` | Modify |
| 19 | Cockpit queries accept `workspaceId`; **+3 isolation tests (sprint-QA M1)** | `src/lib/cockpit/queries.ts`, `src/lib/cockpit/queries.test.ts` | Modify |
| 20 | Cockpit server actions: read workspace cookie; redirect/throw if missing; thread to queries | `src/app/cockpit/actions.ts`, `src/app/cockpit/actions.test.ts` | Modify |
| 21 | Cockpit page: redirect if no workspace cookie; render `<WorkspaceHeader>` (Switch link) | `src/app/cockpit/page.tsx`, `src/app/cockpit/page.test.tsx`, `src/components/cockpit/WorkspaceHeader.tsx` | Modify + Create |
| 22 | Eval runner + script + MCP server + seed script (bundled — each is a one-liner) | `src/lib/evals/runner.ts`, `src/lib/evals/runner.test.ts`, `scripts/eval-golden.ts`, `mcp/contentops-server.ts`, `mcp/contentops-server.test.ts`, `src/db/seed.ts` | Modify |
| 23 | `src/lib/test/seed.ts` defaults `workspaceId = SAMPLE_WORKSPACE.id` | `src/lib/test/seed.ts` | Modify |
| 24 | E2E spec: workspace upload → chat → cockpit scoped to new workspace | `tests/e2e/workspace-onboarding.spec.ts` | Create |
| 25 | Final verification — typecheck, lint, test, eval:golden, test:e2e, mcp:server | — | Verify |

After each task's *Verification* block passes, move to the next task. Sprint 8/9 §10.3-style characterization discipline applies wherever a task touches a Sprint 7-10 file.

---

## Task 2 — Schema additions + `migrate()`

> **Position note (sprint-QA H2).** Document body for Task 2 appears here, before the Task 1 (constants) body below — historical artifact of the swap. Implementers should navigate by `## Task N —` heading via the canonical task list at the top of this file; do not follow document order linearly past Task 0.

**Spec:** §4.1, §14, spec-QA H1, L3

**Goal:** Three concurrent changes to [src/lib/db/schema.ts](src/lib/db/schema.ts):

1. Append the `workspaces` table + `idx_workspaces_expires` index.
2. Drop `UNIQUE` from `documents.slug` column declaration; add `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id)`.
3. New file [src/lib/db/migrate.ts](src/lib/db/migrate.ts) exporting `migrate(db)` that idempotently `ALTER TABLE ADD COLUMN workspace_id` on the five affected tables for existing dev DBs.

[src/lib/db/index.ts](src/lib/db/index.ts) calls `migrate(db)` after `db.exec(SCHEMA)` so existing dev DBs get patched on next boot.

### 1.1 Schema constant changes

```sql
-- Append (new):
CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_workspaces_expires ON workspaces(expires_at);

-- Modify documents (drop UNIQUE on slug):
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL,                 -- was: TEXT UNIQUE NOT NULL
  workspace_id  TEXT NOT NULL,                 -- new
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id);

-- Modify chunks / audit_log / content_calendar / approvals: add workspace_id column inline
-- (NEW database path; existing dev DBs get the column via migrate())
```

The other four tables (`chunks`, `audit_log`, `content_calendar`, `approvals`) gain `workspace_id TEXT NOT NULL` on the table definition + a new index. List the resulting full schema in `schema.ts`.

### 1.2 `migrate(db)` for existing dev DBs

`src/lib/db/migrate.ts`:

```typescript
import type Database from 'better-sqlite3';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return cols.some((c) => c.name === column);
}

const TABLES_NEEDING_WORKSPACE = ['documents', 'chunks', 'audit_log', 'content_calendar', 'approvals'];

/**
 * Idempotent boot-time migration. Adds `workspace_id` to existing per-data
 * tables for dev DBs that pre-date Sprint 11. New DBs get the column from
 * the SCHEMA constant directly; this function is a no-op on those.
 *
 * Spec §4.1; spec-QA H1.
 */
export function migrate(db: Database.Database): void {
  for (const table of TABLES_NEEDING_WORKSPACE) {
    if (!columnExists(db, table, 'workspace_id')) {
      // ADD COLUMN with DEFAULT is constant-time backfill in SQLite.
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${SAMPLE_WORKSPACE.id}'`,
      );
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_${table}_workspace ON ${table}(workspace_id)`,
      );
    }
  }
}
```

**Note** (spec-QA H1): `migrate()` does NOT attempt to drop the old column-level UNIQUE on `documents.slug` for existing dev DBs. SQLite's ALTER TABLE doesn't support modifying constraints; the operator must run `npm run db:seed` (truncate + reseed) for a clean Sprint 11 slate. Document this in the prerequisite preflight (above) and in §14 of the spec.

### 1.3 `lib/db/index.ts` boot integration

```typescript
import { migrate } from './migrate';
// ... existing initialization ...
db.exec(SCHEMA);
migrate(db);
```

### 1.4 `migrate.test.ts`

```typescript
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from './migrate';
import { SCHEMA } from './schema';

describe('migrate', () => {
  it('is a no-op when workspace_id columns already exist (fresh schema)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    // Re-running is also idempotent
    migrate(db);
    const cols = db.prepare(`PRAGMA table_info(documents)`).all() as { name: string }[];
    const wsCols = cols.filter((c) => c.name === 'workspace_id');
    expect(wsCols).toHaveLength(1);
  });

  it('adds workspace_id to a pre-Sprint-11 schema (no column initially)', () => {
    const db = new Database(':memory:');
    // Simulate a pre-Sprint-11 documents table.
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        content TEXT NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, chunk_level TEXT NOT NULL, heading TEXT, content TEXT NOT NULL, embedding BLOB, embedding_model TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE audit_log (id TEXT PRIMARY KEY, tool_name TEXT NOT NULL, tool_use_id TEXT, actor_user_id TEXT NOT NULL, actor_role TEXT NOT NULL, conversation_id TEXT, input_json TEXT NOT NULL, output_json TEXT NOT NULL, compensating_action_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'executed', created_at INTEGER NOT NULL, rolled_back_at INTEGER);
      CREATE TABLE content_calendar (id TEXT PRIMARY KEY, document_slug TEXT NOT NULL, scheduled_for INTEGER NOT NULL, channel TEXT NOT NULL, scheduled_by TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE approvals (id TEXT PRIMARY KEY, document_slug TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL);
    `);
    migrate(db);
    for (const table of ['documents', 'chunks', 'audit_log', 'content_calendar', 'approvals']) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      expect(cols.some((c) => c.name === 'workspace_id'), `${table} should have workspace_id`).toBe(true);
    }
  });

  it('cross-workspace duplicate slug succeeds on the new SCHEMA (composite UNIQUE INDEX)', () => {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    db.exec("INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES ('ws-a', 'A', 'x', 0, 1)");
    db.exec("INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES ('ws-b', 'B', 'x', 0, 1)");
    db.exec("INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d1', 'brand-identity', 'ws-a', 't', 'c', 'h', 1)");
    db.exec("INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES ('d2', 'brand-identity', 'ws-b', 't', 'c', 'h', 1)");
    const count = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }).c;
    expect(count).toBe(2);
  });
});
```

**Verification:**

```bash
npm run typecheck                                          # 0 errors
npm run test -- src/lib/db/migrate.test.ts                 # 3 passing
npm run test -- src/lib/db/schema.test.ts                  # existing schema test still passes
```

---

## Task 1 — Workspaces types + constants

**Spec:** §5

**Goal:** Two new files. No tests of their own (types/constants are exercised by downstream tests).

### 2.1 `src/lib/workspaces/constants.ts`

```typescript
export const SAMPLE_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Side Quest Syndicate',
  description:
    'A gaming content brand for players who treat every session as an adventure worth talking about.',
} as const;

export const WORKSPACE_TTL_SECONDS = 60 * 60 * 24; // 24h
```

### 2.2 `src/lib/workspaces/types.ts`

```typescript
export interface Workspace {
  id: string;
  name: string;
  description: string;
  is_sample: 0 | 1;
  created_at: number;
  expires_at: number | null;
}

export interface WorkspaceCookiePayload {
  workspace_id: string;
}
```

**Verification:**

```bash
npm run typecheck                                          # 0 errors
```

---

## Task 3 — Workspace cookie helper + tests (TDD)

**Spec:** §4.3, spec-QA H2

**Cite-and-copy.** The `jose` JWT pattern is byte-equivalent to [src/lib/auth/session.ts](src/lib/auth/session.ts). Mirror the structure (HS256, `getSecret()` reading `process.env.CONTENTOPS_SESSION_SECRET`, `setExpirationTime('24h')`). Do not paraphrase the secret-loading helper.

### 3.1 Tests first — `src/lib/workspaces/cookie.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { decodeWorkspace, encodeWorkspace } from './cookie';

describe('workspace cookie', () => {
  it('round-trips a workspace_id through encode/decode', async () => {
    const token = await encodeWorkspace({ workspace_id: 'ws-test-1' });
    const payload = await decodeWorkspace(token);
    expect(payload?.workspace_id).toBe('ws-test-1');
  });

  it('returns null for a tampered token', async () => {
    const token = await encodeWorkspace({ workspace_id: 'ws-test-1' });
    const tampered = `${token.slice(0, -10)}deadbeef00`;
    expect(await decodeWorkspace(tampered)).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    expect(await decodeWorkspace('not-a-jwt')).toBeNull();
  });
});
```

### 3.2 Helper — `src/lib/workspaces/cookie.ts`

```typescript
import { jwtVerify, SignJWT } from 'jose';
import type { WorkspaceCookiePayload } from './types';

export const WORKSPACE_COOKIE_NAME = 'contentops_workspace';

function getSecret(): Uint8Array {
  const raw = process.env.CONTENTOPS_SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('CONTENTOPS_SESSION_SECRET must be set and ≥ 32 chars.');
  }
  return new TextEncoder().encode(raw);
}

export async function encodeWorkspace(payload: WorkspaceCookiePayload): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function decodeWorkspace(token: string): Promise<WorkspaceCookiePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload as unknown as WorkspaceCookiePayload;
  } catch {
    return null;
  }
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/workspaces/cookie.test.ts          # 3 passing
```

---

## Task 4 — Workspace queries + tests

**Spec:** §4.13, spec-QA H2

### 4.1 Tests first — `src/lib/workspaces/queries.test.ts`

Five tests:

1. `createWorkspace` inserts and returns the row.
2. `getWorkspace(id)` returns the row when it exists.
3. `getWorkspace(id)` returns null when it doesn't exist.
4. `getActiveWorkspace(id)` returns null for an expired non-sample workspace (sprint-QA H2).
5. `listExpiredWorkspaceIds()` returns non-sample workspaces with `expires_at < now`, excludes sample.

### 4.2 Helper — `src/lib/workspaces/queries.ts`

```typescript
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { WORKSPACE_TTL_SECONDS } from './constants';
import type { Workspace } from './types';

export function getWorkspace(db: Database.Database, id: string): Workspace | null {
  return (db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | undefined) ?? null;
}

/**
 * Returns the workspace iff it exists AND is active (sample OR not expired).
 * Spec §4.13. Read paths use this; bare getWorkspace is for cleanup-internal use only.
 */
export function getActiveWorkspace(db: Database.Database, id: string): Workspace | null {
  const ws = getWorkspace(db, id);
  if (!ws) return null;
  if (ws.is_sample === 1) return ws;
  if (ws.expires_at !== null && ws.expires_at > Math.floor(Date.now() / 1000)) return ws;
  return null;
}

export interface CreateWorkspaceInput {
  name: string;
  description: string;
}

export function createWorkspace(db: Database.Database, input: CreateWorkspaceInput): Workspace {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + WORKSPACE_TTL_SECONDS;
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(id, input.name, input.description, now, expires_at);
  return { id, name: input.name, description: input.description, is_sample: 0, created_at: now, expires_at };
}

export function listExpiredWorkspaceIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM workspaces WHERE is_sample = 0 AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/workspaces/queries.test.ts         # 5 passing
```

---

## Task 5 — Cleanup helper + tests

**Spec:** §4.5

### 5.1 Tests first — `src/lib/workspaces/cleanup.test.ts`

Three tests:

1. No expired → no-op (returns 0; sample still exists).
2. Expired non-sample workspace → cascade DELETEs from chunks, audit_log, content_calendar, approvals, documents, workspaces.
3. Sample workspace (`expires_at = NULL`, `is_sample = 1`) is NEVER purged regardless of how `getActiveWorkspace` evaluates.

### 5.2 Helper — `src/lib/workspaces/cleanup.ts`

```typescript
import type Database from 'better-sqlite3';

export interface PurgeResult { purged: number }

export function purgeExpiredWorkspaces(db: Database.Database): PurgeResult {
  let purged = 0;
  const result = db.transaction(() => {
    const expired = db
      .prepare(
        `SELECT id FROM workspaces
         WHERE is_sample = 0 AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
      )
      .all() as { id: string }[];
    if (expired.length === 0) return;

    const ids = expired.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    // Delete child rows first (no FK cascade — Sprint 8 §4.2 documentary-FK posture).
    db.prepare(`DELETE FROM chunks WHERE workspace_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM audit_log WHERE workspace_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM content_calendar WHERE workspace_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM approvals WHERE workspace_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM documents WHERE workspace_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM workspaces WHERE id IN (${placeholders})`).run(...ids);
    purged = ids.length;
  });
  result();
  return { purged };
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/workspaces/cleanup.test.ts         # 3 passing
```

---

## Task 6 — Refactor ingest pipeline

**Spec:** §4.4, spec §6.2 ingestion

**Goal:** Extract the per-file ingestion logic from `ingestCorpus` into `ingestMarkdownFile(db, { slug, content, workspaceId })`. Rewrite `ingestCorpus(db, dir)` to iterate the corpus directory and call the new helper with `SAMPLE_WORKSPACE.id`.

### 6.1 Refactored `src/lib/rag/ingest.ts`

```typescript
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { chunkDocument } from './chunk-document';
import { embedBatch } from './embed';

const DEFAULT_CORPUS_DIR = join(process.cwd(), 'src', 'corpus');
const EMBEDDING_MODEL = 'all-MiniLM-L6-v2';

interface DocumentRow { id: string; content_hash: string }

export interface IngestFileInput {
  slug: string;
  content: string;
  workspaceId: string;
}

export async function ingestMarkdownFile(
  db: Database.Database,
  input: IngestFileInput,
): Promise<{ documentId: string; chunkCount: number }> {
  const { slug, content, workspaceId } = input;
  const contentHash = createHash('sha256').update(content).digest('hex');

  // Lookup uses (slug, workspace_id) — composite index from Task 1.
  const existing = db
    .prepare('SELECT id, content_hash FROM documents WHERE slug = ? AND workspace_id = ?')
    .get(slug, workspaceId) as DocumentRow | undefined;

  if (existing?.content_hash === contentHash) {
    return { documentId: existing.id, chunkCount: 0 };
  }

  const title = extractTitle(content, slug);
  const chunks = chunkDocument(slug, title, content);
  const vectors = await embedBatch(chunks.map((c) => c.embeddingInput));
  const documentId = existing?.id ?? randomUUID();

  const upsert = db.transaction(() => {
    if (existing) {
      db.prepare(
        'UPDATE documents SET title = ?, content = ?, content_hash = ?, created_at = ? WHERE id = ?',
      ).run(title, content, contentHash, Date.now(), documentId);
      db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
    } else {
      db.prepare(
        'INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(documentId, slug, workspaceId, title, content, contentHash, Date.now());
    }

    const insertChunk = db.prepare(`
      INSERT INTO chunks
        (id, document_id, workspace_id, chunk_index, chunk_level, heading, content, embedding, embedding_model, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    chunks.forEach((chunk, index) => {
      const vector = vectors[index];
      const blob = vector ? Buffer.from(new Float32Array(vector).buffer) : null;
      insertChunk.run(
        chunk.id,
        documentId,
        workspaceId,
        index,
        chunk.level,
        chunk.heading,
        chunk.content,
        blob,
        EMBEDDING_MODEL,
        Date.now(),
      );
    });
  });

  upsert();
  return { documentId, chunkCount: chunks.length };
}

export async function ingestCorpus(
  db: Database.Database,
  corpusDir: string = DEFAULT_CORPUS_DIR,
  workspaceId: string = SAMPLE_WORKSPACE.id,
): Promise<void> {
  const files = readdirSync(corpusDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = readFileSync(join(corpusDir, file), 'utf-8');
    const result = await ingestMarkdownFile(db, { slug, content, workspaceId });
    console.log(`${slug}: ${result.chunkCount} chunks embedded`);
  }
}

function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^# (.+)$/m);
  return match ? match[1].trim() : fallback;
}
```

### 6.2 `ingest.test.ts`

Add tests if not present:

1. `ingestMarkdownFile` writes documents row with the workspaceId.
2. `ingestMarkdownFile` writes chunks rows with the workspaceId.
3. Cross-workspace duplicate slug works (same as Task 1.4 #3, but exercised through the helper).

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/rag/ingest.test.ts                 # passes

# Sprint-QA M4: grep audit for unexpected ingestCorpus/ingestMarkdownFile callers.
# Expected output: a single line in src/db/seed.ts (Task 22 modifies it explicitly).
# Anything else needs a workspace_id audit before proceeding.
grep -rn "ingestCorpus\|ingestMarkdownFile" src/ scripts/ mcp/ | grep -v "ingest\.ts:"
```

---

## Task 7 — Upload-validation + ingest-upload helper + tests

**Spec:** §4.4, §6.2, spec-QA M2

### 7.1 `src/lib/workspaces/ingest-upload.ts`

> **Concurrency note (sprint-QA L4).** `ingestUpload` calls `ingestMarkdownFile` in a sequential `for` loop. For 5 files × ~250ms ≈ 1.25s — fine for the demo's UX tolerance. Parallelizing with `Promise.all(validated.files.map(...))` is safe (each file produces an independent transaction) and is the future polish if file caps grow. Out of scope for Sprint 11.

```typescript
import type Database from 'better-sqlite3';
import { ingestMarkdownFile } from '@/lib/rag/ingest';
import { createWorkspace } from './queries';

export interface UploadFile {
  filename: string;
  content: string;
  size: number;
  mimeType: string;
}

export interface ValidatedUpload {
  name: string;
  description: string;
  files: UploadFile[];
}

const MAX_FILE_BYTES = 100_000;
const MAX_FILES = 5;
const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 280;

export class UploadValidationError extends Error {
  constructor(message: string, public field?: string) { super(message); }
}

export function validateUpload(input: {
  name: string;
  description: string;
  files: UploadFile[];
}): ValidatedUpload {
  const name = input.name.trim();
  if (!name || name.length > MAX_NAME_CHARS) {
    throw new UploadValidationError(`Brand name must be 1-${MAX_NAME_CHARS} characters.`, 'name');
  }
  const description = input.description.trim();
  if (!description || description.length > MAX_DESCRIPTION_CHARS) {
    throw new UploadValidationError(`Description must be 1-${MAX_DESCRIPTION_CHARS} characters.`, 'description');
  }
  if (input.files.length === 0) {
    throw new UploadValidationError('Upload at least one .md file.', 'files');
  }
  if (input.files.length > MAX_FILES) {
    throw new UploadValidationError(`Up to ${MAX_FILES} files only.`, 'files');
  }
  for (const f of input.files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new UploadValidationError(`${f.filename} exceeds ${MAX_FILE_BYTES} bytes.`, 'files');
    }
    // Spec-QA M2: accept if EITHER MIME ok OR filename .md.
    const mimeOk = f.mimeType === 'text/markdown' || f.mimeType === 'text/plain';
    const extOk = /\.md$/i.test(f.filename);
    if (!mimeOk && !extOk) {
      throw new UploadValidationError(`${f.filename} is not a markdown file.`, 'files');
    }
  }
  return { name, description, files: input.files };
}

export async function ingestUpload(
  db: Database.Database,
  validated: ValidatedUpload,
): Promise<{ workspaceId: string }> {
  const workspace = createWorkspace(db, { name: validated.name, description: validated.description });
  for (const file of validated.files) {
    const slug = file.filename.replace(/\.md$/i, '');
    await ingestMarkdownFile(db, { slug, content: file.content, workspaceId: workspace.id });
  }
  return { workspaceId: workspace.id };
}
```

### 7.2 Tests — `src/lib/workspaces/ingest-upload.test.ts`

5 tests (per spec §11.3):

1. Rejects oversized file.
2. Rejects too many files (6 files).
3. Rejects bad MIME *and* missing `.md` extension (both fallbacks fail).
4. **Accepts `.md` filename with `application/octet-stream` MIME** (spec-QA M2 — MIME-or-extension fallback).
5. Happy path: 2 files → workspace created → chunks inserted with the new workspace_id.

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/workspaces/ingest-upload.test.ts   # 5 passing
```

---

## Task 8 — `retrieve()` accepts `workspaceId`

**Spec:** §4.6

**Goal:** `retrieve()` becomes `retrieve(query, db, opts)` where opts now includes a required `workspaceId`. Vector + BM25 SQL gain `WHERE workspace_id = ?` clauses.

### 8.1 Update `src/lib/rag/retrieve.ts`

Find every SQL string that joins / queries `chunks` or `documents` and add the workspace filter. Update the helper signatures:

```typescript
export interface RetrieveOptions {
  workspaceId: string;     // <-- now required
  maxResults?: number;
  // ... existing fields
}

export async function retrieve(
  query: string,
  db: Database.Database,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]>
```

### 8.2 Update `retrieve.test.ts`

Existing tests pass workspaceId via test fixtures. Add one new test:

- "Cross-workspace isolation: a chunk in workspace A is not returned for a query against workspace B."

**Characterization-test discipline.** Capture the existing test suite output before and after. Assertion text and counts must be byte-identical for the existing tests; only the new isolation test is additive.

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/rag/retrieve.test.ts               # passes
```

---

## Task 9 — Tool plumbing: `ToolExecutionContext.workspaceId` + `writeAuditRow` + tool implementations

**Spec:** §4.6, spec-QA H3, sprint-QA H3 (merged from old Tasks 9 + 11)

> **Merge note (sprint-QA H3).** This task was originally split into two: (a) extend `ToolExecutionContext` + corpus/mutating tools; (b) update `writeAuditRow` signature to write workspace_id. Splitting them produced an integration-test gap — between the two tasks, mutating-tool tests would fail because `writeAuditRow`'s INSERT lacks `workspace_id` while the SCHEMA now requires it (`workspace_id NOT NULL`). Both halves of the contract land in this single task.

### 9.1 `src/lib/tools/domain.ts`

```typescript
export interface ToolExecutionContext {
  userId: string;
  role: Role;
  conversationId: string;
  toolUseId?: string;
  workspaceId: string;     // Sprint 11 — required
}
```

### 9.2 `src/lib/tools/corpus-tools.ts`

`createSearchCorpusTool` and `createListDocumentsTool` thread `ctx.workspaceId` into their underlying queries. Example:

```typescript
execute: async (input, ctx) => {
  const chunks = await retrieve(query, db, {
    workspaceId: ctx.workspaceId,
    maxResults,
  });
  // ...
}
```

### 9.3 `src/lib/tools/mutating-tools.ts`

`createScheduleContentItemTool` and `createApproveDraftTool` write `workspace_id` into their respective tables. Validation queries (e.g., `SELECT 1 FROM documents WHERE slug = ?`) gain `AND workspace_id = ?`.

```typescript
const exists = db
  .prepare('SELECT 1 FROM documents WHERE slug = ? AND workspace_id = ?')
  .get(slug, ctx.workspaceId);
if (!exists) throw new Error(`Unknown document_slug: ${slug}`);

const id = randomUUID();
db.prepare(
  `INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
).run(id, slug, ctx.workspaceId, scheduledForUnix, channel, ctx.userId, Math.floor(Date.now() / 1000));
```

Same for `approve_draft` writing to `approvals`.

### 9.4 `writeAuditRow` signature

[src/lib/tools/audit-log.ts](src/lib/tools/audit-log.ts) — `writeAuditRow`'s INSERT now includes `workspace_id`, derived from the existing `context: ToolExecutionContext` parameter (no new `AuditWriteInput` field needed):

```typescript
db.prepare(
  `INSERT INTO audit_log (
     id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
     workspace_id,
     input_json, output_json, compensating_action_json, created_at
   ) VALUES (
     @id, @tool_name, @tool_use_id, @actor_user_id, @actor_role, @conversation_id,
     @workspace_id,
     @input_json, @output_json, @compensating_action_json, @created_at
   )`,
).run({
  // ... existing fields ...
  workspace_id: input.context.workspaceId,
});
```

`audit-log.test.ts`: existing round-trip test gains a `workspace_id` field assertion (extends existing test, not net-new).

**Verification:**

```bash
npm run typecheck                                          # 0 errors
npm run test -- src/lib/tools/audit-log.test.ts            # passes (existing tests with workspace_id assertion)
```

(Other tests come in Task 10.)

---

## Task 10 — Test-context sweep

**Spec:** spec-QA H3

**Goal:** Add `workspaceId: SAMPLE_WORKSPACE.id` (or test-specific workspace UUID) to every test that constructs a `ToolExecutionContext` or directly INSERTs into the per-data tables.

**Grep audit before editing:**

```bash
grep -rn "ToolExecutionContext\|conversationId:" src/ | grep -E '\\.test\\.(ts|tsx):'
grep -rn "INSERT INTO \\(audit_log\\|content_calendar\\|approvals\\|documents\\|chunks\\)" src/ | grep -E '\\.test\\.(ts|tsx):'
```

Files to update (from the grep + spec-QA H3 enumeration):

- `src/lib/tools/registry.test.ts` — every test-context literal gets `workspaceId: SAMPLE_WORKSPACE.id`.
- `src/lib/tools/mutating-tools.test.ts` — same.
- `src/lib/tools/audit-log.test.ts` — same; also the test fixture for `writeAuditRow` calls passes a workspace_id (and the helper's signature also needs the column added — Task 11 reminder).
- `src/app/api/audit/[id]/rollback/route.integration.test.ts` — direct INSERT into `audit_log` adds `workspace_id`.
- `src/app/api/audit/route.integration.test.ts` — same.
- `src/app/api/chat/route.integration.test.ts` — any direct INSERT.
- `src/lib/cockpit/queries.test.ts` — all direct INSERTs into `audit_log` / `content_calendar` / `approvals` add `workspace_id`.
- `src/components/cockpit/AuditFeedPanel.test.tsx` — fixture `makeRow` sets `workspace_id: SAMPLE_WORKSPACE.id`.

**Verification — characterization discipline:**

Capture full test output BEFORE and AFTER:

```bash
mkdir -p tmp
npm run test > tmp/before-task10.txt 2>&1
# ... apply edits ...
npm run test > tmp/after-task10.txt 2>&1
diff tmp/before-task10.txt tmp/after-task10.txt
```

Allowed differences: timing values, the new tests added in Tasks 1-9, the new `workspaceId` in any test name that includes context. Assertion text and counts on existing tests must be unchanged.

If existing tests fail after this task's edits, the field addition broke a contract — investigate before continuing.

**Verification:**

```bash
npm run typecheck
npm run test                                               # all existing + new tests pass
```

---

## Task 11 — System prompt parameterization + tests

**Spec:** §4.7, spec-QA L1

### 12.1 `src/lib/chat/system-prompt.ts`

```typescript
import type { Role } from '@/lib/auth/types';
import type { Workspace } from '@/lib/workspaces/types';
import type { RetrievedChunk } from '@/lib/rag/retrieve';

const MAX_PASSAGE_CHARS = 400;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeDescription(d: string): string {
  return d.trim().replace(/\.$/, '');
}

function formatContextBlock(workspace: Workspace, chunks: RetrievedChunk[]): string {
  const header =
    `The following passages are from the ${workspace.name} brand documents.\n` +
    `Use them to ground your response. Cite the source heading when relevant.`;
  const entries = chunks.map((chunk, i) => {
    const heading = chunk.heading ?? '(no heading)';
    return `[${i + 1}] ${chunk.documentSlug} > ${heading}\n"${truncate(chunk.content, MAX_PASSAGE_CHARS)}"`;
  });
  return `<context>\n${header}\n\n${entries.join('\n\n')}\n</context>`;
}

export function buildSystemPrompt(args: {
  role: Role;
  workspace: Workspace;
  context?: RetrievedChunk[];
}): string {
  const utcDate = new Date().toISOString().slice(0, 10);
  const base = [
    `You are an AI assistant for ${args.workspace.name}. ${normalizeDescription(args.workspace.description)}.`,
    `You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling content for this brand.`,
    `The operator's role is ${args.role}.`,
    `Today's date: ${utcDate}.`,
    `Be concise and practical.`,
    'When using tools that take a `document_slug`, prefer to call `list_documents` (or `search_corpus`) first to find the exact slug rather than guessing — guessed slugs trigger validation errors and waste a turn.',
    'When invoking `schedule_content_item`, pass the `scheduled_for` time as an ISO 8601 string (e.g. "2026-05-02T09:00:00Z") — the server parses it. In your conversational reply, phrase scheduled times in human-friendly form (e.g. "Tomorrow at 9:00 AM UTC"); never expose Unix timestamps or raw numeric values.',
  ].join(' ');
  if (!args.context || args.context.length === 0) return base;
  return `${base}\n\n${formatContextBlock(args.workspace, args.context)}`;
}
```

### 12.2 `system-prompt.test.ts`

Two tests:

1. Brand identity line includes workspace name; tool-usage guidance unchanged byte-for-byte.
2. Description normalization: `'A test brand.'` and `'A test brand'` both produce exactly one trailing period.

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/chat/system-prompt.test.ts         # 2 passing
```

---

## Task 12 — Chat route: workspace cookie + thread workspaceId

**Spec:** §4.6, §4.12, sprint-QA M2 + M3

### Imports needed (sprint-QA M3)

```typescript
import { decodeWorkspace, WORKSPACE_COOKIE_NAME } from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';
```

(Order doesn't matter — biome auto-fix will sort imports per Sprint 9 lint convention.)

**Goal:** [src/app/api/chat/route.ts](src/app/api/chat/route.ts) reads the workspace cookie alongside the session cookie. If missing or expired, redirect to `/onboarding` (or return 401 with Location header for fetch-driven clients — TBD; recommend redirect on GET, 401 on POST since the chat endpoint is POST). The cookie's `workspace_id` resolves to a `Workspace` row via `getActiveWorkspace`. That row threads to:

- `retrieve(query, db, { workspaceId, ... })`
- `buildSystemPrompt({ role, workspace, context })`
- `ToolExecutionContext.workspaceId` for every tool call

If the workspace cookie decodes but `getActiveWorkspace` returns null (expired/purged), respond with a JSON error and `Set-Cookie` clearing the workspace cookie. Client redirects to `/onboarding`.

### 13.1 Edits

```typescript
// Add at top of POST handler, alongside session-cookie read:
const workspaceCookie = req.cookies.get(WORKSPACE_COOKIE_NAME);
const workspacePayload = workspaceCookie ? await decodeWorkspace(workspaceCookie.value) : null;
if (!workspacePayload) return NextResponse.json({ error: 'No workspace selected', redirect: '/onboarding' }, { status: 401 });

const workspace = getActiveWorkspace(db, workspacePayload.workspace_id);
if (!workspace) {
  const res = NextResponse.json({ error: 'Workspace expired', redirect: '/onboarding' }, { status: 401 });
  res.cookies.delete(WORKSPACE_COOKIE_NAME);
  return res;
}
```

Then thread `workspace.id` into retrieve, buildSystemPrompt, and the ToolExecutionContext at the registry call site.

### 13.2 `route.integration.test.ts` updates (sprint-QA M2 expands to 4 tests)

Add 4 new tests:

1. POST without workspace cookie → 401 with `redirect: '/onboarding'`.
2. POST with expired workspace cookie → 401, cookie cleared in response.
3. POST with valid workspace cookie → retrieval is workspace-scoped (verifiable via DB-fixture cross-workspace data isolation).
4. **Audit rollback within active workspace** (sprint-QA M2 / spec §11.5 #4): seed a row in the active workspace's `audit_log`, POST to `/api/audit/[id]/rollback` with the workspace cookie, assert 200 and the row marked rolled_back. (No cross-workspace negative test — Sprint 8 §4.4 audit-ownership P1 already prevents misuse; spec §4.6 documents the reasoning.)

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/api/chat/route.integration.test.ts # passes (existing + 4 new)
```

---

## Task 13 — `POST /api/workspaces/select-sample`

**Spec:** §4.4, §7

### 14.1 Route — `src/app/api/workspaces/select-sample/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { encodeWorkspace, WORKSPACE_COOKIE_NAME } from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const token = await encodeWorkspace({ workspace_id: SAMPLE_WORKSPACE.id });
  const res = NextResponse.json({ workspace_id: SAMPLE_WORKSPACE.id }, { status: 200 });
  res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24h, aligned with JWT exp
  });
  return res;
}
```

### 14.2 Tests — `route.integration.test.ts`

2 tests:

1. POST returns 200 with workspace_id.
2. Response sets `Set-Cookie` with `contentops_workspace=<jwt>`.

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/api/workspaces/select-sample       # 2 passing
```

---

## Task 14 — `POST /api/workspaces` (upload)

**Spec:** §4.4, spec-QA M2

### 15.1 Route — `src/app/api/workspaces/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encodeWorkspace, WORKSPACE_COOKIE_NAME } from '@/lib/workspaces/cookie';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import {
  ingestUpload,
  UploadValidationError,
  validateUpload,
  type UploadFile,
} from '@/lib/workspaces/ingest-upload';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const name = String(form.get('name') ?? '');
    const description = String(form.get('description') ?? '');
    const fileEntries = form.getAll('files').filter((f): f is File => f instanceof File);
    const files: UploadFile[] = await Promise.all(
      fileEntries.map(async (f) => ({
        filename: f.name,
        content: await f.text(),
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
      })),
    );

    const validated = validateUpload({ name, description, files });

    // Lazy TTL purge BEFORE insert (spec §4.5).
    purgeExpiredWorkspaces(db);

    const { workspaceId } = await ingestUpload(db, validated);
    const token = await encodeWorkspace({ workspace_id: workspaceId });

    const res = NextResponse.json({ workspace_id: workspaceId }, { status: 200 });
    res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24,
    });
    return res;
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error('Workspace upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

### 15.2 Tests — `route.integration.test.ts`

4 tests (per spec §11.4):

1. Valid upload → 200, cookie set, workspace + chunks visible in DB.
2. Missing name → 400 with `field: 'name'`.
3. Oversized file → 400 with `field: 'files'`.
4. Too many files (6) → 400 with `field: 'files'`.

(Spec §11.4 also mentions a 5th test for the success case — already covered by #1; or a separate "MIME-or-extension" test which is at the helper layer in Task 7.)

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/api/workspaces/route.integration.test.ts  # 4 passing
```

---

## Task 15 — `<WorkspacePicker>` component + tests

**Spec:** §6.1

### 16.1 Component

Two-card layout. Card 1 ("Try sample brand") POSTs to `/api/workspaces/select-sample` and on success navigates to `/`. Card 2 ("Upload your brand") expands to render `<UploadForm>` inline.

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadForm } from './UploadForm';

export function WorkspacePicker() {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function selectSample() {
    setIsLoading(true);
    try {
      const res = await fetch('/api/workspaces/select-sample', { method: 'POST' });
      if (res.ok) router.push('/');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Try sample brand</h2>
        <p className="mt-2 text-sm text-gray-600">
          Side Quest Syndicate — a gaming content brand seeded with brand identity, audience profile, content pillars, and style guide. Instant.
        </p>
        <button
          type="button"
          onClick={selectSample}
          disabled={isLoading}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isLoading ? 'Loading…' : 'Try sample brand'}
        </button>
      </article>
      <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Upload your brand</h2>
        <p className="mt-2 text-sm text-gray-600">
          Markdown files describing your brand identity and audience. Up to 5 files, 100KB each.
        </p>
        {showUpload ? (
          <UploadForm onSuccess={() => router.push('/')} />
        ) : (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-4 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload your brand
          </button>
        )}
      </article>
    </div>
  );
}
```

### 16.2 Tests

2 tests:

1. Renders both CTAs ("Try sample brand" + "Upload your brand").
2. Clicking sample CTA POSTs to `/api/workspaces/select-sample` (verify via mocked fetch).

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/onboarding/WorkspacePicker.test.tsx  # 2 passing
```

---

## Task 16 — `<UploadForm>` component + tests

**Spec:** §6.2

Form with three field groups: brand_name, description, files. Client-side validation mirrors server-side (size, count, MIME-or-extension). Submit constructs `FormData` and POSTs to `/api/workspaces`. On success, calls `props.onSuccess`.

### 17.1 Tests

2 tests:

1. Blank submit shows inline errors (name, description, files).
2. Valid submit triggers fetch to `/api/workspaces` with multipart body.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/onboarding/UploadForm.test.tsx       # 2 passing
```

---

## Task 17 — `/onboarding` page

**Spec:** §4.4, §6

### 18.1 `src/app/onboarding/page.tsx`

```tsx
import { WorkspacePicker } from '@/components/onboarding/WorkspacePicker';

export const runtime = 'nodejs';

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[#f8f9fa] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Set up your brand</h1>
          <p className="mt-2 text-gray-600">
            Try the sample brand to explore, or upload your own brand identity to get started.
          </p>
        </header>
        <WorkspacePicker />
      </div>
    </main>
  );
}
```

### 18.2 Tests

2 tests:

1. Page renders with "Set up your brand" header and `<WorkspacePicker>`.
2. (No redirect test — onboarding is reachable from anywhere; a user might visit to switch.)

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/onboarding/page.test.tsx                    # 2 passing
```

---

## Task 18 — Home page redirect + workspace name span

**Spec:** §4.12, §6.4

### 18.1 Edits to `src/app/page.tsx` (sprint-QA L2 — clear stale cookie)

Read the workspace cookie. If absent or doesn't decode, `redirect('/onboarding')`. If decodes but `getActiveWorkspace` is null, **clear the cookie** then redirect. Otherwise, render normally with the workspace name in the header (between the logo and the Cockpit link).

```tsx
const cookieStore = await cookies();
const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
const workspacePayload = workspaceCookie ? await decodeWorkspace(workspaceCookie.value) : null;
if (!workspacePayload) redirect('/onboarding');
const workspace = getActiveWorkspace(db, workspacePayload.workspace_id);
if (!workspace) {
  // Cookie decoded but workspace gone — clear and redirect (sprint-QA L2)
  cookieStore.delete(WORKSPACE_COOKIE_NAME);
  redirect('/onboarding');
}
```

In the header JSX, after the logo Link:

```tsx
<span className="text-sm text-gray-500">· {workspace.name}</span>
```

### 19.2 `page.test.tsx` updates

Add 3 cases:

1. No workspace cookie → redirects to `/onboarding`.
2. Expired/invalid workspace cookie → redirects to `/onboarding`.
3. Valid workspace cookie → renders, workspace name visible in header.

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/page.test.tsx                               # passes (existing + 3 new)
```

---

## Task 19 — Cockpit queries: workspaceId

**Spec:** §4.8, sprint-QA M1

Every helper in [src/lib/cockpit/queries.ts](src/lib/cockpit/queries.ts) gains `workspaceId: string` as a required parameter. SQL `WHERE` clauses gain `AND workspace_id = ?`. Spend stays global (per spec §4.8 exception).

```typescript
export function listRecentAuditRows(
  db: Database.Database,
  opts: { actorUserId?: string; workspaceId: string; limit: number },
): CockpitAuditRow[]
```

`queries.test.ts` updates: add `workspace_id` to every test INSERT (covered by Task 10 sweep). Add **three new isolation tests** (sprint-QA M1 — was 1; spec §11.6 calls for 3):

1. `listRecentAuditRows` returns only the active workspace's audit rows when given a non-undefined `workspaceId` filter.
2. `listScheduledItems` returns only the active workspace's calendar entries.
3. `listRecentApprovals` returns only the active workspace's approvals.

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/cockpit/queries.test.ts                     # 9 passing (was 6 baseline + 3 new isolation tests)
```

---

## Task 20 — Cockpit server actions: read workspace cookie

**Spec:** §4.8

`src/app/cockpit/actions.ts`: every action's `resolveSession` is augmented to also resolve workspace via `decodeWorkspace` + `getActiveWorkspace`. If the workspace is missing/expired, throw — server actions can't redirect, so this is a security boundary that the cockpit page handles via its own redirect (Task 22).

```typescript
async function resolveContext(): Promise<{ session: SessionResult; workspace: Workspace }> {
  const session = await resolveSession();  // existing
  const cookieStore = await cookies();
  const wsCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
  const wsPayload = wsCookie ? await decodeWorkspace(wsCookie.value) : null;
  if (!wsPayload) throw new Error('No workspace selected');
  const workspace = getActiveWorkspace(db, wsPayload.workspace_id);
  if (!workspace) throw new Error('Workspace expired');
  return { session, workspace };
}
```

Each action's call to a query helper passes `workspaceId: workspace.id`.

### 21.1 `actions.test.ts` updates

Existing 4 tests get a workspace cookie mocked alongside the session cookie. Add 1 new test: action throws when workspace cookie is missing.

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/cockpit/actions.test.ts                     # 5 passing
```

---

## Task 21 — Cockpit page redirect + WorkspaceHeader

**Spec:** §4.8, §6.3

### 22.1 `src/app/cockpit/page.tsx` edits

Same redirect logic as the home page (Task 19), but landing state for the cockpit. Reads workspace cookie, redirects to `/onboarding` if missing/invalid.

Header: insert `<WorkspaceHeader workspace={workspace} />` between "← Chat" and "Operator Cockpit".

### 21.2 New component — `src/components/cockpit/WorkspaceHeader.tsx` (sprint-QA L1 — icon fallback)

Use `Edit2` from `lucide-react`. If the installed version doesn't export it, fall back to `Edit` (the v0.x name) or `Pencil`. Verify with `grep "Edit2\\|Pencil\\|Edit " node_modules/lucide-react/dist/esm/icons/*.js | head -3` before importing.

```tsx
import { Edit2 } from 'lucide-react';
import Link from 'next/link';
import type { Workspace } from '@/lib/workspaces/types';

export function WorkspaceHeader({ workspace }: { workspace: Workspace }) {
  return (
    <Link
      href="/onboarding"
      className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
    >
      <span>{workspace.name}</span>
      <Edit2 className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">Switch workspace</span>
    </Link>
  );
}
```

### 22.3 `page.test.tsx` updates

Add 3 cases (parallel to Task 19):

1. No workspace cookie → redirects to `/onboarding`.
2. Expired workspace → redirects.
3. Valid workspace → renders dashboard with WorkspaceHeader visible.

Existing 4 cases (Sprint 9) still pass with workspace cookie mocked.

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/cockpit/                                    # passes
```

---

## Task 22 — Eval runner + script + MCP server + seed

Three small refactors bundled into one task because each is a one-or-two-line signature update:

### 23.1 `src/lib/evals/runner.ts`

`runGoldenEval(db, goldenSet, opts)` accepts `opts.workspaceId`. Threads to retrieve.

```typescript
export async function runGoldenEval(
  db: Database.Database,
  goldenSet: GoldenCase[] = GOLDEN_SET,
  opts: { workspaceId: string },
): Promise<EvalRunReport>
```

`runner.test.ts`: pass `SAMPLE_WORKSPACE.id` in setup.

### 23.2 `scripts/eval-golden.ts`

```typescript
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
// ...
const report = await runGoldenEval(db, GOLDEN_SET, { workspaceId: SAMPLE_WORKSPACE.id });
```

### 23.3 `mcp/contentops-server.ts`

Hardcoded `MCP_CONTEXT` gains `workspaceId: SAMPLE_WORKSPACE.id`. Module comment updated:

```typescript
// MCP server defaults to the SAMPLE_WORKSPACE for all tool calls.
// Per-caller workspace selection is Sprint 13+ (spec §4.10).
const MCP_CONTEXT: ToolExecutionContext = {
  userId: 'mcp-server',
  role: 'Admin',
  conversationId: 'mcp-conversation',
  workspaceId: SAMPLE_WORKSPACE.id,
};
```

`contentops-server.test.ts`: update fixtures.

### 23.4 `src/db/seed.ts`

```typescript
export function runSeed(db: Database.Database) {
  db.exec(SCHEMA);
  migrate(db);
  // Insert sample workspace if not present
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
  ).run(SAMPLE_WORKSPACE.id, SAMPLE_WORKSPACE.name, SAMPLE_WORKSPACE.description, now);
  // ...existing user inserts...
}

// In the run-directly block:
await ingestCorpus(seedDb, undefined, SAMPLE_WORKSPACE.id);
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/evals/runner.test.ts                        # passes
npm run test -- mcp/contentops-server.test.ts                       # passes
npm run db:seed                                                     # runs cleanly; sample workspace + ingest succeed
npm run eval:golden                                                 # 5/5 passing
```

---

## Task 23 — Update `src/lib/test/seed.ts`

**Spec:** §8 file inventory

`seedDocument` and `seedChunk` now require workspaceId. Existing tests using these helpers were already swept in Task 10 to pass `SAMPLE_WORKSPACE.id`.

```typescript
export function seedDocument(
  db: Database.Database,
  slug: string,
  workspaceId: string = SAMPLE_WORKSPACE.id,
): string {
  const docId = `doc-${slug}`;
  db.prepare(
    'INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(docId, slug, workspaceId, slug, 'full doc content', 'hash', Date.now());
  return docId;
}

export function seedChunk(
  db: Database.Database,
  docId: string,
  overrides: { id: string; content: string; level?: 'document' | 'section' | 'passage'; heading?: string | null; index?: number; workspaceId?: string },
): void {
  const workspaceId = overrides.workspaceId ?? SAMPLE_WORKSPACE.id;
  // ... existing logic ...
  // INSERT into chunks adds workspace_id column
}
```

Default `workspaceId = SAMPLE_WORKSPACE.id` keeps existing test sites working without code change. Tests that need cross-workspace fixtures pass an explicit override.

**Verification:**

```bash
npm run typecheck
npm run test                                                        # all tests pass with the new defaults
```

---

## Task 24 — E2E spec: workspace upload flow

**Spec:** §11.8

### 25.1 `tests/e2e/workspace-onboarding.spec.ts`

```typescript
import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

test.beforeEach(async ({ context }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin');
  if (!admin) throw new Error('Admin demo user not found');
  const token = await encrypt({
    userId: admin.id,
    role: 'Admin',
    displayName: admin.display_name,
  });
  await context.addCookies([
    { name: 'contentops_session', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);
});

test('upload a brand → chat is grounded in it → cockpit scoped to new workspace', async ({ page }) => {
  await page.goto('/');
  // Should redirect to /onboarding due to no workspace cookie
  await expect(page).toHaveURL(/\/onboarding$/);

  // Click "Upload your brand" → form appears
  await page.getByRole('button', { name: /Upload your brand/i }).click();
  await page.getByLabel(/Brand name/i).fill('Acme Test Brand');
  await page.getByLabel(/Description/i).fill('A demo brand for the workspace E2E test');
  // Construct a file and upload via setInputFiles
  // sprint-QA L3: single-backslash escape (was '\\n\\n' which is literal backslash-n)
  const fileContent = '# Brand Identity\n\nAcme is a serious test brand for E2E.';
  await page.locator('input[type="file"]').setInputFiles({
    name: 'brand-identity.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(fileContent),
  });
  await page.getByRole('button', { name: /Create workspace|Submit/i }).click();

  // Lands back on /
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/, { timeout: 30_000 });
  // Header shows the new workspace name
  await expect(page.getByText('Acme Test Brand')).toBeVisible();

  // Send a chat message that triggers retrieval
  await page.getByRole('textbox').fill('What kind of brand is Acme?');
  await page.getByRole('button', { name: 'Send message' }).click();
  // Wait for streaming to land
  await page.waitForResponse((r) => r.url().endsWith('/api/chat'), { timeout: 30_000 });
  // Assistant should reference the uploaded content (grounded)
  await expect(page.getByText(/serious test brand|Acme/i).last()).toBeVisible({ timeout: 30_000 });

  // Navigate to cockpit
  await page.goto('/cockpit');
  // The workspace name appears in the cockpit header
  await expect(page.getByText('Acme Test Brand')).toBeVisible();
});
```

**Note.** This test depends on the dev server running with the `CONTENTOPS_E2E_MOCK=1` flag (per Sprint 8 setup). The mock client returns a deterministic streaming response without tool use; the assertion is on grounded text content, not on a ToolCard. If the mock needs updating to pass through workspace context, that's a small addition to `src/lib/anthropic/e2e-mock.ts`.

**Verification:**

```bash
npm run test:e2e                                                    # 3 specs passing (chat-tool-use + cockpit-dashboard + workspace-onboarding)
```

If the spec flakes, follow Sprint 9 §M3 mitigation pattern: artificial setTimeout in the e2e mock.

---

## Task 25 — Final verification

```bash
npm run typecheck                                                   # 0 errors
npm run lint                                                        # pre-existing format issues remain (out-of-scope)
npm run test                                                        # baseline + 44 passing (sprint-QA H1)
npm run test:e2e                                                    # 3 specs passing
npm run eval:golden                                                 # 5/5 passing against sample workspace
npm run mcp:server                                                  # starts cleanly with sample workspace context
```

**Manual sanity walkthrough:**

- `npm run dev`. Visit `/` → redirects to `/onboarding`.
- Click "Try sample brand" → returns to `/`, workspace name "Side Quest Syndicate" visible in header. Chat works grounded in Side Quest content.
- Visit `/cockpit` → workspace name + Switch link visible. Audit feed scoped.
- Click "Switch workspace" → `/onboarding`. Click "Upload your brand", fill form with 1-2 small markdown files, submit. Workspace created. Returns to `/`. Header shows uploaded brand name. Chat grounded in uploaded content.
- Visit `/cockpit` again. New workspace shown; audit/schedule/approvals are empty (fresh workspace). Eval health and Spend stay global.
- Switch back to sample. Old data visible.

---

## Stop-the-line conditions

I will surface and stop if any of the following surface during implementation:

- Task 1's migrate test (`cross-workspace duplicate slug succeeds`) fails — H1 fix wasn't applied to SCHEMA correctly; investigate before continuing.
- Task 13's chat-route changes break existing chat-route integration tests in unexpected ways — could indicate the cookie pattern needs deeper integration with the existing session-cookie flow.
- Task 21 server actions can't be made to read workspace cookie cleanly — would force a refactor of the `cookies()` import pattern.
- The composite UNIQUE INDEX on (slug, workspace_id) doesn't fire on a fresh DB built from the new SCHEMA (Task 1.4 #3 fails) — would indicate the documents CREATE TABLE statement still has the column-level UNIQUE.
- The synchronous ingest pipeline takes >10 seconds for the 500KB cap — would force chunking the upload UX (progressive enhancement).
- Eval golden 5/5 drops below 5/5 after Task 23 — would indicate retrieval scoping broke a query path; investigate before continuing.
- A library API (Next.js 16 `request.formData()`, `cookies()` async, `redirect`) differs from spec §16's Context7-verified shape.

When a stop-the-line surfaces: surface it explicitly, do not silently resolve.

---

## Test count expectations per phase (sprint-QA H1 — updated to +44 net)

Cumulative test counts targeted at each phase boundary (using assumed Sprint 10 baseline of 175 — actual pinned at preflight). Numbers reflect post-sprint-QA renumbering (25 tasks total, was 26).

| After Task | Vitest count | Δ |
|---|---:|---:|
| Pre-flight (baseline) | 175 | — |
| 2 (migrate tests) | 178 | +3 |
| 3 (cookie tests) | 181 | +3 |
| 4 (workspace queries) | 186 | +5 |
| 5 (cleanup) | 189 | +3 |
| 7 (ingest-upload) | 194 | +5 |
| 8 (retrieve isolation) | 195 | +1 |
| 9 (tool plumbing — audit-log existing test extended) | 195 | +0 |
| 11 (system prompt) | 197 | +2 |
| 12 (chat route + audit-rollback M2) | 201 | +4 |
| 13 (select-sample) | 203 | +2 |
| 14 (upload route) | 207 | +4 |
| 15 (WorkspacePicker) | 209 | +2 |
| 16 (UploadForm) | 211 | +2 |
| 17 (onboarding page) | 213 | +2 |
| 18 (home page redirect) | 216 | +3 |
| 19 (cockpit queries — 3 isolation per M1) | 219 | +3 |
| 20 (cockpit actions workspace) | 220 | +1 |
| 21 (cockpit page workspace) | 223 | +3 |
| **Total** | **219** | **+44** ✓ |

Wait — the rows above sum to 175 + 45 = 220, not 219. Adjustment: Task 12's audit-rollback test is shared with the §11.5 chat-route count and not double-counted in the cockpit category. Actual sprint delivers either +43 or +44 depending on bookkeeping; pin the exact number at preflight via the cumulative test count after Task 21. Target: **baseline + 44**.

The actual baseline pinned at preflight may differ slightly; the **+44** net is the locked target. (Sprint-QA H1 corrected the original spec-§11 estimate of +35 — that estimate missed migrate, redirect, and onboarding-page test categories which the sprint correctly identifies as needed.)

---

## Commit strategy

Single sprint commit:

```
feat(s11): workspaces & brand onboarding

- Pivot from Side-Quest-Syndicate-only demo to a workspace-based product:
  /onboarding flow lets any operator try the sample brand or upload their
  own (1-5 .md files, 100KB each, brand name + description). The chat,
  tools, audit, rollback, and cockpit operate against the active workspace.
- New `workspaces` table + `workspace_id` column on `documents`, `chunks`,
  `audit_log`, `content_calendar`, `approvals`. Idempotent `migrate()` at
  boot for existing dev DBs. Composite UNIQUE INDEX (slug, workspace_id)
  replaces the old column-level UNIQUE on documents.slug.
- Signed JWT cookie `contentops_workspace` carries the active workspace;
  `getActiveWorkspace()` enforces "exists AND (is_sample OR not expired)".
  Lazy TTL purge runs on each new workspace create. Sample workspace never
  expires.
- System prompt parameterized on the active workspace (brand name +
  description). Tool-usage guidance lines unchanged.
- Cockpit reads filter by workspace_id (audit / schedule / approvals);
  Eval health and Spend stay global. Header shows workspace name + a
  Switch link to /onboarding.
- MCP server hardcodes the sample workspace; per-caller MCP workspace
  selection is Sprint 13+. Documented in module comment + README.
- Eval harness runs against sample workspace only — eval is brand-specific
  by design; uploaded brands inherit retrieval quality from the architecture.
- baseline + 44 Vitest tests passing (sprint-QA H1 — was +35 in initial draft;
  spec-§11 missed migrate, redirect, and onboarding-page test categories).
  Subtotal: +3 migrate, +3 cookie, +5 queries (incl. getActiveWorkspace),
  +3 cleanup, +5 ingest-upload, +1 retrieve isolation, +2 system prompt,
  +4 chat-route (3 cookie path + 1 audit-rollback), +6 API routes (4 upload + 2 select-sample),
  +4 component, +2 onboarding page, +3 home redirect, +3 cockpit-queries
  isolation, +1 cockpit-actions throw, +3 cockpit page redirect = 48
  enumerated; minus extending-existing tests (Task 9 audit-log round-trip
  field, Task 23 seed.ts default) ≈ 44 net-new. 3 Playwright specs (existing
  chat-tool-use + cockpit-dashboard + new workspace-onboarding). 5/5
  eval:golden against sample workspace. typecheck clean. mcp:server starts.
```

---

## Phase L — Post-implementation UX revision (2026-05-05)

Operator validation of the Sprint 11 implementation surfaced three product issues. Because Sprint 11 had not yet been committed, these corrections were applied in-place rather than as a separate sprint. See spec.md §19 for the design rationale.

### Task 26 — Homepage: chat-first (sample-by-default)

**Goal.** First visit lands directly in chat. No redirect to `/onboarding`.

**Acceptance.**
- [src/middleware.ts](src/middleware.ts) issues a sample-workspace cookie when none is present (alongside default Creator session).
- [src/app/page.tsx](src/app/page.tsx) renders chat without redirect; falls back to in-memory sample workspace if `getActiveWorkspace` returns null (race with TTL purge), and clears the stale cookie so middleware re-issues.
- [src/app/cockpit/page.tsx](src/app/cockpit/page.tsx) mirrors the same fallback pattern.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) 401 redirect hint changes from `/onboarding` to `/`.

**Files.** `src/middleware.ts`, `src/app/page.tsx`, `src/app/cockpit/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/chat/route.integration.test.ts` (redirect assertion updated), `tests/e2e/workspace-onboarding.spec.ts` (rewritten).

**Verification.** `npm run typecheck`; existing chat-route integration tests still pass.

### Task 27 — Extract `BrandUploadModal` from `UploadForm`

**Goal.** Reusable modal that hosts the brand-upload form and accepts an optional `prefilledFiles: File[]` prop. When prefilled, the file input is hidden and selected file names are listed read-only.

**Acceptance.**
- New `src/components/workspaces/BrandUploadModal.tsx` renders dialog overlay, blocks `<Escape>` and outside-click during submit, disables Cancel during submit.
- Submit POSTs `multipart/form-data` to `/api/workspaces` (unchanged).
- 5 vitest cases: closed-by-default, blank validation, valid submit POSTs + onSuccess, prefilledFiles hides input + lists names, server error message surfaces on the right field.

**Files.** `src/components/workspaces/BrandUploadModal.tsx` + `BrandUploadModal.test.tsx`.

**Verification.** `npx vitest run src/components/workspaces/BrandUploadModal.test.tsx`.

### Task 28 — `WorkspaceMenu` popover

**Goal.** Header popover for workspace switching.

**Acceptance.**
- New `src/components/workspaces/WorkspaceMenu.tsx` renders the workspace name + an `Edit2` icon (preserves the `Switch workspace` accessible name).
- Popover items: "Use sample brand" (POSTs `/api/workspaces/select-sample`, refreshes), "Start a new brand…" (opens `BrandUploadModal`).
- "Use sample brand" disables when `isSample === true` and reads "Sample brand (active)".
- 5 vitest cases: trigger label, popover open/close, sample POST + refresh, sample disabled when active, modal opens from new-brand.

**Files.** `src/components/workspaces/WorkspaceMenu.tsx` + `WorkspaceMenu.test.tsx`.

**Verification.** `npx vitest run src/components/workspaces/WorkspaceMenu.test.tsx`.

### Task 29 — Wire WorkspaceMenu; delete `/onboarding`

**Goal.** WorkspaceHeader uses the new popover; route + old picker components removed.

**Acceptance.**
- [src/components/cockpit/WorkspaceHeader.tsx](src/components/cockpit/WorkspaceHeader.tsx) renders `<WorkspaceMenu>` instead of `<Link href="/onboarding">`. Used by both [src/app/cockpit/page.tsx](src/app/cockpit/page.tsx) and [src/app/page.tsx](src/app/page.tsx) (replaces inline workspace span).
- Deleted: `src/app/onboarding/page.tsx`, `src/app/onboarding/page.test.tsx`, `src/components/onboarding/WorkspacePicker.tsx`, `src/components/onboarding/WorkspacePicker.test.tsx`, `src/components/onboarding/UploadForm.tsx`, `src/components/onboarding/UploadForm.test.tsx`.
- No remaining imports point to `@/components/onboarding/...`.

**Files.** Modified: `src/components/cockpit/WorkspaceHeader.tsx`, `src/app/page.tsx`. Deleted as listed above.

**Verification.** `npm run typecheck` clean; deleted `.next` folder if a stale generated-types entry references `src/app/onboarding/page.js`.

### Task 30 — `FileDropZone` over the chat surface

**Goal.** Drag .md files onto the chat to start a brand.

**Acceptance.**
- New `src/components/chat/FileDropZone.tsx` wraps children + listens for dragover/drop. Filters `.md` (≤100KB, max 5). Non-md drops silently ignored. Calls `onFiles(files: File[])` when valid.
- Visual highlight during drag: ring + overlay caption "Drop .md files to start a brand".
- 5 vitest cases: renders children, accepts md drops, ignores non-md, caps at 5 files, rejects oversized.

**Files.** `src/components/chat/FileDropZone.tsx` + `FileDropZone.test.tsx`.

**Verification.** `npx vitest run src/components/chat/FileDropZone.test.tsx`.

### Task 31 — `AttachButton` next to send

**Goal.** Accessible (keyboard / touch) entry point that mirrors the drop flow.

**Acceptance.**
- New `src/components/chat/AttachButton.tsx` renders a paperclip button + hidden `<input type="file">` (multi, .md). Same filtering rules as FileDropZone.
- [src/components/chat/ChatComposer.tsx](src/components/chat/ChatComposer.tsx) accepts an optional `onAttachFiles?: (files: File[]) => void` prop; when provided, renders `<AttachButton>` before the send button.
- 4 vitest cases: button rendered, click triggers input click, .md selection calls onFiles, non-md filtered out.

**Files.** `src/components/chat/AttachButton.tsx` + `AttachButton.test.tsx`, `src/components/chat/ChatComposer.tsx`.

**Verification.** `npx vitest run src/components/chat/AttachButton.test.tsx src/components/chat/ChatComposer.test.tsx`.

### Task 32 — ChatUI wires drop + attach into BrandUploadModal

**Goal.** Drop / paperclip both feed the same modal; submit POSTs and refreshes route.

**Acceptance.**
- [src/components/chat/ChatUI.tsx](src/components/chat/ChatUI.tsx) holds `pendingFiles` state, wraps content in `FileDropZone`, threads `onAttachFiles` into `ChatComposer`, renders `BrandUploadModal` with `prefilledFiles={pendingFiles}` and `onSuccess` calling `router.refresh()`.
- New `src/components/chat/ChatUI.upload.integration.test.tsx`: drop → modal opens prefilled (file name visible, file input hidden) → fill metadata → submit → fetch `/api/workspaces` POST → router.refresh() called → modal closes; cancel button closes modal without firing fetch.

**Files.** `src/components/chat/ChatUI.tsx`, `src/components/chat/ChatUI.upload.integration.test.tsx`, `src/app/page.test.tsx` (next/navigation mock added — ChatUI now uses `useRouter`).

**Verification.** `npx vitest run src/components/chat/ChatUI.upload.integration.test.tsx src/app/page.test.tsx`.

### Task 33 — Cockpit reframing (per-panel labels + subhead)

**Goal.** Cockpit reads as a product surface, not a debug pane.

**Acceptance.**
- [src/app/cockpit/page.tsx](src/app/cockpit/page.tsx) adds a subhead under the header: `"What your team sees while the AI works on behalf of {workspace.name}."`
- Per-panel headings rewritten to ask the question they answer (see spec §19.4 for full mapping).
- [src/components/cockpit/SpendPanel.tsx](src/components/cockpit/SpendPanel.tsx) gains a `Global · all workspaces` pill in its header.

**Files.** `src/app/cockpit/page.tsx`, `src/components/cockpit/AuditFeedPanel.tsx`, `src/components/cockpit/SpendPanel.tsx`, `src/components/cockpit/EvalHealthPanel.tsx`, `src/components/cockpit/SchedulePanel.tsx`, `src/components/cockpit/ApprovalsPanel.tsx`.

**Verification.** `npx vitest run src/components/cockpit/`. Existing tests assert behavior, not heading text — they continue to pass unchanged.

### Task 34 — AuditFeedPanel: collapse to top 5 with View-all expand

**Goal.** Calmer default; dense view stays available.

**Acceptance.**
- [src/components/cockpit/AuditFeedPanel.tsx](src/components/cockpit/AuditFeedPanel.tsx) renders only the first 5 rows by default; if more rows exist, a `View all (N)` button at the bottom expands; once expanded, button reads `Show fewer`.
- Two new vitest cases: 8 rows → 5 visible by default + click expand reveals rest; 3 rows → no expand button rendered.

**Files.** `src/components/cockpit/AuditFeedPanel.tsx`, `src/components/cockpit/AuditFeedPanel.test.tsx`.

**Verification.** `npx vitest run src/components/cockpit/AuditFeedPanel.test.tsx`.

### Phase L Verification (cumulative)

```bash
npm run typecheck   # 0 errors
npm run lint        # no new errors over baseline
npm run test        # 242 passing (target was 232; net +57 over Sprint 10 baseline of 185)
npm run test:e2e    # 3 specs (workspace-onboarding rewritten; chat-tool-use + cockpit-dashboard unchanged)
npm run eval:golden # 5/5 against sample workspace
```

### Phase L commit message

```
feat(s11): chat-first homepage, in-chat brand upload, cockpit reframing

Post-impl UX revision applied before commit. See spec.md §19.

- middleware.ts issues a sample-workspace cookie when missing so first
  visit lands in chat instead of /onboarding.
- /onboarding route + WorkspacePicker + UploadForm deleted; replaced by
  WorkspaceMenu popover (header) + BrandUploadModal (modal).
- Drag .md into chat or click the paperclip → BrandUploadModal opens
  with files prefilled → POST /api/workspaces creates workspace.
- Cockpit subhead + per-panel question headings; AuditFeedPanel
  collapses to top 5 with View-all; SpendPanel "Global · all
  workspaces" pill.
- 242 vitest tests, 3 Playwright, 5/5 eval:golden against sample.
```

---

## Phase M — Round 3: workspace-scoped conversations + templated empty state (2026-05-05)

Round 2 manual smoke (operator uploaded the GitLab Content Style Guide as a new workspace) surfaced two architectural gaps. Both are Sprint 11 scope. Applied via TDD discipline (red → green → docs). See spec.md §20.

### Task 35 — RED: failing tests for Bug A (workspace-scoped conversations)

**Goal.** Capture the cross-workspace conversation bleed in tests before any implementation lands.

**Acceptance.**
- `src/lib/db/migrate.test.ts` extended with: (a) Round-3 migration adds `workspace_id` to a pre-Round-3 conversations table and backfills with sample UUID; (b) idempotence on the new SCHEMA.
- `src/lib/workspaces/cleanup.test.ts` extended with: (a) cascade DELETE through conversations + messages for an expired non-sample; (b) sample's conversations + messages are never purged.
- `src/app/api/chat/route.integration.test.ts` extended with: (a) workspace_id persisted on new conversations; (b) foreign-workspace `conversationId` ignored, fresh conversation created in current workspace; (c) own-workspace `conversationId` appended to.
- New `src/lib/chat/conversations.test.ts` for the extracted helper: (a) returns most recent for the (user, workspace) pair; (b) cross-workspace isolation; (c) null when no row exists for the pair.

**Verification.** `npx vitest run src/lib/db/migrate.test.ts src/lib/workspaces/cleanup.test.ts src/app/api/chat/route.integration.test.ts src/lib/chat/conversations.test.ts` — expect ~8 failures.

### Task 36 — GREEN: Bug A implementation

**Goal.** Add `workspace_id` to `conversations`; thread through reads/writes; cascade through cleanup.

**Acceptance.**
- [src/lib/db/schema.ts](src/lib/db/schema.ts) declares `workspace_id TEXT NOT NULL` on conversations.
- [src/lib/db/migrate.ts](src/lib/db/migrate.ts) adds `'conversations'` to `TABLES_NEEDING_WORKSPACE`. Pre-Round-3 dev DBs gain the column with DEFAULT sample UUID (constant-time).
- New [src/lib/chat/conversations.ts](src/lib/chat/conversations.ts) exports `getLatestConversationForWorkspace`.
- [src/app/page.tsx](src/app/page.tsx) uses the helper instead of the inline `WHERE user_id = ?` query.
- [src/app/api/chat/route.ts](src/app/api/chat/route.ts) — conversation lookup filters on `(id, user_id, workspace_id)`; INSERT writes `workspace_id`.
- [src/lib/workspaces/cleanup.ts](src/lib/workspaces/cleanup.ts) — cascade now: messages → conversations → workspaces (children first).

**Verification.** Phase 1.1 tests above all pass.

### Task 37 — RED: failing tests for Bug B (templated empty state)

**Goal.** Capture the hardcoded "Side Quest Syndicate" leak before parameterizing.

**Acceptance.**
- New `src/components/chat/ChatEmptyState.test.tsx`: (a) heading uses `workspaceName` prop; (b) clicking "Define Brand Voice" sends a prompt containing `workspaceName`, not "Side Quest Syndicate"; (c) all four suggested prompts contain the workspaceName.
- `src/components/chat/ChatTranscript.test.tsx` extended with: workspaceName propagation through ChatTranscript → ChatEmptyState.

**Verification.** `npx vitest run src/components/chat/ChatEmptyState.test.tsx src/components/chat/ChatTranscript.test.tsx` — expect ~4 failures + TS errors at the call sites.

### Task 38 — GREEN: Bug B implementation

**Goal.** Parameterize the empty state on the active workspace name; thread the prop through the chat tree.

**Acceptance.**
- [src/components/chat/ChatEmptyState.tsx](src/components/chat/ChatEmptyState.tsx) accepts a **required** `workspaceName: string` prop. Suggested prompts moved into a `buildSuggestedPrompts(workspaceName)` factory; heading renders `workspaceName` directly.
- [src/components/chat/ChatTranscript.tsx](src/components/chat/ChatTranscript.tsx) accepts and forwards `workspaceName`.
- [src/components/chat/ChatUI.tsx](src/components/chat/ChatUI.tsx) accepts `workspaceName` in props, passes to ChatTranscript.
- [src/app/page.tsx](src/app/page.tsx) passes `workspaceName={workspace.name}` to ChatUI.
- Existing render call sites in `src/app/page.test.tsx` and `src/components/chat/ChatUI.upload.integration.test.tsx` get `workspaceName="Side Quest Syndicate"` so the typecheck stays clean.

**Verification.** Phase 1.2 tests pass; existing tests still pass; `npm run typecheck` clean.

### Task 39 — Documentation

**Goal.** Spec / sprint / sprint-qa / validation-notes reflect Round 3.

**Acceptance.**
- `spec.md` §20 documents Bug A + Bug B, the resolution, the §4.1 amendment (conversations now on the per-data list), and the test-count delta.
- `sprint.md` Phase M (this section) lists Tasks 35–40.
- `sprint-qa.md` Round 3 records both findings as RESOLVED.
- `validation-notes.md` adds a Round-2-follow-up subsection noting both bugs were fixed and the manual smoke is worth re-running.

### Task 40 — Final verification

```bash
npm run typecheck
npm run lint        # clean on Round-3-modified files
npm run test        # 255 passing (242 baseline + 13 new)
npm run eval:golden # 5/5 against sample workspace
```

### Phase M commit message addendum

```
Round 3 (TDD): workspace-scoped conversations + templated empty state.

- conversations table now carries workspace_id (sixth Sprint-11 migration
  in the same idempotent ALTER TABLE pattern). Chat history is now
  per-workspace; uploading a new brand yields a fresh empty chat.
- /api/chat ignores foreign-workspace conversationId, creating a new
  conversation in the current workspace. TTL purge cascades through
  messages + conversations.
- ChatEmptyState requires a workspaceName prop; suggested prompts and
  heading interpolate it. No more hardcoded "Side Quest Syndicate"
  leaking into custom-brand workspaces.
- 255 vitest tests, 3 Playwright, 5/5 eval:golden.
```

---

## Phase N — Round 4: legacy `documents.slug` UNIQUE rebuild + popover redundancy (2026-05-05)

Round 3 manual smoke surfaced a runtime 500 (`UNIQUE constraint failed: documents.slug`) when uploading a custom brand on a dev DB that pre-dated Sprint 11. Sprint 11 had documented this as "run `npm run db:seed` to reset" — Round 4 closes the debt with a real migration. See spec.md §21.

Applied via TDD discipline (red → green → refactor → docs). Boy Scout pass also drops a redundant disabled menu item from the workspace popover.

> **Note (added during implementation).** A fourth test (Task 42b) was added when the FK-on regression surfaced during the first eval run after GREEN. The rebuild helper now wraps the transaction in a `foreign_keys` pragma toggle. The 5-Why captured the test-design lesson; the FK-pragma fix captured the SQLite-mechanics lesson.

### Task 41 — RED: behavior test that a migrated dev DB satisfies the cross-workspace-slug invariant

**Goal.** Express the bug as a failing assertion *on a migrated DB*, not just on a fresh SCHEMA.

**Acceptance.**
- `src/lib/db/migrate.test.ts` adds a test that builds a pre-Sprint-11 fixture **including** the legacy `slug TEXT UNIQUE NOT NULL` column constraint, runs migrate, and asserts:
  - Inserting `slug='brand-identity'` into workspace A succeeds.
  - Inserting `slug='brand-identity'` into workspace B succeeds (cross-workspace duplicate allowed).
  - Inserting `slug='brand-identity'` into workspace A again throws (composite UNIQUE intact).
- A second test verifies the table rebuild preserves existing rows AND that `migrate()` is idempotent (running it twice doesn't duplicate rows or re-rebuild the table).

**Verification.** `npx vitest run src/lib/db/migrate.test.ts` — expect 1 failure on the cross-workspace insert with the exact runtime error (`UNIQUE constraint failed: documents.slug`).

### Task 42 — GREEN: detect + rebuild

**Goal.** Drop the legacy column-level UNIQUE without losing data, idempotently.

**Acceptance.**
- New helper `hasLegacySlugUnique(db)`: `PRAGMA index_list(documents)` filtered to `unique=1, origin='u', columns=['slug']`. Returns `false` after a successful rebuild.
- New helper `rebuildDocumentsTableWithoutSlugUnique(db)`: wraps the SQLite 12-step procedure in `db.transaction(...)`. CREATE TABLE `documents_new` with the Sprint-11 shape → INSERT … SELECT preserves rows including backfilled `workspace_id` → DROP TABLE `documents` → RENAME `documents_new` → `documents`. Reads `PRAGMA foreign_keys` before the transaction, sets OFF, restores in `finally` — required because DROP TABLE on a referenced table fires FK checks even when the new table re-attaches the same row IDs, and the pragma cannot be set inside a transaction.
- `migrate()` calls the rebuild conditionally **after** the ADD COLUMN loop and **before** the CREATE INDEX loop. The composite UNIQUE INDEX re-attaches via the existing `CREATE UNIQUE INDEX IF NOT EXISTS` call.
- Header comment in `migrate.ts` corrected — the "operator must run db:seed" claim is replaced with a reference to the rebuild path and the SQLite docs URL.

**Files.** `src/lib/db/migrate.ts`.

**Verification.** Phase 1 tests pass; eval-golden passes 5/5 (this is what surfaced the FK-pragma gap on the first GREEN attempt — the regression guard test was added immediately after); full vitest suite shows 259 passing.

### Task 43 — REFACTOR + Boy Scout: popover redundancy

**Goal.** Hide the redundant disabled `Sample brand (active)` menu item when the active workspace IS the sample. The popover header already conveys the active brand.

**Acceptance.**
- `src/components/workspaces/WorkspaceMenu.tsx` — wrap the Use-sample button in `{!isSample && <button>...</button>}`. The disabled `(active)` label state is removed entirely (it was only ever surfaced inside that branch).
- `src/components/workspaces/WorkspaceMenu.test.tsx` — the existing "disables the sample button" test is rewritten in place to assert the menu item is **not** rendered when `isSample === true`. The "Start a new brand…" item must still render.

**Verification.** `npx vitest run src/components/workspaces/WorkspaceMenu.test.tsx` — 5 passing.

### Task 44 — Documentation

**Goal.** Spec / sprint / sprint-qa / validation-notes reflect Round 4.

**Acceptance.**
- `spec.md` §21 documents the bug, the 5-Why root cause, the resolution, and the §4.1 amendment.
- `sprint.md` Phase N (this section) lists Tasks 41–44.
- `sprint-qa.md` Round 4 records the finding as RESOLVED.
- `validation-notes.md` adds a Round-3-follow-up subsection noting the rebuild migration is in and the manual smoke can now exercise the legacy-DB path.

### Task 45 — Final verification

```bash
npm run typecheck
npm run lint        # clean on Round-4-modified files
npm run test        # 259 passing (256 baseline + 3 new — extra test is the FK regression guard)
npm run eval:golden # 5/5 against sample workspace
```

### Phase N commit message addendum

```
Round 4 (TDD): drop legacy documents.slug UNIQUE via SQLite table rebuild.

- Pre-Sprint-11 dev DBs carried `slug TEXT UNIQUE NOT NULL` at the
  column level. Sprint 11's ALTER TABLE migration couldn't drop it,
  so cross-workspace duplicate slugs failed at the DB layer (operator
  hit `UNIQUE constraint failed: documents.slug` on first GitLab upload).
- migrate() now detects the legacy constraint via PRAGMA index_list
  and runs the SQLite 12-step rebuild: CREATE documents_new → INSERT
  SELECT (preserves rows + workspace_id) → DROP → RENAME. Wrapped in
  a transaction; idempotent (only fires when origin='u' single-column
  UNIQUE on slug exists).
- Header comment in migrate.ts corrected; the "operator must run
  db:seed" claim is gone.
- Boy Scout: WorkspaceMenu hides redundant "Sample brand (active)"
  disabled menu item when popover header already says it.
- 259 vitest, 3 Playwright, 5/5 eval:golden.
```

---

## Phase O — Round 5: chunk-ID workspace namespacing + orphan-workspace prevention (2026-05-05)

After Round 4 closed the schema migration, the operator's first cross-workspace upload still failed — at a different layer (`UNIQUE constraint failed: chunks.id`). A sibling orphan-workspace bug surfaced in the same DB inspection. See spec.md §22 for the 5-Why root cause.

Applied via TDD discipline. Two cycles of red-green plus refactor and docs. Sprint 11 still uncommitted; bundling into the same commit per spec §22.6.

### Task 46 — RED: cross-workspace chunk-ID collision test

**Goal.** Express the production bug as a failing test on `ingestMarkdownFile` directly. The cross-workspace retrieval test that already exists supplies explicit chunk IDs via `seedChunk()`; this new test exercises the real chunking + ingest path so the bug surfaces.

**Acceptance.**
- `src/lib/rag/ingest.test.ts` adds a `describe('ingestMarkdownFile cross-workspace (Round 5)', ...)` block.
- Test seeds two non-sample workspaces (`ws-a`, `ws-b`), ingests the same slug + content into both, asserts both succeed and produce equal chunk counts.

**Verification.** `npx vitest run src/lib/rag/ingest.test.ts` — expect 1 failure with `SQLITE_CONSTRAINT_PRIMARYKEY`.

### Task 47 — GREEN: thread `documentId` into chunk IDs

**Goal.** Replace the slug-derived chunk-ID formula with documentId-derived. The `slug` parameter on `chunkDocument` is unused outside ID templates — drop it.

**Acceptance.**
- [src/lib/rag/chunk-document.ts](src/lib/rag/chunk-document.ts) — public signature is `chunkDocument(documentId, title, content)`. ID templates use `${documentId}#document:0` and `${documentId}#${level}:${index}`. JSDoc updated with the rationale.
- [src/lib/rag/ingest.ts](src/lib/rag/ingest.ts) — `documentId` hoisted above the chunking call. One-line comment explains the ordering.
- [src/lib/rag/chunk-document.test.ts](src/lib/rag/chunk-document.test.ts) — all 5 `chunkDocument()` call sites updated to pass `'doc-test'` instead of slug strings. ID-pattern test renamed and regex updated.

**Files.** `chunk-document.ts`, `ingest.ts`, `chunk-document.test.ts`.

**Verification.** Phase 1 test passes. Existing 6 chunk-document tests stay green after the signature update.

### Task 48 — REFACTOR + caller audit

**Goal.** Confirm no other consumer parses `chunk.id` as `slug#level:index`.

**Acceptance.**
- `grep "chunkDocument("` shows only `ingest.ts` and the test file (per audit during refactor).
- `grep "chunk.id.split"` and `grep "chunk.id.startsWith"` return no matches in `src/`.
- Full vitest suite is green.

**Verification.** `npm run test`.

### Task 49 — RED: orphan-workspace prevention test

**Goal.** Express the orphan-workspace bug as a failing test on `ingestUpload`.

**Acceptance.**
- `src/lib/workspaces/ingest-upload.test.ts` adds a Round-5 test that mocks `embedBatch` to resolve once then reject (so the first file ingests, the second explodes).
- Test asserts `workspaces`, `documents`, and `chunks` rows are all 0 after the throw.

**Verification.** Test fails today with `wsCount = 1` (orphaned).

### Task 50 — GREEN: catch-and-delete in ingest-upload.ts

**Goal.** Wrap the per-file ingest loop in try/catch so failed ingest cleans up the partial state AND the workspace row before rethrowing.

**Acceptance.**
- [src/lib/workspaces/ingest-upload.ts](src/lib/workspaces/ingest-upload.ts) — `createWorkspace` runs first; the file loop is wrapped in `try`. On `catch`, a single sync transaction DELETEs from `chunks`, `documents`, and `workspaces` (in child→parent order). Original error rethrown.
- JSDoc on `ingestUpload` documents the rollback semantics + the schema's lack of `ON DELETE CASCADE`.

**Files.** `ingest-upload.ts`.

**Verification.** Round-5 orphan test passes; the existing happy-path test (`creates a workspace and inserts chunks scoped to its id`) still passes.

### Task 51 — Documentation

**Goal.** Spec / sprint / sprint-qa / validation-notes reflect Round 5.

**Acceptance.**
- `spec.md` §22 documents the 5-Why root cause + resolution + the §22.6 implementation arc summary.
- `sprint.md` Phase O (this section) lists Tasks 46–52.
- `sprint-qa.md` Round 5 records both findings as RESOLVED.
- `validation-notes.md` adds a Round-4-follow-up subsection with the one-off SQL cleanup snippet for the operator's pre-Round-5 orphan workspaces.

### Task 52 — Final verification

```bash
npm run typecheck
npm run lint        # clean on Round-5-modified files
npm run test        # 261 passing (259 baseline + 2 new)
npm run eval:golden # 5/5 against sample workspace
```

### Phase O commit message addendum

```
Round 5 (TDD): namespace chunk IDs by documentId; prevent orphan workspaces.

- chunkDocument(slug, title, content) -> chunkDocument(documentId, title,
  content). Chunk IDs are now ${documentId}#${level}:${index} instead of
  ${slug}#${level}:${index}, so the same slug+content uploaded to two
  different workspaces no longer collides on the chunks PRIMARY KEY.
  documentId is per-workspace (UUID for new docs, existing per-workspace
  doc-id for upserts).
- ingestUpload wraps the per-file loop in try/catch + atomic rollback:
  on any throw, partial chunks/documents AND the workspace row are
  deleted before rethrowing. Schema lacks ON DELETE CASCADE; child
  cleanup is explicit.
- 261 vitest, 3 Playwright, 5/5 eval:golden.
```
