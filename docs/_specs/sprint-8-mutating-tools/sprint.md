# Sprint Plan — Sprint 8: Mutating Tools, Audit Log, and Rollback

**Sprint:** 8
**Status:** Implemented (QA-revised + post-impl amendment)
**Date:** 2026-05-01 (drafted), 2026-05-01 (QA fixes applied), 2026-05-01 (post-impl amendment — ISO 8601 input for `schedule_content_item`; system-prompt tool-usage guidance — see impl-qa Issue 6)

---

## Prerequisites

Before any implementation step:

1. Confirm Sprint 7 is fully committed (`git log --oneline -1` should show the Sprint 7 commit `feat(s7)`).
2. Run `npm run test` — must show **106 passing**.
3. Run `npm run eval:golden` — must show **5/5 passing**.
4. Run `npm run typecheck` and `npm run lint` — both must show **0 errors**.
5. Verify `.env.local` exists and contains `CONTENTOPS_DB_PATH`, `CONTENTOPS_SESSION_SECRET` (≥32 chars), and `ANTHROPIC_API_KEY`. The Playwright smoke test (Task 18) reads `CONTENTOPS_SESSION_SECRET` to sign a test session cookie.
6. Library API surfaces verified via Context7 against the pinned versions:
   - `@vercel/next.js` v16.2.2 — `params: Promise<{ id: string }>` for dynamic route handlers.
   - `@wiselibs/better-sqlite3` — `db.transaction(fn)` is sync-only; `await` inside commits prematurely.
   - `@microsoft/playwright` — `defineConfig({ testDir, webServer, use: { baseURL } })` and `context.addCookies([{ name, value, domain, path, httpOnly, sameSite }])`.

---

## Task List

| # | Task | Files | Type |
|---|---|---|---|
| 1 | Schema migration — 3 new tables + 2 indexes | `src/lib/db/schema.ts` | Modify |
| 2 | Create shared test helpers | `src/lib/test/db.ts`, `src/lib/test/seed.ts`, `src/lib/test/embed-mock.ts` | Create |
| 3 | Strip duplicated helpers from existing test files | `src/lib/evals/runner.test.ts`, `src/lib/rag/ingest.test.ts`, `src/lib/rag/retrieve.test.ts` | Modify |
| 4 | Delete old test-helpers module | `src/lib/db/test-helpers.ts` | Delete |
| 5 | Extend domain types | `src/lib/tools/domain.ts` | Modify |
| 6 | Audit-log helper module + tests | `src/lib/tools/audit-log.ts`, `src/lib/tools/audit-log.test.ts` | Create |
| 7 | Registry refactor — db ctor, envelope return, audit hook | `src/lib/tools/registry.ts` | Modify |
| 8 | Update registry tests + add envelope/audit-hook tests | `src/lib/tools/registry.test.ts` | Modify |
| 9 | Forward `db` from `createToolRegistry` | `src/lib/tools/create-registry.ts` | Modify |
| 10 | Mutating tools + tests | `src/lib/tools/mutating-tools.ts`, `src/lib/tools/mutating-tools.test.ts` | Create |
| 11 | Chat route — envelope destructure + audit_id emit | `src/app/api/chat/route.ts` | Modify |
| 12 | Extend `tool_result` NDJSON variant | `src/lib/chat/parse-stream-line.ts` | Modify |
| 13 | `ToolCard.tsx` — Undo button + state machine | `src/components/chat/ToolCard.tsx` | Modify |
| 14 | Thread audit fields through ChatUI + ChatMessage | `src/components/chat/ChatUI.tsx`, `src/components/chat/ChatMessage.tsx` | Modify |
| 15 | `GET /api/audit` route + tests | `src/app/api/audit/route.ts`, `src/app/api/audit/route.integration.test.ts` | Create |
| 16 | `POST /api/audit/[id]/rollback` route + tests | `src/app/api/audit/[id]/rollback/route.ts`, `src/app/api/audit/[id]/rollback/route.integration.test.ts` | Create |
| 17 | MCP server envelope adjustment + new contract test | `mcp/contentops-server.ts`, `mcp/contentops-server.test.ts` | Modify |
| 18 | Playwright setup + Anthropic E2E mock + first E2E smoke test | `src/lib/anthropic/e2e-mock.ts`, `src/lib/anthropic/client.ts`, `playwright.config.ts`, `tests/e2e/chat-tool-use.spec.ts` | Create + Modify |
| 19 | `package.json` + `tsconfig.json` updates | `package.json`, `tsconfig.json` | Modify |
| 20 | Final verification — typecheck, lint, test, eval:golden, test:e2e, mcp:server | — | Verify |

After each task's *Verification* block passes, move to the next task. Do not batch task completion.

---

## Task 1 — `src/lib/db/schema.ts`

**Goal:** Add three new tables (`audit_log`, `content_calendar`, `approvals`) and two indexes to the `SCHEMA` template literal. Tables are idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running on an existing dev DB is safe.

**Conventions matched (per spec 4.2 / 6.1):**
- Timestamps are `INTEGER NOT NULL` storing Unix **seconds** (matches existing `users`, `messages`, `documents`, `chunks`).
- No `REFERENCES` clauses — every existing reference in the schema is documentary only because `PRAGMA foreign_keys = ON` is not enabled anywhere. New tables follow the same convention.
- `CHECK(...)` constraints are used for enum-like columns (`actor_role`, `status`).

**Append to `SCHEMA`:**

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

CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS content_calendar (
  id            TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL,
  channel       TEXT NOT NULL,
  scheduled_by  TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,
  document_slug TEXT NOT NULL,
  approved_by   TEXT NOT NULL,
  notes         TEXT,
  created_at    INTEGER NOT NULL
);
```

**Verification:**
```bash
npm run typecheck   # 0 errors
npm run test -- src/lib/db/schema.test.ts   # existing schema test still passes
```

---

## Task 2 — `src/lib/test/db.ts`, `seed.ts`, `embed-mock.ts`

**Goal:** Move and consolidate test fixtures. Three new files, no behavior change for any existing test.

### 2.1 `src/lib/test/db.ts`

Move the single export of `src/lib/db/test-helpers.ts` to the new path. Identical implementation.

```typescript
import Database from 'better-sqlite3';
import { SCHEMA } from '@/lib/db/schema';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  return db;
}
```

### 2.2 `src/lib/test/seed.ts`

Consolidates seed functions duplicated across `src/lib/evals/runner.test.ts`, `src/lib/rag/retrieve.test.ts`, and (`seedDocument` only) `src/lib/rag/ingest.test.ts`.

```typescript
import type Database from 'better-sqlite3';
import { DEMO_USERS } from '@/lib/auth/constants';

export function seedUser(db: Database.Database, role: 'Creator' | 'Editor' | 'Admin' = 'Creator') {
  const user = DEMO_USERS.find((u) => u.role === role)!;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(user.id, user.email, user.role, user.display_name, now);
  return user;
}

