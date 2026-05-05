# Agent Guidelines — ContentOps

**Status:** Active
**Companion to:** [`agent-charter.md`](agent-charter.md) (v1.8+)

This file is the *how to write code* doc. The charter is the *how to run the project* doc. When they conflict, the charter wins.

Stack-specific rules are grouped first, then ContentOps-specific patterns, then style/discipline. Every rule below is grounded in code that exists in the repo today — not aspirational. If a rule cites a pattern, the same pattern should already be present in [src/](../../src/).

---

## 1. Stack rules

### Next.js 16 App Router

- **Route handlers live at [`src/app/api/*/route.ts`](../../src/app/api/).** Default to `export async function POST(req)` style. No `pages/` directory.
- **Anything that touches `better-sqlite3` runs on Node, not Edge.** Don't add `export const runtime = 'edge'` to a route that imports `@/lib/db`. The native module isn't bundled for Edge. `next.config.ts` already lists `serverExternalPackages: ['better-sqlite3']`; preserve that.
- **Streaming uses NDJSON over `ReadableStream`** — see [`src/app/api/chat/route.ts`](../../src/app/api/chat/route.ts). One JSON object per line, `Content-Type: application/x-ndjson`. Don't introduce SSE or websockets — the client reads lines and routes events by key (`chunk`, `tool_use`, `tool_result`, `quota`, `error`).
- **Cookies via `req.cookies.get()` and `cookies().set()`** — see [`src/middleware.ts`](../../src/middleware.ts). HttpOnly + sameSite=lax + 24h maxAge for both session and workspace cookies.
- **Server components for pages, client components for interactivity.** Add `'use client'` only at the leaf component that needs hooks/event handlers. Don't blanket-mark a whole subtree.

### React 19

- **No Suspense in chat.** Streaming uses fetch + `ReadableStream` reader. Suspense is overkill for unbuffered token rendering.
- **Required props beat optional defaults.** If a component needs a workspace name, declare it `workspaceName: string`, not `workspaceName?: string` with a fallback. Sprint 11 Round 3 was a bug because a default leaked Side Quest copy into a GitLab workspace.
- **Server components fetch data directly from the DB.** See [`src/app/page.tsx`](../../src/app/page.tsx) — server component reads workspace/conversation/messages, then hands a serialized payload to the client `ChatUI`.

### Anthropic SDK (`@anthropic-ai/sdk` ^0.90)

- **Tool-use loop is bounded** — [`src/app/api/chat/route.ts`](../../src/app/api/chat/route.ts) caps at 3 iterations. Each iteration: non-streaming `messages.create` to get `tool_use` blocks → execute via `toolRegistry.execute` → append `tool_result` → re-call. Final answer streams via `messages.stream` + `.on('text')`.
- **System prompt is parameterized on `{ role, workspace, context }`** — see [`src/lib/chat/system-prompt.ts`](../../src/lib/chat/system-prompt.ts). Never hard-code brand-specific copy in the prompt; pass `workspace.name` / `workspace.description` through.
- **Model is pinned via `env.CONTENTOPS_ANTHROPIC_MODEL`.** Don't hardcode `'claude-haiku-4-5'` in code; read from env. The pin is a demo-mode cost guardrail.
- **Tool results that come from a *mutating* tool carry `audit_id` in the result envelope.** Don't strip it — the UI uses it to enable the Undo button and `POST /api/audit/{id}/rollback`.

### better-sqlite3 12

