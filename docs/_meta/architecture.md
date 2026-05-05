# Architecture — ContentOps

**Snapshot date:** 2026-05-05 (post-Sprint 11, between sprints, before Sprint 12).

This document describes ContentOps as it exists in the codebase today. It is **descriptive** (what is), not **prescriptive** (what should be). For planned changes see [`docs/_specs/`](../_specs/) and the most-recent sprint folder. For *how to write code*, see [`agent-guidelines.md`](agent-guidelines.md). For governance, see [`agent-charter.md`](agent-charter.md).

---

## 1. Product shape

ContentOps is a workspace-based, AI-assisted content-operations cockpit for media brands. The full user story:

1. Operator visits `/`. If they have no workspace cookie, the middleware issues one for the sample workspace ("Side Quest Syndicate").
2. The chat opens grounded in the active workspace's brand corpus (voice, audience, content pillars, calendar, style guide).
3. Operator can switch role (Creator / Editor / Admin) via the role switcher; the available tool surface changes accordingly.
4. Operator types into the composer; on send, the assistant streams a response that may use one or more tools (`search_corpus`, `get_document_summary`, `list_documents`, `schedule_content_item`, `approve_draft`).
5. Mutating tool calls (Editor+ for schedule, Admin for approve) write an audit row in the same transaction as the mutation. Each tool result in the UI surfaces an Undo button while it's not yet rolled back.
6. Operator (Editor+) opens `/cockpit` to see audit log, scheduled items, approvals, today's spend, and eval health. Creators are redirected home.
7. Operator (Admin or owner) clicks Undo → `POST /api/audit/{id}/rollback` runs the compensating action atomically; the row's status flips to `rolled_back`.
8. Alternatively, operator visits `/onboarding` (or the upload modal) to drop their own brand markdown files into a new workspace. The system ingests, chunks, embeds, sets a workspace cookie, and redirects home. Workspace expires after 24h via lazy cleanup on next upload.

Side Quest Syndicate stays as a one-click sample workspace so reviewers face zero cold-start friction.

---

## 2. Runtime topology

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                            Browser                                  │
 │  app/layout.tsx (server component, html/body, Tailwind)             │
 │  └── app/page.tsx (server) → ChatUI (client, 'use client')          │
 │       └── fetch /api/chat (NDJSON stream reader)                    │
 │  └── app/cockpit/page.tsx (server) → CockpitDashboard (mostly       │
 │       server-rendered panels + a few client islands for actions)    │
 └─────────────────────────────────────────────────────────────────────┘
                                      │ HTTP / streaming fetch
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │                      Next.js 16 (Node.js runtime)                   │
 │   src/middleware.ts                                                 │
 │      ├─ ensure session cookie (Creator default)                     │
 │      └─ ensure workspace cookie (sample fallback)                   │
 │   src/app/api/chat/route.ts          POST  ndjson streaming         │
 │   src/app/api/audit/route.ts         GET   role-filtered audit list │
 │   src/app/api/audit/[id]/rollback    POST  idempotent rollback      │
 │   src/app/api/workspaces/route.ts    POST  upload + ingest          │
 │   src/app/api/workspaces/select-sample  POST  cookie swap           │
 │                                                                     │
 │   src/lib/db/index.ts (singleton better-sqlite3 handle)             │
 │      ├─ pragmas: journal_mode=WAL, busy_timeout=5000,               │
 │      │           foreign_keys=ON                                    │
 │      ├─ db.exec(SCHEMA)                                             │
 │      └─ migrate(db)  // idempotent boot-time patch                  │
 │   src/lib/anthropic/client.ts (singleton, env-gated mock)           │
 │   src/lib/rag/embed.ts (lazy Xenova WASM pipeline)                  │
 └─────────────────────────────────────────────────────────────────────┘
                          │                         │
                          ▼                         ▼
            api.anthropic.com/v1/messages    ./data/contentops.db
            (model = env.CONTENTOPS_         (SQLite file, WAL mode)
             ANTHROPIC_MODEL,
             default claude-haiku-4-5)

 Side process (not part of the Next.js app):
 ┌─────────────────────────────────────────────────────────────────────┐
 │   mcp/contentops-server.ts (npm run mcp:server)                     │
 │   stdio transport; exposes the same 5 tools via                     │
 │   toolRegistry.execute(...) against the same SQLite file.           │
 │   Hardcoded role=Admin, workspace=sample.                           │
 └─────────────────────────────────────────────────────────────────────┘