export function seedConversation(db: Database.Database, userId: string, id = 'conv-test') { /* see "Cite and copy" below */ }
export function seedDocument(db: Database.Database, opts: { id?: string; slug: string; title: string; content: string }) { /* see "Cite and copy" below */ }
export function seedChunk(db: Database.Database, opts: { id?: string; documentId: string; chunkIndex: number; content: string; embedding?: Float32Array }) { /* see "Cite and copy" below */ }
```

**Cite and copy.** Copy the existing local implementations from [src/lib/rag/retrieve.test.ts](src/lib/rag/retrieve.test.ts) and [src/lib/evals/runner.test.ts](src/lib/evals/runner.test.ts) verbatim — the function bodies in those files define the exact byte-shape of every column written. Do not paraphrase. The characterization-diff in Task 3 verifies preservation; any non-trivial change to the column writes will surface there as a regression.

For `seedConversation`, the equivalent inline INSERT lives in [src/app/api/chat/route.integration.test.ts:168+](src/app/api/chat/route.integration.test.ts#L168) — copy it from there.

### 2.3 `src/lib/test/embed-mock.ts`

```typescript
import { vi } from 'vitest';

const DIM = 384;

export function mockEmbedding(seed: number): Float32Array {
  const v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1));
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

export function applyEmbedderMock() {
  vi.mock('@/lib/rag/embed', () => ({
    embedText: vi.fn(async (text: string) => {
      let seed = 0;
      for (let i = 0; i < text.length; i++) seed += text.charCodeAt(i);
      return mockEmbedding(seed);
    }),
  }));
}
```

The exact dimensions and normalization match the locally-defined mocks in `src/lib/rag/retrieve.test.ts`, `src/lib/rag/ingest.test.ts`, and `src/lib/evals/runner.test.ts`.

**Verification:**
```bash
npm run typecheck                # 0 errors — file paths resolve
npm run test                     # 106 still passing — no consumer yet
```

---

## Task 3 — Strip duplicated helpers + characterization runs

**Goal:** Delete the locally-defined `createTestDb`, `seedDocument`, `seedChunk`, `mockEmbedding`, and the inline `vi.mock('@/lib/rag/embed')` blocks from three test files. Replace each with imports from `@/lib/test/db`, `@/lib/test/seed`, `@/lib/test/embed-mock`.

**Files affected:**
- [src/lib/evals/runner.test.ts](src/lib/evals/runner.test.ts) — drop local `createTestDb`, `seedDocument`, `seedChunk`, `mockEmbedding`, embedder mock; import shared.
- [src/lib/rag/ingest.test.ts](src/lib/rag/ingest.test.ts) — drop local `createTestDb`, embedder mock.
- [src/lib/rag/retrieve.test.ts](src/lib/rag/retrieve.test.ts) — drop local `createTestDb`, `seedDocument`, `seedChunk`, `mockEmbedding`, embedder mock.

**Characterization-test discipline (per spec 10.3 / Michael Feathers):**

For each file modified, capture before/after assertion output. Use a project-local working dir so the commands work on Windows + macOS + Linux without modification, and add the dir to `.gitignore` so the captures don't get committed:

```bash
mkdir -p .characterization-diffs
echo ".characterization-diffs/" >> .gitignore   # one-time addition

# Before refactor (commit a checkpoint locally):
npm run test -- src/lib/evals/runner.test.ts  --reporter=verbose > .characterization-diffs/before-runner.txt
npm run test -- src/lib/rag/ingest.test.ts    --reporter=verbose > .characterization-diffs/before-ingest.txt
npm run test -- src/lib/rag/retrieve.test.ts  --reporter=verbose > .characterization-diffs/before-retrieve.txt

# Apply refactor.

# After refactor:
npm run test -- src/lib/evals/runner.test.ts  --reporter=verbose > .characterization-diffs/after-runner.txt
# ...same for ingest and retrieve

# Diff every pair. The reporter emits timing lines per test ("✓ test name 12ms") — those lines
# are the only acceptable difference. Use a diff tool of choice; on Windows PowerShell:
#   Compare-Object (Get-Content before-runner.txt) (Get-Content after-runner.txt)
# Any non-timing diff is a regression and must be fixed before continuing.
```

**Note on vi.mock alias-vs-relative paths.** Existing files mix `vi.mock('./embed', ...)` ([src/lib/rag/retrieve.test.ts](src/lib/rag/retrieve.test.ts), [src/lib/rag/ingest.test.ts](src/lib/rag/ingest.test.ts)) and `vi.mock('@/lib/rag/embed', ...)` ([src/lib/evals/runner.test.ts](src/lib/evals/runner.test.ts)). Vitest resolves both forms to the same module file (`src/lib/rag/embed.ts`), so swapping every test to use the shared `applyEmbedderMock()` (which uses the alias form) does not change which module is mocked.

**Verification:**
```bash
npm run test                     # 106 still passing
npm run typecheck                # 0 errors
```

---

## Task 4 — Delete `src/lib/db/test-helpers.ts`

**Goal:** Remove the now-unused old path. Verify nothing else imports it.

Use the Grep tool (or your editor's project-wide search) to confirm zero matches for both forms before deletion:

- Pattern: `from '@/lib/db/test-helpers'` — search across `src/`, `tests/`, `mcp/`. Must return zero matches.
- Pattern: `from '\./test-helpers'` — search inside `src/lib/db/`. Must return zero matches (covers neighboring imports).

Once both return empty, delete the file. From the repo root:

```bash
# Windows PowerShell:
Remove-Item src/lib/db/test-helpers.ts

# macOS / Linux / Git Bash:
rm src/lib/db/test-helpers.ts
```

**Verification:**
```bash
npm run typecheck                # 0 errors
npm run test                     # 106 still passing
```

---

## Task 5 — `src/lib/tools/domain.ts`

**Goal:** Add `MutationOutcome`, `ToolExecutionResult`, `AuditLogEntry`. Extend `ToolDescriptor` with optional `compensatingAction` and a union return type on `execute`. Extend `ToolExecutionContext` with optional `toolUseId` so the chat route can plumb the LLM-issued tool_use id down to the audit-row writer.

**Modify `ToolExecutionContext`** — add the optional field:

```typescript
export interface ToolExecutionContext {
  role: Role;
  userId: string;
  conversationId: string;
  /** LLM-issued tool_use id from the Anthropic response, when applicable.
   *  The chat route sets this; MCP-originated calls leave it undefined. */
  toolUseId?: string;
}
```

**Append after the existing types** (keep `ToolCategory`, `AnthropicTool`, `ToolUseEvent`, `ToolResultEvent` as-is):

```typescript
export interface MutationOutcome {
  result: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

export interface ToolExecutionResult {
  result: unknown;
  audit_id: string | undefined;
}

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

**Modify `ToolDescriptor`** — change the `execute` return type and add `compensatingAction`:

```typescript
export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  roles: Role[] | 'ALL';
  category: ToolCategory;
  /** Read-only tools: async, returns the raw result.
   *  Mutating tools: sync, returns MutationOutcome.
   *  Mutating tools MUST throw on validation failures (see spec 4.3). */
  execute: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<unknown> | MutationOutcome;
  /** When set, the tool is mutating. The registry runs `execute` inside
   *  a sync transaction with an audit-row insert. The function is the rollback. */
  compensatingAction?: (
    payload: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => void;
}
```

**Verification:**
```bash
npm run typecheck                # 0 errors — read-only tools' descriptors still type-check
                                 # because the union widens, doesn't narrow
```

---

## Task 6 — `src/lib/tools/audit-log.ts` + `audit-log.test.ts`

**Goal:** Helper module that owns audit-row writes and reads. Used by the registry (Task 7) and the `/api/audit` routes (Tasks 15, 16).

### 6.1 `src/lib/tools/audit-log.ts`

```typescript
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuditLogEntry, ToolExecutionContext } from './domain';
import type { Role } from '@/lib/auth/types';

export interface AuditWriteInput {
  tool_name: string;
  tool_use_id?: string | null;
  context: ToolExecutionContext;
  input: Record<string, unknown>;
  output: unknown;
  compensatingActionPayload: Record<string, unknown>;
}

export function writeAuditRow(db: Database.Database, input: AuditWriteInput): string {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO audit_log (
      id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id,
      input_json, output_json, compensating_action_json, created_at
    ) VALUES (
      @id, @tool_name, @tool_use_id, @actor_user_id, @actor_role, @conversation_id,
      @input_json, @output_json, @compensating_action_json, @created_at
    )
  `).run({
    id,
    tool_name: input.tool_name,
    tool_use_id: input.tool_use_id ?? null,
    actor_user_id: input.context.userId,
    actor_role: input.context.role,
    conversation_id: input.context.conversationId,
    input_json: JSON.stringify(input.input),
    output_json: JSON.stringify(input.output),
    compensating_action_json: JSON.stringify(input.compensatingActionPayload),
    created_at: Math.floor(Date.now() / 1000),
  });
  return id;
}

