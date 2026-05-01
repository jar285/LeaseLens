# Sprint Plan — Sprint 7: Tool Registry + Read-Only MCP Tools

**Sprint:** 7  
**Status:** Complete  
**Date:** 2026-04-30  

---

## Prerequisites

Before any implementation step:
1. Confirm Sprint 6 is fully committed (`git log --oneline -1` should show the Sprint 6 commit).
2. Run `npm run test` — must show 86 passing.
3. Run `npm run eval:golden` — must show 5/5 cases passing.
4. Verify `.env.local` exists and contains `CONTENTOPS_DB_PATH` and `ANTHROPIC_API_KEY`.

---

## Task List

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Implement domain types | `src/lib/tools/domain.ts` | Create |
| 2 | Implement error types | `src/lib/tools/errors.ts` | Create |
| 3 | Implement `ToolRegistry` class | `src/lib/tools/registry.ts` | Create |
| 4 | Implement registry unit tests | `src/lib/tools/registry.test.ts` | Create |
| 5 | Implement corpus tool descriptors | `src/lib/tools/corpus-tools.ts` | Create |
| 6 | Implement corpus tool integration tests | `src/lib/tools/corpus-tools.test.ts` | Create |
| 7 | Implement registry factory | `src/lib/tools/create-registry.ts` | Create |
| 8 | Upgrade chat route with tool-use loop | `src/app/api/chat/route.ts` | Modify |
| 9 | Implement `ToolCard.tsx` component | `src/components/chat/ToolCard.tsx` | Create |
| 10 | Extend stream line parser | `src/lib/chat/parse-stream-line.ts` | Modify |
| 11 | Handle tool events in `ChatUI.tsx` | `src/components/chat/ChatUI.tsx` | Modify |
| 12 | Extend `ChatMessage.tsx` for tool rendering | `src/components/chat/ChatMessage.tsx` | Modify |
| 13 | Implement MCP server | `mcp/contentops-server.ts` | Create |
| 14 | Implement MCP contract tests | `mcp/contentops-server.test.ts` | Create |
| 15 | Migrate messages table schema | `src/lib/db/schema.ts` | Modify |
| 16 | Update `package.json` and `tsconfig.json` | `package.json`, `tsconfig.json` | Modify |
| 17 | Final verification: typecheck, lint, test, eval:golden | — | Verify |

---

## Task 1 — `src/lib/tools/domain.ts`

**Goal:** Core types for the tool registry. Zero runtime logic, pure type definitions.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolDescriptor.ts` and `ToolExecutionContext.ts` — simplified for ContentOps (no execution modes, no policy pipeline, no progress reporting).

```typescript
import type { Role } from '@/lib/auth/types';

export type ToolCategory = 'corpus' | 'system';

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  roles: Role[] | 'ALL';
  category: ToolCategory;
  execute: (input: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>;
}