```

There is no background worker, no cron, no message queue. Mutations are synchronous. Workspace TTL purge is lazy on the upload route. Embedding pipeline initializes lazily on the first `embedBatch` call.

---

## 3. Module map

### Web (`src/app/`)

| Path | Purpose |
|---|---|
| [`layout.tsx`](../../src/app/layout.tsx) | Root server layout, html/body, Tailwind import. |
| [`page.tsx`](../../src/app/page.tsx) | Chat home. Server component resolves session + workspace + latest conversation, hands payload to `ChatUI`. |
| [`globals.css`](../../src/app/globals.css) | `@import "tailwindcss"` + minimal base layer. |
| [`onboarding/`](../../src/app/onboarding/) | Brand-upload wizard. |
| [`cockpit/page.tsx`](../../src/app/cockpit/page.tsx) | Operator cockpit. Editor+ only; Creator redirects home. |
| [`api/chat/route.ts`](../../src/app/api/chat/route.ts) | POST → NDJSON streaming chat with tool-use loop. |
| [`api/audit/route.ts`](../../src/app/api/audit/route.ts) | GET role-filtered audit log. |
| [`api/audit/[id]/rollback/route.ts`](../../src/app/api/audit/[id]/rollback/route.ts) | POST idempotent rollback via compensating action. |
| [`api/workspaces/route.ts`](../../src/app/api/workspaces/route.ts) | POST multipart upload → ingest → cookie set. |
| [`api/workspaces/select-sample/route.ts`](../../src/app/api/workspaces/select-sample/route.ts) | POST swap to sample workspace cookie. |

### Domain (`src/lib/`)

| Path | Purpose |
|---|---|
| [`db/schema.ts`](../../src/lib/db/schema.ts) | DDL for the 11-table schema. |
| [`db/migrate.ts`](../../src/lib/db/migrate.ts) | Idempotent boot-time migration: backfills `workspace_id`, drops legacy slug UNIQUE via 12-step rebuild, recreates per-workspace indexes. |
| [`db/index.ts`](../../src/lib/db/index.ts) | Singleton DB handle, pragmas, schema bootstrap. |
| [`db/spend.ts`](../../src/lib/db/spend.ts) | `recordSpend`, `getTodaySpend`, `isSpendCeilingExceeded`. |
| [`db/rate-limit.ts`](../../src/lib/db/rate-limit.ts) | Sliding-window 10 req/hour per session id. |
| [`auth/session.ts`](../../src/lib/auth/session.ts) | jose-signed JWT session cookie (HS256, 24h). |
| [`auth/constants.ts`](../../src/lib/auth/constants.ts) | Three demo users (Creator, Editor, Admin) with stable IDs. |
| [`anthropic/client.ts`](../../src/lib/anthropic/client.ts) | Singleton SDK client; swaps in `e2e-mock` when `CONTENTOPS_E2E_MOCK=1`. |
| [`anthropic/e2e-mock.ts`](../../src/lib/anthropic/e2e-mock.ts) | Deterministic mock for Playwright runs. |
| [`chat/system-prompt.ts`](../../src/lib/chat/system-prompt.ts) | Build role-aware, workspace-aware prompt with RAG context block. |
| [`chat/context-window.ts`](../../src/lib/chat/context-window.ts) | Slice conversation history to fit token budget. |
| [`chat/conversations.ts`](../../src/lib/chat/conversations.ts) | Workspace-scoped conversation queries. |
| [`chat/parse-stream-line.ts`](../../src/lib/chat/parse-stream-line.ts) | Client-side NDJSON line parser. |
| [`tools/domain.ts`](../../src/lib/tools/domain.ts) | `ToolDescriptor`, `MutationOutcome`, `ToolExecutionContext`, `ToolExecutionResult`. |
| [`tools/registry.ts`](../../src/lib/tools/registry.ts) | RBAC dispatch + sync-transaction wrapping for mutating tools. |
| [`tools/create-registry.ts`](../../src/lib/tools/create-registry.ts) | Wires the 5 tools to the DB handle. |
| [`tools/corpus-tools.ts`](../../src/lib/tools/corpus-tools.ts) | Read-only: `search_corpus`, `get_document_summary`, `list_documents`. |
| [`tools/mutating-tools.ts`](../../src/lib/tools/mutating-tools.ts) | `schedule_content_item`, `approve_draft` with compensating actions. |
| [`tools/audit-log.ts`](../../src/lib/tools/audit-log.ts) | `writeAuditRow`, `getAuditRow`, `listAuditRows`, `markRolledBack`. |
| [`rag/embed.ts`](../../src/lib/rag/embed.ts) | Lazy Xenova `all-MiniLM-L6-v2` pipeline; L2-normalized Float32 output. |
| [`rag/chunk-document.ts`](../../src/lib/rag/chunk-document.ts) | Hierarchical chunking (document / section / passage). IDs namespaced by `documentId`. |
| [`rag/ingest.ts`](../../src/lib/rag/ingest.ts) | `ingestMarkdownFile`, `ingestCorpus`. Hash-based idempotency. |
| [`rag/retrieve.ts`](../../src/lib/rag/retrieve.ts) | Hybrid retrieval: vector + BM25 + RRF, workspace-scoped. |
| [`rag/bm25.ts`](../../src/lib/rag/bm25.ts) | Tokenization + BM25 scoring. |
| [`workspaces/constants.ts`](../../src/lib/workspaces/constants.ts) | `SAMPLE_WORKSPACE`, `WORKSPACE_TTL_SECONDS = 86400`. |
| [`workspaces/cookie.ts`](../../src/lib/workspaces/cookie.ts) | jose-signed JWT workspace cookie. Reuses `CONTENTOPS_SESSION_SECRET`. |
| [`workspaces/queries.ts`](../../src/lib/workspaces/queries.ts) | `getActiveWorkspace` (handles cookie ↔ expires_at gray state). |
| [`workspaces/cleanup.ts`](../../src/lib/workspaces/cleanup.ts) | `purgeExpiredWorkspaces` — child-first cascade in one transaction. |
| [`workspaces/ingest-upload.ts`](../../src/lib/workspaces/ingest-upload.ts) | Validate multipart, ingest markdown, persist workspace row. |
| [`cockpit/queries.ts`](../../src/lib/cockpit/queries.ts) | Cockpit panel data: audit, schedule, approvals, spend. |
| [`cockpit/eval-reports.ts`](../../src/lib/cockpit/eval-reports.ts) | Read latest eval JSON from disk. |
| [`evals/runner.ts`](../../src/lib/evals/runner.ts) | Iterate golden cases, retrieve, score, aggregate. |
| [`evals/golden-set.ts`](../../src/lib/evals/golden-set.ts) | 5 curated retrieval cases with expected chunk IDs and keywords. |
| [`evals/scoring.ts`](../../src/lib/evals/scoring.ts) | Precision@K, Recall@K, MRR, Groundedness. |
| [`evals/reporter.ts`](../../src/lib/evals/reporter.ts) | Write JSON eval reports to disk. |
| [`test/db.ts`](../../src/lib/test/db.ts) | In-memory SQLite for tests. |
| [`test/seed.ts`](../../src/lib/test/seed.ts) | Test factories: `seedUser`, `seedWorkspace`, `seedDocument`. |

### Components (`src/components/`)

| Path | Purpose |
|---|---|
| [`chat/ChatUI.tsx`](../../src/components/chat/ChatUI.tsx) | Top-level client chat view. |
| [`chat/ChatMessage.tsx`](../../src/components/chat/ChatMessage.tsx) | Per-turn message renderer. |
| [`chat/ChatEmptyState.tsx`](../../src/components/chat/ChatEmptyState.tsx) | Workspace-aware suggestion prompts (required `workspaceName` prop). |
| [`chat/ToolCard.tsx`](../../src/components/chat/ToolCard.tsx) | Tool-result card with Undo button when `audit_id` is present. |
| [`chat/TypingIndicator.tsx`](../../src/components/chat/TypingIndicator.tsx) | Pre-first-token pulse. |
| [`chat/AttachButton.tsx`](../../src/components/chat/AttachButton.tsx) | Brand-upload affordance in chat. |
| [`auth/RoleSwitcher.tsx`](../../src/components/auth/RoleSwitcher.tsx) | Role swap → updates session cookie. |
| [`cockpit/*`](../../src/components/cockpit/) | Audit panel, Schedule panel, Approvals panel, Spend panel, Eval-health panel. |
| [`layout/WorkspaceMenu.tsx`](../../src/components/layout/) | Workspace picker / switcher. |

### MCP, scripts, seed (`mcp/`, `scripts/`, `src/db/`)

| Path | Purpose |
|---|---|
| [`mcp/contentops-server.ts`](../../mcp/contentops-server.ts) | stdio MCP server; wraps `toolRegistry.execute`. |
| [`scripts/diag-db.mjs`](../../scripts/diag-db.mjs) | Read-only diagnostic snapshot of dev DB (table counts, FK orphan probes, index inspection). |
| [`scripts/eval-golden.ts`](../../scripts/eval-golden.ts) | CLI wrapper around `runGoldenEval`; writes report. |
| [`src/db/seed.ts`](../../src/db/seed.ts) | Bootstrap dev DB: schema + migrate + sample workspace + demo users + corpus ingest. |

---

## 4. Data model

11 tables. Six are workspace-scoped (`documents`, `chunks`, `audit_log`, `content_calendar`, `approvals`, `conversations`); the rest are global.

### Workspace-scoped tables

| Table | Notable columns | Per-workspace constraint | Indexes |
|---|---|---|---|
| `documents` | `slug`, `workspace_id`, `title`, `content`, `content_hash` | composite UNIQUE on (`slug`, `workspace_id`) | `idx_documents_slug_workspace`, `idx_documents_workspace` |
| `chunks` | `document_id` FK → documents, `workspace_id`, `chunk_index`, `chunk_level` ('document'\|'section'\|'passage'), `embedding` BLOB | — | `idx_chunks_workspace` |
| `audit_log` | `tool_name`, `actor_user_id`, `actor_role`, `workspace_id`, `input_json`, `output_json`, `compensating_action_json`, `status` ('executed'\|'rolled_back'), `rolled_back_at` | — | `idx_audit_log_workspace`, `idx_audit_log_actor`, `idx_audit_log_created` |
| `content_calendar` | `document_slug`, `workspace_id`, `scheduled_for`, `channel`, `scheduled_by` | — | `idx_content_calendar_workspace` |
| `approvals` | `document_slug`, `workspace_id`, `approved_by`, `notes` | — | `idx_approvals_workspace` |
| `conversations` | `user_id` FK → users, `workspace_id`, `title` | — | `idx_conversations_workspace` |

### Global tables

| Table | Purpose |
|---|---|
| `workspaces` | `id`, `name`, `description`, `is_sample` (0\|1), `created_at`, `expires_at` (NULL = never expire). Index on `expires_at`. |
| `users` | `id`, `email` UNIQUE, `role` ('Creator'\|'Editor'\|'Admin'), `display_name`. Three rows seeded for demo. |
| `messages` | `id`, `conversation_id` FK → conversations, `role` ('user'\|'assistant'\|'tool'), `content`, `tokens_in`, `tokens_out`. |
| `spend_log` | `date` (PK, ISO YYYY-MM-DD), `tokens_in`, `tokens_out`. One row per day. |
| `rate_limit` | `session_id` (PK), `window_start`, `count`. Used by demo-mode rate limit. |

### Foreign keys

Three FKs declared in [`schema.ts`](../../src/lib/db/schema.ts):

- `conversations.user_id REFERENCES users(id)`
- `messages.conversation_id REFERENCES conversations(id)`
- `chunks.document_id REFERENCES documents(id)`

No `ON DELETE` clauses (default = NO ACTION). FK enforcement is on at boot — both via the library default and the explicit pragma. Workspace deletion is application-level cascade in [`workspaces/cleanup.ts`](../../src/lib/workspaces/cleanup.ts) (child-first).

### Embeddings storage

`chunks.embedding` is a BLOB of L2-normalized Float32 (Xenova `all-MiniLM-L6-v2`, 384-dim). No FTS5 virtual table, no separate vector index. Retrieval reads the BLOB into a `Float32Array` and dot-products in JS. BM25 is a separate scoring pass over the same chunk set, then fused via Reciprocal Rank Fusion.

---

## 5. Sequence flows

### A. Chat streaming (user → LLM → UI)

```
Client                         Next.js route                       Anthropic API           SQLite
───────                       ─────────────                       ───────────────         ────────
fetch POST /api/chat ────► route.ts:POST
                              │ Zod parse body
                              │ resolve session + workspace cookies
                              │ rate-limit + spend ceiling (demo mode)
                              │ load conversation history
                              │ retrieve(message, db, workspace) ──────────────────────► chunks SELECT
                              │                                                          (embed query, dot
                              │                                                          product, BM25, RRF)
                              │ buildSystemPrompt({role, workspace, context})
                              │ open ReadableStream (NDJSON)
                              │
                              │ ┌─ tool-use loop (≤3 iters) ─┐
                              │ │ messages.create (non-stream) ──► api ◄────────── tool_use blocks
                              │ │ for each tool_use:
                              │ │   toolRegistry.execute(name, input, ctx)
                              │ │     ├─ RBAC check
                              │ │     └─ if mutating:
                              │ │         db.transaction(() => {
                              │ │           descriptor.execute(...)            ── INSERT/UPDATE
                              │ │           writeAuditRow(...)                 ── INSERT audit_log
                              │ │         })
                              │ │   emit tool_use event line                ┐
                              │ │   emit tool_result event line (audit_id)  │ NDJSON
                              │ │   persist tool messages                   │ stream
                              │ └────────────────────────────┘              │
                              │                                              │
                              │ messages.stream (final) ──► api ◄── text deltas via .on('text')
                              │   for each delta: emit chunk event line ────┘
                              │
                              │ INSERT messages (assistant) + recordSpend
                              │ controller.close()
client reads NDJSON ◄────────┘
   line by line, routes by event key:
   - chunk → append text to current message
   - tool_use → render skeleton
   - tool_result → render ToolCard with Undo
```

Streaming pattern: NDJSON, one JSON object per line, `Content-Type: application/x-ndjson`. Final assistant message persisted in DB after stream closes. `recordSpend` only runs in demo mode.

### B. RAG retrieval

```
retrieve(query, db, {workspaceId})
  │
  │ 1. embedBatch([query]) → queryVec (L2-normalized Float32)
  │ 2. SELECT chunks WHERE workspace_id = ? AND chunk_level IN ('section','passage')
  │ 3. for each chunk:
  │      decode embedding BLOB → Float32Array
  │      vectorScore = dot(queryVec, chunkVec)        (cosine, vectors L2-normalized)
  │ 4. sort desc by vectorScore → vectorRank[1..N]
  │ 5. tokenize(query) + tokenize each chunk; bm25Score for each
  │ 6. sort desc by bm25Score → bm25Rank[1..N]
  │ 7. RRF fusion: rrfScore = Σ over rankings of 1 / (k + rank)
  │ 8. sort desc by rrfScore, slice top-K
  │
  └→ return RetrievedChunk[]
```

Workspace-scoping is in step 2. Vector and BM25 ranks are merged, not weighted — RRF is robust to score-scale differences.

### C. Mutating tool + audit + rollback

**Forward path** (inside `toolRegistry.execute`):

```
execute(name, input, ctx)
  │ assert descriptor exists
  │ assert canExecute(name, ctx.role)
  │
  │ if descriptor.compensatingAction:
  │   db.transaction(() => {
  │     outcome = descriptor.execute(input, ctx)            // MutationOutcome
  │     audit_id = writeAuditRow(db, {
  │       tool_name, tool_use_id, context, input,
  │       output: outcome.result,
  │       compensatingActionPayload: outcome.compensatingActionPayload,
  │     })
  │     return { result: outcome.result, audit_id }
  │   })()
  │ else:
  │   return { result: await descriptor.execute(input, ctx), audit_id: undefined }
```

If either the tool's `execute` or `writeAuditRow` throws, the transaction rolls back atomically — no orphan mutation, no orphan audit row.

**Rollback path** (`POST /api/audit/[id]/rollback`):

```
load audit row
  │ if status === 'rolled_back': return 200 (idempotent no-op)
  │ ownership check: Admin sees all; others must own the row
  │ load descriptor by tool_name; lookup compensatingAction
  │
  │ db.transaction(() => {
  │   compensatingAction(JSON.parse(compensating_action_json), context)
  │   markRolledBack(db, id)   // UPDATE audit_log SET status='rolled_back', rolled_back_at=now()
  │ })()
  │
  └→ return { audit_id, status: 'rolled_back' }
```

Examples:
- `schedule_content_item` → forward: `INSERT INTO content_calendar`. Compensating payload `{ schedule_id }`. Rollback: `DELETE FROM content_calendar WHERE id = ?`.
- `approve_draft` → forward: `INSERT INTO approvals`. Compensating payload `{ approval_id }`. Rollback: `DELETE FROM approvals WHERE id = ?`.

The compensating-action payload is plain JSON — the rollback path closes over no mutable state from the original call.

### D. Workspace upload → ingest → cookie

```
POST /api/workspaces (multipart form)
  │ parse FormData: name, description, files[]
  │ validateUpload(files): max 5 .md files, ≤100KB each
  │ purgeExpiredWorkspaces(db)        // lazy TTL cleanup
  │
  │ ingestUpload(db, validated):
  │   db.transaction(() => {
  │     INSERT INTO workspaces (id, name, description, is_sample=0,
  │                              created_at, expires_at = now + 86400)
  │     for each file:
  │       ingestMarkdownFile(db, { slug, content, workspaceId }):
  │         documentId = uuid()
  │         INSERT INTO documents (id=documentId, slug, workspace_id, ...)
  │         chunks = chunkDocument(documentId, title, content)
  │         vectors = embedBatch(chunks.map(c => c.embeddingInput))   // WASM
  │         for (chunk, vector) in zip:
  │           INSERT INTO chunks (id=`${documentId}#${level}:${index}`,
  │                              document_id, workspace_id,
  │                              embedding=Float32→BLOB, ...)
  │   })()
  │
  │ encodeWorkspace({workspace_id}) → JWT
  │ res.cookies.set(WORKSPACE_COOKIE_NAME, jwt, httpOnly, sameSite=lax, maxAge=86400)
  │
  └→ return { workspace_id }; client redirects to /
```

`chunkDocument` produces a hierarchical chunk set: one `document` chunk (full content + headings outline), plus `section` chunks per H2 ≤400 words (split into `passage` chunks if larger). Chunk IDs are `${documentId}#${level}:${index}` so collisions are impossible across workspaces.

---

## 6. CSS architecture

Tailwind v4, import-only. [`src/app/globals.css`](../../src/app/globals.css) is the single CSS file:

```css
@import "tailwindcss";

@layer base {
  /* minimal resets and font defaults */
}
```

No `tailwind.config.js`. No design-token CSS. No theming layer. All component styling is inline Tailwind utility classes in TSX. Icons are imported from `lucide-react`.

This is intentional — the project is small enough that a separate token system would be over-engineering. If a token layer becomes necessary (e.g., theming for white-label demos), it would be added under `src/app/` or a new `src/styles/` folder.

---

## 7. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Pure functions | Vitest | `chunk-document`, `bm25`, `parse-stream-line`, `context-window`, `scoring`, `migrate`, `embed` (with mock pipeline). |
| DB / queries | Vitest, in-memory SQLite | `db/schema`, `db/spend`, `db/rate-limit`, `workspaces/queries`, `workspaces/cleanup`, `cockpit/queries`. |
| Tool registry | Vitest | RBAC dispatch, mutating-vs-read paths, audit transaction wrapping. |
| Mutating tools | Vitest | `schedule_content_item`, `approve_draft` happy path + rollback idempotency. |
| Route handlers | Vitest (`*.integration.test.ts`) | `POST /api/chat` streaming, `GET /api/audit` RBAC filter, `POST /api/audit/[id]/rollback`, `POST /api/workspaces/select-sample`. |
| UI components | Vitest + happy-dom | `ChatUI`, `ChatMessage`, `ChatEmptyState`, `ToolCard`, `TypingIndicator`, cockpit panels. |
| Server pages | Vitest + happy-dom | `app/page.test.tsx`, `app/cockpit/page.test.tsx`. Asserts redirect, role gate, payload shape. |
| End-to-end | Playwright | `tests/e2e/*.spec.ts`. Real browser, real Next.js server, mocked Anthropic via `CONTENTOPS_E2E_MOCK=1`. |
| Eval | Custom harness | `npm run eval:golden` runs 5 retrieval cases against the sample workspace. Local-only (no network calls during retrieval). |
| MCP contract | Vitest | `mcp/contentops-server.test.ts` — registry parity with chat route. |
| Schema regression | Vitest | `migrate.test.ts` includes a Round-5 FK guard (rebuild succeeds with `foreign_keys = ON`). |

**Counts as of 2026-05-05:** 262 vitest tests (55 files), 2 Playwright specs, 5 golden eval cases. The 262nd test is a boot-state regression added in this inter-sprint pass: schema.test.ts asserts `foreign_keys = 1` at boot.

In-memory SQLite ([`src/lib/test/db.ts`](../../src/lib/test/db.ts)) is the standard test fixture. Real-DB tests are limited to `mcp/contentops-server.test.ts` and `src/lib/tools/corpus-tools.test.ts`, which assume `./data/contentops.db` is seeded.

---

## 8. Key design decisions

1. **NDJSON streaming over SSE.** Plain `ReadableStream` keeps the response a regular HTTP response that any fetch client can consume line by line. SSE adds framing rules (`event:`, `data:`, blank-line terminator) that the client doesn't need.

2. **Audit row in the same `db.transaction` as the mutation.** Atomic. If the audit-row insert fails, the mutation rolls back. No orphan mutations without trail. Implemented in [`tools/registry.ts:94-106`](../../src/lib/tools/registry.ts#L94-L106).

3. **Compensating-action payload is plain JSON, not a closure.** A rollback issued days later still works; nothing closes over the original request scope. The descriptor's `compensatingAction` is a pure `(payload, ctx, db) → void`.

4. **Embeddings as BLOB on the row, not a separate vector index.** Five sample documents, ~50 chunks; in-app dot-product is fast enough. No external vector DB to operate, no sync to manage. Trade-off: linear scan per workspace, which is fine at this corpus size.

5. **Hybrid retrieval via RRF.** Vector catches semantic phrasing, BM25 catches exact-keyword brand terms ("Side Quest Syndicate"). RRF merges ranks without tuning weights. See [`rag/retrieve.ts`](../../src/lib/rag/retrieve.ts).

6. **`workspace_id` denormalized on every per-data table.** Fast index lookup, zero joins for the common workspace-filtered query. Trade-off: the column is redundant with `documents.workspace_id` for `chunks`, but the alternative (always join through documents) was slower and easier to forget.

7. **Workspace TTL is lazy.** `purgeExpiredWorkspaces` runs only on `POST /api/workspaces`, not on every request and not on a cron. Eventual consistency is acceptable — the sample workspace never expires, and stale uploaded workspaces don't cause user-visible problems until the user tries to upload a new one.

8. **Workspace cookie is a separate JWT from the session cookie.** [`workspaces/cookie.ts`](../../src/lib/workspaces/cookie.ts) explains the rationale: workspace and role are orthogonal concerns. A user can switch workspaces without rotating their role JWT.

9. **`getActiveWorkspace` handles cookie ↔ `expires_at` gray state.** A signed JWT can decrypt cleanly while the underlying workspace row is gone (TTL-purged). Returning `null` from the loader and falling back to the sample workspace is the contract.

10. **FK enforcement is locked at boot.** `db.pragma('foreign_keys = ON')` is explicit in [`db/index.ts`](../../src/lib/db/index.ts) even though `better-sqlite3@12` defaults it on. Defensive against library default change or a future native-`sqlite3` swap.

11. **Demo-mode guardrails are server-side.** Rate limit + spend ceiling + model pin + gated by `CONTENTOPS_DEMO_MODE`. The client cannot bypass them by editing a request.

12. **Tool registry is the single mutation entry point.** MCP server and chat route both call `toolRegistry.execute`. There is no second code path that mutates `documents`, `content_calendar`, or `approvals`.

13. **Required props beat silent defaults in components.** `ChatEmptyState` declares `workspaceName: string`, not `workspaceName?: string` with a fallback. Sprint 11 Round 3 was a bug because a default leaked Side Quest copy into a non-Side-Quest workspace.

---

## 9. Deployment shape

**Intended target:** Vercel (Sprint 12 will exercise this; not yet deployed).

`next.config.ts` is Vercel-aware:
- `serverExternalPackages: ['better-sqlite3']` — keeps the native module on the Node runtime.
- `outputFileTracingIncludes: { '/*': ['./data/**/*'] }` — bundles the seeded DB into deployment artifacts (the demo ships the sample workspace + corpus).