export function getAuditRow(db: Database.Database, id: string): AuditLogEntry | null {
  return (db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id) as AuditLogEntry | undefined) ?? null;
}

export function listAuditRows(
  db: Database.Database,
  opts: { actorUserId?: string; limit: number; since?: number },
): AuditLogEntry[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.actorUserId !== undefined) { where.push('actor_user_id = @actor_user_id'); params.actor_user_id = opts.actorUserId; }
  if (opts.since !== undefined)        { where.push('created_at < @since'); params.since = opts.since; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as AuditLogEntry[];
}

export function markRolledBack(db: Database.Database, id: string): void {
  // The `WHERE status = 'executed'` clause makes the call a true no-op on
  // already-rolled-back rows — second call updates 0 rows, leaving
  // rolled_back_at frozen at the original rollback timestamp.
  db.prepare(
    `UPDATE audit_log SET status = 'rolled_back', rolled_back_at = ?
     WHERE id = ? AND status = 'executed'`,
  ).run(Math.floor(Date.now() / 1000), id);
}
```

### 6.2 `src/lib/tools/audit-log.test.ts`

Two tests (per spec 12.2):

1. **Round-trip JSON columns** — write a row with structured `input`/`output`/`compensatingActionPayload`, read back via `getAuditRow`, assert the parsed JSON columns match the original objects.
2. **Status transition only forward** — write a row (defaults to `executed`), call `markRolledBack`, assert `status === 'rolled_back'` and `rolled_back_at !== null`. Calling `markRolledBack` twice on the same id is a no-op (idempotent UPDATE; same status).

Use `createTestDb()` from `@/lib/test/db` and `seedUser()` from `@/lib/test/seed`.

**Verification:**
```bash
npm run test -- src/lib/tools/audit-log.test.ts   # 2 passing
npm run typecheck
```

---

## Task 7 — `src/lib/tools/registry.ts`

**Goal:** Three changes:

1. Constructor accepts an optional `db` for the audit-write path.
2. `execute()` returns `Promise<ToolExecutionResult>` instead of `Promise<unknown>` — the envelope.
3. When `descriptor.compensatingAction` is set, run `descriptor.execute` synchronously inside a `db.transaction(() => { ... })()` together with `writeAuditRow`.

**Diff sketch** — replace the existing class:

```typescript
import type Database from 'better-sqlite3';
import type { Role } from '@/lib/auth/types';
import type {
  AnthropicTool,
  MutationOutcome,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
} from './domain';
import { ToolAccessDeniedError, UnknownToolError } from './errors';
import { writeAuditRow } from './audit-log';

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  constructor(private readonly db?: Database.Database) {}

  register(descriptor: ToolDescriptor): void { /* unchanged */ }
  getToolsForRole(role: Role): AnthropicTool[] { /* unchanged */ }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const descriptor = this.tools.get(name);
    if (!descriptor) throw new UnknownToolError(name);
    if (!this.canExecute(name, context.role)) throw new ToolAccessDeniedError(name, context.role);

    if (descriptor.compensatingAction) {
      if (!this.db) {
        throw new Error(
          `Mutating tool "${name}" registered but ToolRegistry has no db ` +
          `to write the audit row. Construct via new ToolRegistry(db).`,
        );
      }
      const db = this.db;
      const txn = db.transaction((): ToolExecutionResult => {
        const outcome = descriptor.execute(input, context) as MutationOutcome;
        const audit_id = writeAuditRow(db, {
          tool_name: name,
          tool_use_id: context.toolUseId ?? null,
          context,
          input,
          output: outcome.result,
          compensatingActionPayload: outcome.compensatingActionPayload,
        });
        return { result: outcome.result, audit_id };
      });
      return txn();
    }

    // Descriptor's execute return type is `Promise<unknown> | MutationOutcome`.
    // For read-only tools (no compensatingAction) it's always a Promise; `await`
    // on a non-Promise value resolves to the value, so the union is harmless.
    const rawResult = await descriptor.execute(input, context);
    return { result: rawResult, audit_id: undefined };
  }

  getDescriptor(name: string): ToolDescriptor | undefined { /* unchanged */ }
  getToolNames(): string[] { /* unchanged */ }
  canExecute(name: string, role: Role): boolean { /* unchanged */ }
}
```

**Why the `db` arg is optional:** Sprint 7 unit tests construct a registry directly without a `db` for read-only-only scenarios. Keeping `db` optional lets those tests keep passing without seeding a DB. A mutating tool registered against a no-`db` registry throws at execute time — tested in Task 8.

**Verification:**
```bash
npm run typecheck                # 0 errors after Tasks 5+6 are done
```

(Don't run `npm run test` yet — registry.test.ts will fail until Task 8 updates the call sites.)

---

## Task 8 — `src/lib/tools/registry.test.ts`

**Goal:** Update existing 6 tests to read `.result` from the envelope. Add 5 new tests covering the audit hook + invariants.

**Existing tests — minimal rewrites:**

```typescript
// before:
const result = await registry.execute(name, input, ctx);
expect(result).toEqual({ ... });

// after:
const { result, audit_id } = await registry.execute(name, input, ctx);
expect(result).toEqual({ ... });
expect(audit_id).toBeUndefined();   // read-only path
```

**New tests (5):**

1. **Mutating tool: audit row written.** Register a fake mutating descriptor against a `createTestDb()` registry, call `execute`, assert the returned `audit_id` is non-empty AND `audit_log` table contains exactly one row whose JSON columns parse back to the original `input` and `output`.
2. **Mutation throws → no rows in either table.** Register a mutating descriptor whose `execute` throws after a `INSERT ... INTO content_calendar`. Call `execute`; assert the call rejects, AND `content_calendar` is empty, AND `audit_log` is empty (transaction rolled back).
3. **Read-only path: no audit row.** Register a read-only descriptor (no `compensatingAction`), call `execute`, assert `audit_log` count is 0.
4. **Mutating tool but no `db` on registry.** `new ToolRegistry()` (no db), register a mutating descriptor, call `execute` → throws with the diagnostic error message naming the tool.
5. **Validation-throw contract.** Register a mutating descriptor whose `execute` throws on bad input. Call with bad input → rejects, `audit_log` empty (no phantom row).

**Verification:**
```bash
npm run test -- src/lib/tools/registry.test.ts   # 11 passing (6 existing + 5 new)
```

---

## Task 9 — `src/lib/tools/create-registry.ts`

**Goal:** Forward `db` to the registry constructor and register the two new mutating tools.

```typescript
import type Database from 'better-sqlite3';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import {
  createApproveDraftTool,
  createScheduleContentItemTool,
} from './mutating-tools';
import { ToolRegistry } from './registry';