- **Always use `db.prepare().run/all/get`.** Never inline SQL into `db.exec()` for runtime queries; `exec()` is reserved for `SCHEMA` and migrations.
- **Transactions are sync and wrapped via `db.transaction(() => {...})()`.** Mutating tool execution + audit-row insert run inside one transaction — see [`src/lib/tools/registry.ts:94-106`](../../src/lib/tools/registry.ts#L94-L106). If the tool throws, the audit row never lands.
- **Pragmas at boot** — [`src/lib/db/index.ts`](../../src/lib/db/index.ts) sets `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON` (the last one as a defensive lock against library-default change). Don't remove the explicit `foreign_keys = ON`; it's a regression-tested invariant.
- **Toggling `foreign_keys` inside a transaction is forbidden by SQLite.** The Round-4 table rebuild in [`src/lib/db/migrate.ts:76-99`](../../src/lib/db/migrate.ts#L76-L99) toggles outside the transaction. Don't try to be clever inside one.
- **Embeddings store as `BLOB` of L2-normalized Float32** — [`src/lib/rag/ingest.ts`](../../src/lib/rag/ingest.ts). Convert via `Buffer.from(new Float32Array(vec).buffer)` on write, `new Float32Array(blob.buffer, blob.byteOffset, blob.length / 4)` on read.

### Tailwind v4

- **Import-only setup.** [`src/app/globals.css`](../../src/app/globals.css) starts with `@import "tailwindcss"`. There is no `tailwind.config.js`, and you don't need one. Don't add one.
- **No `@apply` in custom CSS.** v4 prefers utility-class composition.
- **Conditional classes use list syntax.**
  ```tsx
  className={[
    'px-2 text-white',
    isActive && 'bg-indigo-600',
    isError ? 'border-red-500' : 'border-gray-200',
  ].filter(Boolean).join(' ')}
  ```
- **Icons via `lucide-react`** — already a dependency. Don't add Heroicons or react-icons.

### TypeScript 6

- **Strict mode.** No `// @ts-ignore` or `// @ts-expect-error` without a one-line WHY comment. If a type doesn't exist, add it; don't escape-hatch.
- **Zod at boundaries** — see [`src/app/api/chat/route.ts`](../../src/app/api/chat/route.ts) where the request body is parsed with `.safeParse` before any code reads `body.message`. Inside the codebase, prefer plain `interface` / `type`. Don't use Zod for internal types.
- **No `any`.** Use `unknown` and narrow.

### Vitest 4

- **Tests next to source.** [`src/lib/db/schema.ts`](../../src/lib/db/schema.ts) ↔ [`src/lib/db/schema.test.ts`](../../src/lib/db/schema.test.ts). Integration tests append `.integration.test.ts` so the file name signals scope.
- **In-memory SQLite for unit tests** via [`src/lib/test/`](../../src/lib/test/) helpers. Don't write tests against `./data/contentops.db` — tests must be hermetic.
- **No real Anthropic calls.** Use [`src/lib/anthropic/e2e-mock.ts`](../../src/lib/anthropic/e2e-mock.ts) gated by `CONTENTOPS_E2E_MOCK=1`. Real-API tests are reserved for the operator's manual smoke flow.
- **Use `Promise` and proper async assertions.** Don't `setTimeout` or `Process.sleep` to wait for state — restructure the test to await the actual signal.

### Playwright

- **`tests/e2e/*.spec.ts`** with `webServer.env.CONTENTOPS_E2E_MOCK=1` — see [`playwright.config.ts`](../../playwright.config.ts). Single worker, no parallelism, 120s server-startup timeout. Don't increase parallelism without a real reason; the dev server isn't built for it.

### MCP server

- **Same code path as the chat route.** [`mcp/contentops-server.ts`](../../mcp/contentops-server.ts) wraps `toolRegistry.execute()` — never re-implement tool logic in the MCP wrapper.
- **Hardcoded sample workspace + Admin role.** Multi-workspace MCP is post-Sprint-13.

### Biome 2

- **`npm run lint` runs `biome check src/`.** Fix issues, don't suppress.
- **Format on save** if your editor supports it — Biome is the formatter, not Prettier.

---

## 2. ContentOps-specific patterns

### Workspace scoping is non-negotiable

Every per-data table query MUST filter by `workspace_id`:

| Table | Filter required |
|---|---|
| `documents`, `chunks`, `audit_log`, `content_calendar`, `approvals`, `conversations` | `WHERE workspace_id = ?` (or `= @workspace_id`) |
| `messages` | inherits via `conversation_id`'s workspace |
| `users`, `workspaces`, `spend_log`, `rate_limit` | global, no workspace filter |

The composite UNIQUE on `documents (slug, workspace_id)` means slug `"brand-identity"` can exist in many workspaces. Don't write code that assumes slug is globally unique.

### Chunk IDs are namespaced by documentId

Format: `${documentId}#${level}:${index}` — see [`src/lib/rag/chunk-document.ts:56,122`](../../src/lib/rag/chunk-document.ts#L56-L128). `documentId` is a UUID per `(workspace_id, slug)`, so chunk IDs never collide across workspaces. **Don't use slug in the chunk ID** — Sprint 11 Round 5 fixed this collision; don't reintroduce it.

### Mutating tools own their compensating action

Mutating tools return `MutationOutcome { result, compensatingActionPayload }` ([`src/lib/tools/domain.ts`](../../src/lib/tools/domain.ts)). The `compensatingActionPayload` is **plain JSON** — no callbacks, no closures. The descriptor's `compensatingAction` function is a pure function from `(payload, context, db) → void` that runs on rollback.

Examples:
- `schedule_content_item` → payload `{ schedule_id }` → action `DELETE FROM content_calendar WHERE id = ?`
- `approve_draft` → payload `{ approval_id }` → action `DELETE FROM approvals WHERE id = ?`

The pattern is forward-symmetric: if you can't write the compensating action as plain SQL parameterized by JSON, the tool isn't ready to be mutating.

### Audit row insert and mutation share one transaction

[`src/lib/tools/registry.ts:94-106`](../../src/lib/tools/registry.ts#L94-L106) wraps `descriptor.execute()` and `writeAuditRow()` in `db.transaction()`. **Atomic** — if either throws, neither lands. Don't bypass this by calling tools outside the registry.

Rollback ([`src/app/api/audit/[id]/rollback/route.ts`](../../src/app/api/audit/[id]/rollback/route.ts)) is **idempotent**: re-rollback returns 200 with no change. Don't add re-rollback prevention; the existing check is correct.

### RBAC is enforced in two places

1. `ToolRegistry.getToolsForRole(role)` filters tool descriptors before the LLM ever sees them. The LLM can't request a tool the role can't call.
2. `ToolRegistry.execute()` re-checks at call time. Defense in depth.

API routes also check the session role (e.g., the cockpit page redirects Creators home). Never trust the client's `role` field.

### Workspace cookie ↔ `expires_at` gray state

A signed JWT cookie can decrypt cleanly while the workspace row is expired (TTL purged). [`src/lib/workspaces/queries.ts`](../../src/lib/workspaces/queries.ts) `getActiveWorkspace` returns `null` when:
- The row doesn't exist, OR
- `is_sample = 0` AND `expires_at < now()`

Calling code MUST handle the `null` case by falling back to the sample workspace — never assume a decrypted cookie means a live workspace.

### Demo-mode guardrails are server-side

- **Rate limit:** 10 requests/hour per session, [`src/lib/db/rate-limit.ts`](../../src/lib/db/rate-limit.ts).
- **Spend ceiling:** `CONTENTOPS_DAILY_SPEND_CEILING_USD` (default $2/day), [`src/lib/db/spend.ts`](../../src/lib/db/spend.ts).
- **Model pin:** `CONTENTOPS_ANTHROPIC_MODEL`, never user-selectable.
- **Anonymous role:** No anonymous role today; if added, it should not have access to mutating tools.

These are enforced **only when `CONTENTOPS_DEMO_MODE=true`**. Local dev runs without them. Don't disable in demo mode "temporarily" — they're the gate that keeps a public deploy from burning your API key.

### Workspaces TTL is lazy

`purgeExpiredWorkspaces()` ([`src/lib/workspaces/cleanup.ts`](../../src/lib/workspaces/cleanup.ts)) runs only on `POST /api/workspaces`. There is no cron. The sample workspace (`is_sample = 1`) is excluded by the WHERE clause. **Don't add a background job** unless a sprint specs it — eventual consistency is a feature.

The cleanup helper deletes children before parents (chunks → audit_log → content_calendar → approvals → documents → messages → conversations → workspaces). With FK enforcement on, this order matters. Don't rearrange.

---

## 3. Style & discipline

### Comments

- **WHY, not WHAT.** Identifier names already say what.
- **No references to the current task, sprint, PR, or issue.** Those rot. Capture the structural reason, not the trigger.
- **Brief.** If a comment grows past 3 lines, ask whether the code can be clearer instead.

Bad:
```ts
// Sprint 11 Round 5 fix: chunk IDs need to be namespaced by documentId
// because slugs are no longer globally unique after the workspace pivot.
const id = `${documentId}#${level}:${index}`;
```

Good:
```ts
// documentId namespacing — slug is per-workspace, so chunk IDs derived
// from slug would collide across workspaces.
const id = `${documentId}#${level}:${index}`;
```

### Tests

- **Test the invariant, not the run.** "Migration didn't throw" is not a test; "schema satisfies fresh-schema invariants" is. Sprint 11 had two HIGH-severity bugs slip through because a migration test asserted completion instead of correctness.
- **Manual smoke complements vitest.** Operator runs the upload flow on a real dev DB after every sprint. Don't claim a sprint is done on headless tests alone.
- **5-Why root cause.** When a test catches a bug, ask why the bug existed *and* why earlier tests didn't catch it. The answer often reveals the next test to write.

### Anti-patterns to refuse

- **Premature abstraction.** Three similar lines beats a generic helper that needs a config object.
- **Backwards-compat shims for hypothetical futures.** No `// @deprecated, kept for compat` placeholders.
- **Silent defaults on required state.** If a component needs `workspaceName`, the type should make absence a compile error.
- **Mutation without an audit trail.** If a tool changes `documents`, `content_calendar`, or `approvals` and doesn't go through the registry, the change isn't visible in the cockpit. Always go through the registry.
- **Cross-workspace queries.** Even if the calling code "knows" the workspace, the SQL must filter. Defense in depth.

### Commit discipline

The charter governs this in §7 and §11. Two rules to internalize:

1. **No `git commit` until the operator says "lets commit."** Headless tests passing isn't permission.
2. **No `git push` ever, unless explicitly asked.**

---

## 4. Verification before declaring done

Before saying a task is complete, run all three:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # biome check src/
npm run test        # vitest run
```

For UI work, also exercise the change in the running dev server and confirm in a browser. Type-check passing isn't the same as "the feature works." If you can't run the UI, say so explicitly — don't claim success.

For RAG / retrieval work, also run `npm run eval:golden` with a real `ANTHROPIC_API_KEY`. 5/5 is the bar.

---

## 5. When in doubt

- **Charter** governs governance: when to plan, when to commit, sprint discipline.
- **Architecture** ([`architecture.md`](architecture.md)) is the descriptive snapshot: what the system is and how it's wired.
- **This file** is the prescriptive how-to: what to do and what to avoid when writing code.
- **Sprint specs** in [`docs/_specs/`](../_specs/) are the source of truth for in-flight scope.

If a rule here conflicts with the current sprint's spec, the spec wins for that sprint and we update this file in the same commit.