**Environment variables** (see `.env.example`):

| Var | Purpose |
|---|---|
| `CONTENTOPS_DB_PATH` | Path to the SQLite file. Default `./data/contentops.db`. Override on Vercel. |
| `CONTENTOPS_DEMO_MODE` | `true` engages rate limit + spend ceiling. `false` for local dev. |
| `CONTENTOPS_ANTHROPIC_MODEL` | Model pin. Default `claude-haiku-4-5`. |
| `CONTENTOPS_DAILY_SPEND_CEILING_USD` | Default `2`. Demo only. |
| `CONTENTOPS_SESSION_SECRET` | ≥32-char HS256 secret. Used for both session and workspace cookies. |
| `ANTHROPIC_API_KEY` | Required for real API calls. Eval and prod both need a real key. |

**Build:**
- `npm run build` → `next build`.
- Tailwind v4 is processed by PostCSS via `@tailwindcss/postcss`.

**Runtime:**
- `npm run start` → `next start`. Required for Vercel.
- MCP server (`npm run mcp:server`) runs separately. Not deployed with the web app today.

**Not yet wired:**
- No Dockerfile.
- No CI workflow file.
- No release tagging.
- No backup strategy for the SQLite file (acceptable for a demo; production would need this).

---

## 10. Known risks

1. **Vector-only retrieval can miss exact-match brand terms.** RRF with BM25 mitigates partly, but for a brand corpus heavy on proper nouns / catchphrases, FTS5 would be a real upgrade. Captured for a future sprint in `agent-charter.md` v1.8 deferred items.