export function createToolRegistry(db: Database.Database): ToolRegistry {
  const registry = new ToolRegistry(db);
  registry.register(createSearchCorpusTool(db));
  registry.register(createGetDocumentSummaryTool(db));
  registry.register(createListDocumentsTool(db));
  registry.register(createScheduleContentItemTool(db));
  registry.register(createApproveDraftTool(db));
  return registry;
}
```

**Verification:** Defer until Task 10 lands the mutating-tool factories.

---

## Task 10 — `src/lib/tools/mutating-tools.ts` + `mutating-tools.test.ts`

**Goal:** Two mutating tool factories. Per spec 4.1 / 6.2 / 6.3: each `execute` is **synchronous**, throws on validation failure, returns `{ result, compensatingActionPayload }`.

### 10.1 `src/lib/tools/mutating-tools.ts`

```typescript
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MutationOutcome, ToolDescriptor, ToolExecutionContext } from './domain';

export function createScheduleContentItemTool(db: Database.Database): ToolDescriptor {
  return {
    name: 'schedule_content_item',
    description: 'Schedule a content item for publication on a given channel and time.',
    inputSchema: {
      type: 'object',
      properties: {
        document_slug: { type: 'string', description: 'Slug of the document to schedule.' },
        // Post-impl amendment: ISO 8601 datetime string. Server parses to Unix
        // seconds for storage. Keeps the LLM free of date arithmetic.
        scheduled_for: {
          type: 'string',
          description:
            'ISO 8601 datetime when to publish (e.g. "2026-05-02T09:00:00Z"). Server parses this; do not pass raw Unix seconds.',
        },
        channel:       { type: 'string', description: 'Channel identifier (e.g., "twitter", "rss").' },
      },
      required: ['document_slug', 'scheduled_for', 'channel'],
    },
    roles: ['Editor', 'Admin'],
    category: 'system',
    execute: (input, ctx): MutationOutcome => {
      const slug = input.document_slug as string;
      const scheduledForRaw = input.scheduled_for as string;
      const channel = input.channel as string;
      // Parse-or-throw: validation contract requires a throw before any SQL.
      const ms = Date.parse(scheduledForRaw);
      if (!Number.isFinite(ms)) {
        throw new Error(`Invalid scheduled_for: "${scheduledForRaw}". Expected ISO 8601.`);
      }
      const scheduledForUnix = Math.floor(ms / 1000);
      const exists = db.prepare('SELECT 1 FROM documents WHERE slug = ?').get(slug);
      if (!exists) {
        throw new Error(`Unknown document_slug: ${slug}`);
      }
      const id = randomUUID();
      db.prepare(`
        INSERT INTO content_calendar (id, document_slug, scheduled_for, channel, scheduled_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, slug, scheduledForUnix, channel, ctx.userId, Math.floor(Date.now() / 1000));
      // Result echoes the ISO string the caller passed — keeps LLM-visible
      // content free of timestamps the LLM would have to format.
      return {
        result: { schedule_id: id, document_slug: slug, scheduled_for: scheduledForRaw, channel },
        compensatingActionPayload: { schedule_id: id },
      };
    },
    compensatingAction: (payload) => {
      db.prepare('DELETE FROM content_calendar WHERE id = ?').run(payload.schedule_id as string);
    },
  };
}

export function createApproveDraftTool(db: Database.Database): ToolDescriptor {
  return {
    name: 'approve_draft',
    description: 'Approve a draft document for publication.',
    inputSchema: {
      type: 'object',
      properties: {
        document_slug: { type: 'string', description: 'Slug of the document to approve.' },
        notes:         { type: 'string', description: 'Optional approval notes.' },
      },
      required: ['document_slug'],
    },
    roles: ['Admin'],
    category: 'system',
    execute: (input, ctx): MutationOutcome => {
      const slug = input.document_slug as string;
      const notes = (input.notes ?? null) as string | null;
      const exists = db.prepare('SELECT 1 FROM documents WHERE slug = ?').get(slug);
      if (!exists) {
        throw new Error(`Unknown document_slug: ${slug}`);
      }
      const id = randomUUID();
      db.prepare(`
        INSERT INTO approvals (id, document_slug, approved_by, notes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, slug, ctx.userId, notes, Math.floor(Date.now() / 1000));
      return {
        result: { approval_id: id, document_slug: slug, notes },
        compensatingActionPayload: { approval_id: id },
      };
    },
    compensatingAction: (payload) => {
      db.prepare('DELETE FROM approvals WHERE id = ?').run(payload.approval_id as string);
    },
  };
}
```

### 10.2 `src/lib/tools/mutating-tools.test.ts`

Five tests — all use `createTestDb()` + `seedUser()` + `seedDocument()`:

1. **`schedule_content_item` writes a row, returns deletable payload.** Seed document. Call execute with an ISO `scheduled_for`. Assert: row in `content_calendar` (with `scheduled_for` parsed to Unix seconds), return value's `scheduled_for` echoes the original ISO string, `compensatingActionPayload.schedule_id` matches the row id.
2. **`schedule_content_item` rejects unknown slug.** Call execute with a non-existent slug + valid ISO. Assert throws with `Unknown document_slug`; `content_calendar` empty.
3. **`schedule_content_item` rejects a non-ISO `scheduled_for`** *(post-impl amendment — Sprint 8 dev-server feedback)*. Call execute with `'not-a-date'`. Assert throws with `Invalid scheduled_for`; `content_calendar` empty (parse-throw runs before slug check).
4. **`approve_draft` writes a row.** Seed document, call execute, assert row in `approvals` with the expected `approved_by`.
5. **Compensating actions are idempotent.** Run `compensatingAction` twice with the same payload; the second call must not throw. Assert the row is gone after the first call.

**Verification:**
```bash
npm run test -- src/lib/tools/mutating-tools.test.ts   # 5 passing (4 original + 1 ISO-validation amendment)
npm run typecheck
```

---

## Task 11 — `src/app/api/chat/route.ts`

**Goal:** Three small changes around the existing tool-use loop. The chat route already constructs the registry at line 135 and calls `registry.execute` at line 455 — both lines stay; their semantics shift slightly because the registry now returns an envelope.

**Change 1 — destructure the envelope and pass `toolUseId`** at the call site (current line 455):

```typescript
// before:
toolResult = await toolRegistry.execute(
  toolUse.name,
  toolUse.input as Record<string, unknown>,
  { role, userId, conversationId },
);

// after:
const { result: toolResult_, audit_id } = await toolRegistry.execute(
  toolUse.name,
  toolUse.input as Record<string, unknown>,
  { role, userId, conversationId, toolUseId: toolUse.id },
);
toolResult = toolResult_;
```

`toolResult` is the existing local; renaming the destructured field via `result: toolResult_` then assigning preserves the rest of the route untouched. `toolUseId: toolUse.id` plumbs the LLM-issued id down into the audit row's `tool_use_id` column (per spec Section 14 open question #2 / Task 5 `ToolExecutionContext` extension).

**Change 2 — emit `audit_id` and `compensating_available`** in the `tool_result` NDJSON event (current lines 466–477):

```typescript
controller.enqueue(
  encoder.encode(
    `${JSON.stringify({
      tool_result: {
        id: toolId,
        name: toolUse.name,
        result: toolResult,
        error: toolError,
        ...(audit_id ? { audit_id, compensating_available: true } : {}),
      },
    })}\n`,
  ),
);
```

**Change 3 — verify message persistence is unchanged.** Lines 479+ persist `toolResultContent`. That content should remain `{ tool_result: { id, name, result, error } }` — without `audit_id`. The audit ID is metadata, not part of the persisted message body (per spec 7).

**Verification:**
```bash
npm run typecheck
npm run test -- src/app/api/chat/route.integration.test.ts
```

The existing chat route integration test mocks Anthropic and exercises the tool-use loop. It should keep passing because the test asserts on `result` content, not on the envelope structure.

---

## Task 12 — `src/lib/chat/parse-stream-line.ts`

**Goal:** Extend the `tool_result` variant of `StreamLineMessage` with two optional fields. Update the parser to forward them when present.

**Type union — add fields:**

```typescript
| {
    tool_result: {
      id: string;
      name: string;
      result: unknown;
      error?: string;
      audit_id?: string;
      compensating_available?: boolean;
    };
  };
```

**Parser — extend the existing `tool_result` branch:**

```typescript
const toolResult = (
  parsed as {
    tool_result: {
      id: string;
      name: string;
      result: unknown;
      error?: string;
      audit_id?: string;
      compensating_available?: boolean;
    };
  }
).tool_result;
return { tool_result: toolResult };
```

**Verification:**
```bash
npm run test -- src/lib/chat/parse-stream-line.test.ts   # existing tests still pass
                                                          # — no new test required here;
                                                          # ToolCard test (E2E task 18) covers the field flow
```

---

## Task 13 — `src/components/chat/ToolCard.tsx`

**Goal:** Add the Undo button with a three-state state machine (`executed` | `rolling_back` | `rolled_back`). Visible only when `audit_id` is present.

**Type extension:**

```typescript
interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  audit_id?: string;
  compensating_available?: boolean;
}
```

**State + handler** inside `ToolCard`:

```typescript
const [rollbackState, setRollbackState] = useState<'idle' | 'rolling_back' | 'rolled_back' | 'rollback_failed'>('idle');
const canUndo = invocation.compensating_available && invocation.audit_id && rollbackState === 'idle';