export interface ToolExecutionContext {
  role: Role;
  userId: string;
  conversationId: string;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
```

---

## Task 2 — `src/lib/tools/errors.ts`

**Goal:** Typed errors for tool registry failures.

```typescript
export class UnknownToolError extends Error { ... }
export class ToolAccessDeniedError extends Error { ... }
```

Direct adoption from `docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/errors.ts`.

---

## Task 3 — `src/lib/tools/registry.ts`

**Goal:** `ToolRegistry` class — registers tools, filters by role, dispatches execution with RBAC enforcement.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolRegistry.ts` — dropped bundles, policy pipeline, and result formatter.

```typescript
export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();

  register(descriptor: ToolDescriptor): void;
  getToolsForRole(role: Role): AnthropicTool[];
  execute(name: string, input: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
  canExecute(name: string, role: Role): boolean;
  getDescriptor(name: string): ToolDescriptor | undefined;
  getToolNames(): string[];
}
```

**Key differences from Ordo:**

| Ordo | ContentOps Sprint 7 |
|------|---------------------|
| `ToolCommand` + separate command objects | `execute` function on the descriptor directly |
| `ToolBundleDescriptor`, `ToolPolicyPipeline` | Not needed — 3 tools, simple role array |
| `ToolResultFormatter` | Not needed — results returned as-is |
| `ToolExecutionMode` (inline/deferred) | All inline |

---

## Task 4 — `src/lib/tools/registry.test.ts`

**Goal:** 6 unit tests for the `ToolRegistry` class.

| # | Test | Assertion |
|---|------|-----------|
| 1 | Register and retrieve | `getDescriptor` returns registered tool |
| 2 | Duplicate registration throws | Second `register` with same name throws |
| 3 | RBAC filtering — Creator | Only sees `ALL` or Creator-scoped tools |
| 4 | RBAC filtering — Admin | Sees all tools |
| 5 | Execute with wrong role | Throws `ToolAccessDeniedError` |
| 6 | Execute unknown tool | Throws `UnknownToolError` |

---

## Task 5 — `src/lib/tools/corpus-tools.ts`

**Goal:** Three read-only tool descriptor factories targeting the SQLite corpus.

```typescript
import type { Database } from 'better-sqlite3';

export function createSearchCorpusTool(db: Database): ToolDescriptor;
export function createGetDocumentSummaryTool(db: Database): ToolDescriptor;
export function createListDocumentsTool(db: Database): ToolDescriptor;
```

**Tool definitions:**

| Tool | Roles | Input | Behavior |
|------|-------|-------|----------|
| `search_corpus` | ALL | `{ query, max_results? }` | Calls `retrieve(query, db)`, returns top chunks |
| `get_document_summary` | Editor, Admin | `{ slug }` | Looks up document by slug, returns title + first 500 chars |
| `list_documents` | Admin | `{}` | Returns all documents with title, slug, chunk count |

**Implementation note:** `search_corpus` performs a fresh `retrieve()` call. If the same query was already used for implicit RAG grounding earlier in the same request, this is redundant but acceptable for our 5-document corpus.

---

## Task 6 — `src/lib/tools/corpus-tools.test.ts`

**Goal:** 4 integration tests against the seeded SQLite database.

| # | Test | Assertion |
|---|------|-----------|
| 1 | `search_corpus` returns results | Non-empty results from corpus query |
| 2 | `get_document_summary` — valid slug | Returns title and content preview |
| 3 | `get_document_summary` — bad slug | Returns not-found indicator |
| 4 | `list_documents` returns all docs | Returns 5 documents from seeded corpus |

---

## Task 7 — `src/lib/tools/create-registry.ts`

**Goal:** Factory that wires the real DB into a fully configured `ToolRegistry`.

```typescript
import type { Database } from 'better-sqlite3';
import { ToolRegistry } from './registry';

export function createToolRegistry(db: Database): ToolRegistry;
```

Registers all 3 corpus tools. Consumed by both the chat route and the MCP server — single source of truth.

---

## Task 8 — Upgrade `src/app/api/chat/route.ts`

**Goal:** Anthropic tool-use loop with max 3 iterations.

**Loop:**
```
1. Build tool manifest for role → getToolsForRole(role)
2. Call Anthropic (non-streaming) with tools + messages
3. If stop_reason === 'tool_use':
   a. Execute each tool_use block via registry
   b. Emit { tool_use } and { tool_result } NDJSON events
   c. Append tool messages; go to step 2
4. If stop_reason === 'end_turn': stream final text via messages.stream()
```

**Streaming strategy:**
- **Tool-use iterations:** Non-streaming `messages.create()` — fast, we need the full response to extract `tool_use` blocks.
- **Final text iteration:** Streaming `messages.stream()` — maintains the existing real-time typing UX.

**Max iterations:** 3 (prevents runaway loops).

**NDJSON events added:**
- `{ tool_use: { id, name, input } }` — tool invocation
- `{ tool_result: { id, name, result, error? } }` — tool result

---

## Task 9 — `src/components/chat/ToolCard.tsx`

**Goal:** Inline collapsible card for tool invocations in the chat UI.

```tsx
interface ToolCardProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  isExpanded?: boolean;
}
```

- Collapsible card with tool name header and icon
- Formatted JSON input
- Summarized result (expandable to full JSON)
- Error state with red styling

Inspired by Ordo's `ToolCard` concept, but implemented as a simpler collapsible JSON viewer without Radix UI Dialog, download, or thumbnail features.

---

## Task 10 — Extend `src/lib/chat/parse-stream-line.ts`

**Goal:** Add `tool_use` and `tool_result` variants to the `StreamLineMessage` union type.

```typescript
| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
| { type: 'tool_result'; id: string; name: string; result: unknown; error?: string }
```

---

## Task 11 — Update `src/components/chat/ChatUI.tsx`

**Goal:** Handle the new NDJSON event types in the stream reader loop.

- When a `tool_use` event arrives: append a tool-invocation placeholder to the message list.
- When `tool_result` arrives: update the placeholder with the result.

---

## Task 12 — Extend `src/components/chat/ChatMessage.tsx`

**Goal:** Render `ToolCard` components inline when a message contains tool invocations.

- Extend `ChatMessageProps` with optional `toolInvocations` array.
- When present, render `ToolCard` components inline instead of markdown content.

---

## Task 13 — `mcp/contentops-server.ts`

**Goal:** Custom MCP server over stdio transport. Fulfills charter Section 5 item 3.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

1. Creates a `ToolRegistry` with the real DB.
2. For each registered tool, calls `server.registerTool(name, { description, inputSchema: { ...zodSchemas } }, handler)`.
3. Handler returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.
4. Connects via stdio transport.
5. Runs as: `npm run mcp:server` (`tsx mcp/contentops-server.ts`).

The MCP server and the chat route share the same tool implementations via the registry — the registry is the single source of truth.

**Example MCP client config (Claude Desktop / Cursor):**
```json
{
  "mcpServers": {
    "contentops": {
      "command": "npx",
      "args": ["tsx", "mcp/contentops-server.ts"],
      "cwd": "/path/to/ContentOp"
    }
  }
}
```

---

## Task 14 — `mcp/contentops-server.test.ts`

**Goal:** 2 MCP contract tests verifying server-registry parity.

| # | Test | Assertion |
|---|------|-----------|
| 1 | MCP tool parity | MCP server exposes the same tool names as the registry |
| 2 | MCP tool execution | Calling a tool via MCP server produces the same result as a direct registry call |

Pattern adapted from `docs/_references/ai_mcp_chat_ordo` MCP contract tests.

---

## Task 15 — Migrate `src/lib/db/schema.ts`

**Goal:** Add `'tool'` to the messages table role CHECK constraint to support tool_result persistence.

**Before:**
```sql
role TEXT NOT NULL CHECK(role IN ('user', 'assistant'))
```

**After:**
```sql
role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool'))
```

Tool_use messages are stored with role `assistant`. Tool_result messages are stored with role `tool`. This enables correct history replay.

---

## Task 16 — Update `package.json` and `tsconfig.json`

**`package.json`:**
- Add `@modelcontextprotocol/sdk` dependency.
- Verify `zod@3` is present (required as MCP SDK peer dependency).
- Add `"mcp:server": "tsx mcp/contentops-server.ts"` script.

**`tsconfig.json`:**
- Add `mcp/**/*.ts` to `include` array.

---

## Task 17 — Final Verification

Run in sequence:

```bash
npm run typecheck
npm run lint
npm run test
npm run eval:golden
```

**Expected:**
- typecheck: 0 errors
- lint: 0 errors, 0 fixes applied
- test: **≥ 100 tests passing** (86 existing + ~14 new: 6 registry + 4 corpus tools + 2 chat route + 2 MCP contract)
- eval:golden: exits 0, 5/5 cases passing (no regression)

**Verify MCP server starts:**
```bash
npm run mcp:server
```
Should start without error and respond to MCP `list_tools`.

---

## Completion Checklist

- [x] `src/lib/tools/domain.ts` created — `ToolDescriptor`, `ToolExecutionContext`, `AnthropicTool` exported
- [x] `src/lib/tools/errors.ts` created — `UnknownToolError`, `ToolAccessDeniedError` exported
- [x] `src/lib/tools/registry.ts` created — `ToolRegistry` class with register, getToolsForRole, execute, canExecute
- [x] `src/lib/tools/registry.test.ts` created — 6 unit tests passing
- [x] `src/lib/tools/corpus-tools.ts` created — `createSearchCorpusTool`, `createGetDocumentSummaryTool`, `createListDocumentsTool` exported
- [x] `src/lib/tools/corpus-tools.test.ts` created — 4 integration tests passing
- [x] `src/lib/tools/create-registry.ts` created — `createToolRegistry(db)` factory exported
- [x] `src/app/api/chat/route.ts` modified — tool-use loop with max 3 iterations, NDJSON tool events
- [x] `src/components/chat/ToolCard.tsx` created — collapsible inline tool card
- [x] `src/lib/chat/parse-stream-line.ts` modified — `tool_use` and `tool_result` variants added
- [x] `src/components/chat/ChatUI.tsx` modified — handles tool NDJSON events
- [x] `src/components/chat/ChatMessage.tsx` modified — renders `ToolCard` inline
- [x] `mcp/contentops-server.ts` created — custom MCP server over stdio
- [x] `mcp/contentops-server.test.ts` created — 2 MCP contract tests passing
- [x] `src/lib/db/schema.ts` modified — messages role constraint includes `'tool'`
- [x] `package.json` updated — `mcp:server` script, `@modelcontextprotocol/sdk` added
- [x] `tsconfig.json` updated — `mcp/**/*.ts` added to include
- [x] `npm run typecheck` — 0 errors
- [x] `npm run lint` — 0 errors
- [x] `npm run test` — 106 passing (86 existing + 20 new)
- [x] `npm run eval:golden` — exits 0, 5/5 passed (no regression)
- [x] `npm run mcp:server` — starts without error

---

## Outcomes

- **106 tests passing** (up from 86 at Sprint 6 completion)
- **RBAC enforced:** Creator sees 1 tool, Editor sees 2, Admin sees 3
- **Architectural invariant upheld:** prompt-visible tool schemas and runtime-executable tools come from the same `ToolRegistry`, filtered by the same RBAC
- **Charter Section 5 item 3 satisfied:** custom MCP server at `mcp/contentops-server.ts` exposing ContentOps tools over stdio

---

## Known Follow-Up: Test Architecture Consolidation

Sprint 7 implementation revealed that test infrastructure patterns (in-memory DB setup, mock embedder patterns, seeded fixture patterns) are replicated across multiple test files without a shared abstraction layer. This is not a Sprint 7 defect — all 106 tests pass and are load-bearing — but it is technical debt that will compound as Sprint 8 adds mutating tools with more complex fixture needs.

**Sprint 8 candidate scope:**
- Dedicated test folder structure (`src/lib/__tests__/` or `tests/`)
- Shared test helper consolidation (single `createTestDb()`, single mock embedder fixture)
- E2E test setup for the chat route tool-use loop
- Architecture audit against Ordo's test patterns

Do not implement Sprint 8 test architecture changes in Sprint 7. Document only.

---

## Commit Strategy

```
feat(s7): tool registry, Anthropic tool-use loop, and custom MCP server

- Add ToolRegistry with RBAC-filtered tool manifests
- Add 3 read-only corpus tools: search_corpus, get_document_summary, list_documents
- Upgrade chat route with tool-use loop (max 3 iterations)
- Add ToolCard component for inline tool rendering
- Add custom MCP server (mcp/contentops-server.ts) over stdio
- Migrate messages table schema: add 'tool' role
- 106 tests passing (86 existing + 20 new)
- eval:golden: 5/5 cases passing (no regression)
```