2. **Demo-mode guardrails apply only to the chat endpoint.** Rate limit and spend ceiling guard `POST /api/chat`. The upload endpoint (`POST /api/workspaces`) has no per-session rate limit; a flood of large uploads could fill disk and embedding pipeline time. Acceptable for an internal demo, not for an exposed public deploy.

3. **Auth is demo cookies, not real auth.** Three hardcoded users with stable IDs; the role switcher is cosmetic state in a JWT. If publicly exposed without a real auth layer, anyone can switch to Admin.

4. **Single SQLite file with no backup automation.** A filesystem failure on the deploy target loses all workspaces and audit trail. Acceptable for a portfolio demo; not for a production system.

5. **Embedding model auto-downloads on first use.** Xenova's WASM pipeline fetches the model on first `embedBatch` call. On a cold-start serverless platform, the first request after a deploy can be slow (model download + WASM init). Plan: warm the pipeline at boot, or cache the model artifact in the deployment bundle.

6. **MCP server is hardcoded to the sample workspace.** Multi-workspace MCP is post-Sprint-13. If a developer points an MCP client at a workspace-uploaded ContentOps instance today, all MCP calls operate on the sample, not their workspace.

7. **`workspaces.expires_at` cleanup runs only on upload.** A workspace whose 24h TTL elapses while a user is mid-conversation will read as "active" until the next `POST /api/workspaces` triggers cleanup. UI-side handling (gray-state in `getActiveWorkspace`) avoids hard breakage, but the timing window exists.

8. **No FK CASCADE on the declared FKs.** Application code in `workspaces/cleanup.ts` deletes children child-first, in the right order. Any future code path that deletes `users`, `conversations`, or `documents` directly will fail with `SQLITE_CONSTRAINT` unless it follows the same pattern. Captured for future-sprint refactor in `agent-charter.md` v1.8.

---

**End of architecture snapshot.**

This document is dated 2026-05-05 and pinned to the post-Sprint-11 codebase. Refresh discipline: update this file at every sprint boundary, in the same commit as the sprint's documentation amendments. If any section here drifts from the code, the code is the source of truth — fix the doc.