async function handleUndo() {
  if (!invocation.audit_id) return;
  setRollbackState('rolling_back');
  try {
    const res = await fetch(`/api/audit/${invocation.audit_id}/rollback`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setRollbackState('rolled_back');
  } catch {
    setRollbackState('rollback_failed');
  }
}
```

**Render** the button. Wrap the existing status-pill block (current lines 44–58 — the `Done` / `Error` / `Running…` pills) so it only renders when `rollbackState === 'idle'`. Otherwise the user sees both pills simultaneously (e.g., "Done | Rolling back…"), which is confusing:

```tsx
{rollbackState === 'idle' && (
  <>
    {hasError && (<span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">Error</span>)}
    {hasResult && !hasError && (<span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">Done</span>)}
    {!hasResult && !hasError && (<span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Running…</span>)}
  </>
)}
{canUndo && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); handleUndo(); }}
    className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
  >
    Undo
  </button>
)}
{rollbackState === 'rolling_back' && (
  <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Rolling back…</span>
)}
{rollbackState === 'rolled_back' && (
  <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Rolled back</span>
)}
{rollbackState === 'rollback_failed' && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); handleUndo(); }}
    className="ml-auto rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
  >
    Retry undo
  </button>
)}
```

The wrapped status-pill block uses `ml-auto` to align right (matching the Sprint 7 layout). The new state pills also use `ml-auto` so only one right-aligned pill is visible at any time. `e.stopPropagation()` on the Undo/Retry buttons prevents the wrapping `<button>` (which toggles expand/collapse) from also firing.

**Verification:**
```bash
npm run typecheck
npm run lint
```

The visual surface is exercised by Task 18's Playwright smoke test.

---

## Task 14 — `src/components/chat/ChatUI.tsx` + `ChatMessage.tsx`

**Goal:** Thread `audit_id` and `compensating_available` from the parsed `tool_result` event into the `ToolInvocation` object that `ToolCard` already receives.

**ChatUI.tsx** — find the `tool_result` arrival branch in the stream-reader loop (Sprint 7's lines 88–111). It currently sets `result` and `error` on the matching invocation. Add:

```typescript
inv.audit_id = parsed.tool_result.audit_id;
inv.compensating_available = parsed.tool_result.compensating_available;
```

**ChatMessage.tsx** — `toolInvocations` already passes through; no shape change needed because `ToolInvocation` is a structural type. Confirm the prop type definition there allows the two new optional fields (or imports `ToolInvocation` from `ToolCard.tsx`).

**Verification:**
```bash
npm run typecheck
npm run lint
```

---

## Task 15 — `src/app/api/audit/route.ts` + integration tests

**Goal:** Read-only endpoint that returns audit rows filtered by RBAC.

### 15.1 `src/app/api/audit/route.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/auth/session';
import { listAuditRows } from '@/lib/tools/audit-log';
import { DEMO_USERS } from '@/lib/auth/constants';
import type { Role } from '@/lib/auth/types';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  // Resolve session (mirrors chat/route.ts:111-124 fallback)
  const sessionCookie = request.cookies.get('contentops_session');
  let userId: string | undefined = DEMO_USERS.find((u) => u.role === 'Creator')?.id;
  let role: Role = 'Creator';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) { userId = payload.userId; role = payload.role; }
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw ? Number(sinceRaw) : undefined;

  const entries = listAuditRows(db, {
    actorUserId: role === 'Admin' ? undefined : userId,
    limit,
    since,
  });
  const next_since = entries.length === limit ? entries[entries.length - 1].created_at : null;
  return NextResponse.json({ entries, next_since });
}
```

### 15.2 `src/app/api/audit/route.integration.test.ts`

Three tests (per spec 12.4). Each constructs a test session cookie via `encrypt()` and calls `GET()` directly with a mocked `NextRequest`:

1. **Admin: sees rows from all actors.** Seed two audit rows with different `actor_user_id`. Call as Admin. Assert response includes both.
2. **Editor: sees only own.** Seed two rows (one from Editor, one from Admin). Call as Editor. Assert only the Editor's row returns.
3. **No-cookie: zero rows.** Seed an Admin-authored row. Call without a session cookie. Assert `entries.length === 0` (Creator default → no rows match Creator session id).

**Verification:**
```bash
npm run test -- src/app/api/audit/route.integration.test.ts   # 3 passing
```

---

## Task 16 — `src/app/api/audit/[id]/rollback/route.ts` + integration tests

**Goal:** RBAC-checked rollback endpoint. Atomic compensating-action + status-update transaction.

### 16.1 `src/app/api/audit/[id]/rollback/route.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/auth/session';
import { getAuditRow, markRolledBack } from '@/lib/tools/audit-log';
import { createToolRegistry } from '@/lib/tools/create-registry';
import { DEMO_USERS } from '@/lib/auth/constants';
import type { Role } from '@/lib/auth/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 1. Resolve session (no-cookie → Creator default)
  const sessionCookie = request.cookies.get('contentops_session');
  let userId: string | undefined = DEMO_USERS.find((u) => u.role === 'Creator')?.id;
  let role: Role = 'Creator';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) { userId = payload.userId; role = payload.role; }
  }
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Load audit row
  const row = getAuditRow(db, id);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 3. RBAC — audit-ownership policy (P1, spec 4.4)
  if (role !== 'Admin' && row.actor_user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 4. Idempotent
  if (row.status === 'rolled_back') {
    return NextResponse.json({ already_rolled_back: true, audit_id: id });
  }

  // 5. Look up descriptor
  const registry = createToolRegistry(db);
  const descriptor = registry.getDescriptor(row.tool_name);
  if (!descriptor || !descriptor.compensatingAction) {
    return NextResponse.json({ error: 'Tool no longer registered' }, { status: 410 });
  }
  const compensatingAction = descriptor.compensatingAction;

  // 6. Run inside transaction
  try {
    db.transaction(() => {
      compensatingAction(JSON.parse(row.compensating_action_json), {
        role: row.actor_role,
        userId: row.actor_user_id,
        conversationId: row.conversation_id ?? '',
      });
      markRolledBack(db, id);
    })();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Rollback failed' },
      { status: 500 },
    );
  }
  return NextResponse.json({ rolled_back: true, audit_id: id });
}
```

### 16.2 `src/app/api/audit/[id]/rollback/route.integration.test.ts`

Four tests (per spec 12.5):

1. **Admin rolls back another user's row.** Seed an Editor-authored `schedule_content_item` audit row + matching `content_calendar` row. Call as Admin. Assert: 200, audit row is `rolled_back`, `content_calendar` row is gone.
2. **Non-admin rolling back another user's row → 403.** Setup as above. Call as Editor (different user). Assert 403, no state change.
3. **Idempotent — second rollback.** Same setup. Roll back once (200). Roll back again. Assert 200 with `already_rolled_back: true`, no state change beyond first call.
4. **Compensating action throws → audit row stays `executed`.** Inject a registry whose `compensatingAction` for `schedule_content_item` always throws. Seed a matching audit row. Call rollback. Assert: 500 returned, audit row's `status === 'executed'`, `rolled_back_at IS NULL`. The transaction-rollback contract from spec 4.4 step 7 is verified.

   **Injection mechanism:** the test uses `vi.mock` to replace `createToolRegistry` for this test only. Place at the top of the test file:

   ```typescript
   import { vi } from 'vitest';
   import { ToolRegistry } from '@/lib/tools/registry';
   import {
     createScheduleContentItemTool,
     createApproveDraftTool,
   } from '@/lib/tools/mutating-tools';
   import {
     createSearchCorpusTool,
     createGetDocumentSummaryTool,
     createListDocumentsTool,
   } from '@/lib/tools/corpus-tools';

   // Sentinel — only the throwing-rollback test consults this.
   const useThrowingRegistry = { value: false };

   vi.mock('@/lib/tools/create-registry', async (importOriginal) => {
     const actual = await importOriginal<typeof import('@/lib/tools/create-registry')>();
     return {
       createToolRegistry: (db: import('better-sqlite3').Database) => {
         if (!useThrowingRegistry.value) return actual.createToolRegistry(db);
         const reg = new ToolRegistry(db);
         reg.register(createSearchCorpusTool(db));
         reg.register(createGetDocumentSummaryTool(db));
         reg.register(createListDocumentsTool(db));
         const schedule = createScheduleContentItemTool(db);
         schedule.compensatingAction = () => { throw new Error('forced rollback failure'); };
         reg.register(schedule);
         reg.register(createApproveDraftTool(db));
         return reg;
       },
     };
   });
   ```

   Test 4 sets `useThrowingRegistry.value = true` in its `beforeEach`/`afterEach` (with cleanup) so tests 1–3 still use the real `createToolRegistry`.

Each test calls the route handler directly with a constructed `NextRequest` and a `params` argument shaped as `{ params: Promise.resolve({ id }) }`.

**Verification:**
```bash
npm run test -- src/app/api/audit/\\[id\\]/rollback/route.integration.test.ts   # 4 passing
```

---

## Task 17 — `mcp/contentops-server.ts` + new MCP contract test

**Goal:** Adjust the three existing tool handlers to read `.result` from the registry envelope. Add wrappers for the two new mutating tools. Add one contract test for mutating-tool MCP parity.

### 17.1 `mcp/contentops-server.ts`

For each of the three existing handlers (`search_corpus`, `get_document_summary`, `list_documents`), replace:

```typescript
const result = await registry.execute('search_corpus', { query, max_results }, MCP_CONTEXT);
return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

with:

```typescript
const { result } = await registry.execute('search_corpus', { query, max_results }, MCP_CONTEXT);
return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

The `audit_id` is intentionally dropped at the MCP boundary — MCP clients see the raw tool result, not the audit metadata. This matches the spec's "MCP boundary" non-leak invariant.

Then add two new `server.registerTool(...)` blocks for `schedule_content_item` and `approve_draft`:

```typescript
server.registerTool(
  'schedule_content_item',
  {
    description: 'Schedule a content item for publication on a given channel and time.',
    inputSchema: {
      document_slug: z.string().describe('Slug of the document to schedule.'),
      scheduled_for: z.number().int().describe('Unix seconds when to publish.'),
      channel:       z.string().describe('Channel identifier (e.g., "twitter", "rss").'),
    },
  },
  async ({ document_slug, scheduled_for, channel }) => {
    try {
      const { result } = await registry.execute(
        'schedule_content_item',
        { document_slug, scheduled_for, channel },
        MCP_CONTEXT,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Schedule failed' }) }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'approve_draft',
  {
    description: 'Approve a draft document for publication.',
    inputSchema: {
      document_slug: z.string().describe('Slug of the document to approve.'),
      notes:         z.string().optional().describe('Optional approval notes.'),
    },
  },
  async ({ document_slug, notes }) => {
    try {
      const { result } = await registry.execute(
        'approve_draft',
        { document_slug, notes },
        MCP_CONTEXT,
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Approval failed' }) }],
        isError: true,
      };
    }
  },
);
```

Both handlers destructure `{ result }` from the registry envelope; `audit_id` is intentionally dropped at the MCP boundary (per spec Section 4.7).

### 17.2 `mcp/contentops-server.test.ts`

Add one new test (per spec 12.6):

1. **Mutating tools surface via MCP and produce audit rows.** Construct a registry against a `createTestDb()`. Call the registry's `execute('schedule_content_item', ...)` with `MCP_CONTEXT`. Assert: returned envelope has `audit_id`. SELECT from `audit_log` — exactly one row, `actor_user_id === 'mcp-server'`, `actor_role === 'Admin'`. Both new mutating tools must surface in `registry.getToolNames()`.

The existing two MCP contract tests stay green because the underlying registry still produces the same logical results — the envelope is unwrapped at the MCP handler.

**Verification:**
```bash
npm run test -- mcp/contentops-server.test.ts   # 3 passing (2 existing + 1 new)
npm run mcp:server                              # starts without error
                                                # — exit immediately after seeing
                                                # "ContentOps MCP Server running on stdio"
```

---

## Task 18 — Playwright setup + first E2E smoke test

**Goal:** Add `@playwright/test` as a devDependency, create the env-flag-gated Anthropic mock client, create `playwright.config.ts`, and write one smoke test that exercises the full chat → tool_use → ToolCard render → Undo flow against the mocked Anthropic. Per spec 12.7, the smoke test runs against an Anthropic mock — not the real API — so it is deterministic and does not consume Anthropic budget on every run.

### 18.1 E2E Anthropic mock client — `src/lib/anthropic/e2e-mock.ts` + modify `src/lib/anthropic/client.ts`

The Playwright dev server runs in-process; the chat route's outbound call to Anthropic happens on the server side and is invisible to Playwright's browser-level network interception. The cleanest mock surface is therefore inside the SDK-construction site itself, gated by an env flag.

**`src/lib/anthropic/e2e-mock.ts`** (new file):

```typescript
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Returns a thin object satisfying the parts of the Anthropic SDK that
 * src/app/api/chat/route.ts uses: messages.create() and messages.stream().
 * Behavior:
 *   - First call to messages.create(): returns a tool_use response invoking
 *     schedule_content_item with the seeded `sqs-launch` slug.
 *   - Subsequent call to messages.stream(): emits one text chunk then ends.
 *
 * Used only when CONTENTOPS_E2E_MOCK === '1'. Set by playwright.config.ts
 * via webServer.env. Never imported in production code paths.
 */
export function createE2EMockClient(): Anthropic {
  let createCalls = 0;
  return {
    messages: {
      create: async (_params: unknown) => {
        createCalls++;
        if (createCalls === 1) {
          return {
            id: 'msg_e2e_1',
            type: 'message',
            role: 'assistant',
            stop_reason: 'tool_use',
            content: [
              { type: 'text', text: 'Scheduling that for you.' },
              {
                type: 'tool_use',
                id: 'toolu_e2e_schedule',
                name: 'schedule_content_item',
                input: {
                  document_slug: 'sqs-launch',
                  scheduled_for: Math.floor(Date.now() / 1000) + 86_400,
                  channel: 'twitter',
                },
              },
            ],
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        }
        return {
          id: 'msg_e2e_2', type: 'message', role: 'assistant',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Scheduled.' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      },
      stream: () => {
        // Returns an async iterable matching messages.stream()'s shape.
        // Emits one text_delta then a message_stop. Implementer fills in the
        // exact event shapes from the SDK's MessageStream type.
        async function* events() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Scheduled.' } };
          yield { type: 'message_stop' };
        }
        const iterable = events();
        return Object.assign(iterable, {
          finalMessage: async () => ({
            id: 'msg_e2e_2', type: 'message', role: 'assistant',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Scheduled.' }],
            usage: { input_tokens: 0, output_tokens: 0 },
          }),
        });
      },
    },
  } as unknown as Anthropic;
}
```

**`src/lib/anthropic/client.ts`** (modify):

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { createE2EMockClient } from './e2e-mock';

let _client: Anthropic | null = null;
let _mock: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (process.env.CONTENTOPS_E2E_MOCK === '1') {
    if (!_mock) _mock = createE2EMockClient();
    return _mock;
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local for local development.',
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}
```

The flag is read from `process.env` (not from the Zod-validated `env` module) so the existing env schema is untouched. The mock is constructed lazily and reused.

### 18.2 `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      CONTENTOPS_E2E_MOCK: '1',     // engages src/lib/anthropic/e2e-mock.ts
    },
  },
});
```

`testMatch` is the explicit `.spec.ts` regex so Playwright never picks up Vitest's `.test.ts` files. `webServer.env` propagates `CONTENTOPS_E2E_MOCK=1` to the dev server process, where it gates the mock client in `getAnthropicClient()`.

### 18.3 `tests/e2e/chat-tool-use.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { encrypt } from '@/lib/auth/session';
import { DEMO_USERS } from '@/lib/auth/constants';

test.beforeEach(async ({ context }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
  // SessionPayload requires userId + role + displayName — see src/lib/auth/types.ts
  const token = await encrypt({
    userId: admin.id,
    role: 'Admin',
    displayName: admin.display_name,
  });
  await context.addCookies([{
    name: 'contentops_session',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
});

test('mutating tool flow renders ToolCard with working Undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill(
    'Schedule the welcome post for tomorrow on twitter, document slug is sqs-launch.'
  );
  await page.getByRole('button', { name: 'Send message' }).click();

  // Wait for the ToolCard to render with a successful schedule_content_item
  const toolCard = page.locator('button', { hasText: 'schedule_content_item' });
  await expect(toolCard).toBeVisible({ timeout: 30_000 });

  // The Undo button appears next to the status pill
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();

  // Click Undo and assert the rolled-back state
  await undo.click();
  await expect(page.getByText('Rolled back', { exact: true })).toBeVisible({ timeout: 5000 });
});
```

**Note on `import` paths from `tests/e2e/`:** the path alias `@/` resolves to `src/`. Task 19 adds `tests/**/*.ts` to `tsconfig.json` `include` so the alias also resolves at type-check time.

**Note on Anthropic mocking:** the dev server launched by `webServer.command` runs with `CONTENTOPS_E2E_MOCK=1` (set in 18.2). `getAnthropicClient()` returns the canned mock from 18.1 — the test never hits the real API. The mock invokes `schedule_content_item` deterministically, so the test does not depend on LLM behavior or burn Anthropic budget.

**Note on test data:** the document `sqs-launch` is part of the seeded corpus from Sprint 4 (`src/db/seed.ts` runs `ingestCorpus` over the 5 demo documents). The test relies on the dev DB being seeded — the prerequisite check before the test ensures this. The mock client (18.1) hardcodes `'sqs-launch'` as the slug it schedules — match this string with the corpus seed.

**Selector tightening:** `getByRole('button', { name: 'Send message' })` matches the exact accessible name set at [src/components/chat/ChatComposer.tsx:48](src/components/chat/ChatComposer.tsx#L48). Verified against the current component.

**Verification:**
```bash
npm run test:e2e          # 1 Playwright test passes
                          # — first run downloads browser binaries
```

---

## Task 19 — `package.json` + `tsconfig.json`

**Goal:** Wire up the new dependency and the new TypeScript include.

### 19.1 `package.json`

Add to `devDependencies`:
```json
"@playwright/test": "^1.58.2",
"dotenv": "^17.0.0"
```

`dotenv` is required by `playwright.config.ts` (Task 18.2) to load `.env.local` for `CONTENTOPS_SESSION_SECRET`. It is **not** currently a project dependency — verified via `grep "dotenv" package.json` (no matches before this sprint).

Add to `scripts`:
```json
"test:e2e": "playwright test"
```

### 19.2 `tsconfig.json`

Add `tests/**/*.ts` to the `include` array so Playwright tests are type-checked alongside source files. Should look roughly:

```json
"include": [
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  "mcp/**/*.ts",
  "tests/**/*.ts"
]
```

(Keep all existing entries; only `tests/**/*.ts` is new.)

**Verification:**
```bash
npm install                # installs @playwright/test
npx playwright install chromium    # downloads chromium browser only — no firefox/webkit
npm run typecheck          # 0 errors — Playwright spec type-checks
npm run lint               # 0 errors
```

`npx playwright install chromium` runs once per machine. Document this in `README.md` if Sprint 8 also touches docs (out of scope for this sprint).

---

## Task 20 — Final Verification

Run in sequence; every command must pass:

```bash
npm run typecheck          # 0 errors
npm run lint               # 0 errors
npm run test               # ≥ 132 passing — see impl-qa.md for the breakdown
                           # (106 baseline + 20 net-new + 1 post-impl ISO-validation
                           # amendment + 5 MCP tests previously hidden by the
                           # vitest-config gap surfaced in sprint-qa Issue 1)
npm run eval:golden        # 5/5 cases passing
npm run mcp:server         # starts cleanly; ctrl-c after stderr line appears
npm run test:e2e           # 1 Playwright spec passes (local dev server)
```

**Expected:**
- `typecheck`: 0 errors.
- `lint`: 0 errors, 0 fixes applied.
- `test`: 132 (5 registry-new + 3 audit-log + 5 mutating + 3 audit-list + 4 rollback + 1 MCP-new — total +21 net-new; plus 5 MCP tests previously hidden by the vitest-config gap surfaced in sprint-qa Issue 1. Spec section 12.9 estimated +17 with `~` tolerance; impl-qa reconciles the actual breakdown).
- `eval:golden`: 5/5, no regression.
- `mcp:server`: prints `ContentOps MCP Server running on stdio` to stderr, then waits for input.
- `test:e2e`: 1 passed.

If any verification fails and the fix is *outside Sprint 8 scope*, stop per charter Section 9 and surface to the human. Do not in-line fixes that drift across sprint boundaries.

---

## Completion Checklist

- [ ] `src/lib/db/schema.ts` — `audit_log`, `content_calendar`, `approvals` tables + 2 indexes appended.
- [ ] `src/lib/test/db.ts` created — `createTestDb()` exported.
- [ ] `src/lib/test/seed.ts` created — `seedUser`, `seedConversation`, `seedDocument`, `seedChunk` exported.
- [ ] `src/lib/test/embed-mock.ts` created — `mockEmbedding`, `applyEmbedderMock` exported.
- [ ] Local helpers stripped from `runner.test.ts`, `ingest.test.ts`, `retrieve.test.ts`; characterization diffs are clean.
- [ ] `src/lib/db/test-helpers.ts` deleted; no stale imports remain.
- [ ] `src/lib/tools/domain.ts` — `MutationOutcome`, `ToolExecutionResult`, `AuditLogEntry` exported; `ToolDescriptor.compensatingAction` optional, `execute` return-type widened.
- [ ] `src/lib/tools/audit-log.ts` created — `writeAuditRow`, `getAuditRow`, `listAuditRows`, `markRolledBack` exported.
- [ ] `src/lib/tools/audit-log.test.ts` created — 2 tests passing.
- [ ] `src/lib/tools/registry.ts` — constructor accepts `db`; `execute()` returns `ToolExecutionResult`; mutating path wraps in transaction.
- [ ] `src/lib/tools/registry.test.ts` — existing 6 tests adjusted for envelope; 5 new tests passing.
- [ ] `src/lib/tools/create-registry.ts` — passes `db` to `new ToolRegistry(db)`; registers both new mutating tools.
- [ ] `src/lib/tools/mutating-tools.ts` created — `createScheduleContentItemTool`, `createApproveDraftTool` exported.
- [ ] `src/lib/tools/mutating-tools.test.ts` created — 4 tests passing.
- [ ] `src/app/api/chat/route.ts` — destructures envelope; emits `audit_id` + `compensating_available` on `tool_result` event.
- [ ] `src/lib/chat/parse-stream-line.ts` — `tool_result` variant carries optional `audit_id` + `compensating_available`.
- [ ] `src/components/chat/ToolCard.tsx` — Undo button + state machine (executed → rolling_back → rolled_back, plus rollback_failed retry).
- [ ] `src/components/chat/ChatUI.tsx` — threads `audit_id` + `compensating_available` to invocation state.
- [ ] `src/components/chat/ChatMessage.tsx` — `ToolCard` props accept the new fields.
- [ ] `src/app/api/audit/route.ts` created — `GET` with RBAC filter.
- [ ] `src/app/api/audit/route.integration.test.ts` created — 3 tests passing.
- [ ] `src/app/api/audit/[id]/rollback/route.ts` created — `POST` with audit-ownership RBAC, transactional compensating-action + status-update, idempotent on already-rolled-back, 410 on missing descriptor.
- [ ] `src/app/api/audit/[id]/rollback/route.integration.test.ts` created — 4 tests passing including atomicity.
- [ ] `mcp/contentops-server.ts` — three existing handlers read `.result` from envelope; two new mutating tool handlers added.
- [ ] `mcp/contentops-server.test.ts` — 1 new test added; total 3 passing.
- [ ] `playwright.config.ts` created.
- [ ] `tests/e2e/chat-tool-use.spec.ts` created — 1 spec passing locally.
- [ ] `package.json` — `@playwright/test` devDep added; `test:e2e` script added.
- [ ] `tsconfig.json` — `tests/**/*.ts` added to `include`.
- [ ] `npm run typecheck` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run test` — ≥ 132 passing (see impl-qa.md for full breakdown).
- [ ] `npm run eval:golden` — 5/5 passing.
- [ ] `npm run mcp:server` — starts without error.
- [ ] `npm run test:e2e` — 1 spec passing locally.

---

## Outcomes

- **132 Vitest tests passing** (up from 106), plus **1 Playwright E2E spec**.
- **RBAC matrix preserved across mutation:** Creator sees only read-only tools; Editor adds `schedule_content_item`; Admin adds `approve_draft`. The Sprint 7 architectural invariant survives mutation by routing every mutating call + audit + rollback through the same RBAC-filtered registry.
- **Audit log with rollback** persisted in SQLite. Atomic mutation + audit-row insert; atomic compensating-action + status-update.
- **Test infrastructure consolidated** under `src/lib/test/` — three duplicated helpers eliminated; characterization diffs verify behavior preservation.
- **First Playwright smoke test** establishes the E2E pattern that Sprint 9's cockpit dashboard will extend.
- **Charter Section 5 items 6 and 7 satisfied:** RBAC-aware mutating tools and rollback controls.

---

## Known Follow-Up

The following are flagged but explicitly deferred to later sprints:

- **Cockpit dashboard surface.** A full audit-history page with filters, a rollback history view, and live state — Sprint 9.
- **CI Playwright integration.** The smoke test runs locally only; CI workflow is Sprint 10.
- **Per-caller MCP authentication.** MCP-originated audit entries continue to attribute to actor `mcp-server` / role `Admin`. Sprint 10 candidate.
- **`PRAGMA foreign_keys = ON` + synthetic system users.** All new tables follow the existing documentary-FK convention. Future hardening sprint.
- **Audit-log retention / purge.** The table grows unbounded for the demo lifetime.
- **A `drafts` table.** `approve_draft` operates on existing corpus documents. Creating new drafts via tool is a future scope question.

These do not block Sprint 8 delivery.

---

## Commit Strategy

```
feat(s8): mutating tools, audit log, rollback, and test consolidation

- Extend ToolRegistry with mutating-tool path: sync execute + audit-row insert
  inside a single better-sqlite3 transaction.
- Return-type breaking change: registry.execute() now returns ToolExecutionResult
  envelope { result, audit_id? } so audit metadata cannot leak into LLM-visible
  tool result content or persisted message bodies.
- Add 2 mutating tools: schedule_content_item (Editor+Admin), approve_draft (Admin).
- Add audit_log, content_calendar, approvals tables (Unix-seconds timestamps,
  no documentary FK clauses — matches existing schema convention).
- Add GET /api/audit and POST /api/audit/[id]/rollback with RBAC filtering;
  rollback respects audit-ownership only (P1).
- Add Undo affordance in ToolCard for mutating tool results.
- Consolidate test fixtures into src/lib/test/{db,seed,embed-mock}.ts;
  characterization diffs verify byte-identical behavior pre/post move.
- Add @playwright/test + first E2E smoke spec under tests/e2e/.
- 132 Vitest tests passing + 1 Playwright spec.
- eval:golden: 5/5 passing (no regression).
```
