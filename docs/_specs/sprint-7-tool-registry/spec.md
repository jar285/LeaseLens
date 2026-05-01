# Spec — Sprint 7: Tool Registry + Read-Only MCP Tools

**Sprint:** 7  
**Status:** Draft  
**Date:** 2026-04-29  
**Author:** Cascade  

---

## 1. Problem Statement

Sprints 1–6 delivered a streaming chat UI, SQLite persistence, Anthropic integration, RAG retrieval, and an eval harness. The assistant can answer grounded questions about the Side Quest Syndicate corpus, but it has **no tools** — it cannot take actions, look up specific documents on demand, or expose capabilities programmatically.

The charter (Section 5 items 3, 6, and 7) requires:
- **At least one custom MCP server** written by the author, exposing ContentOps capabilities over the Model Context Protocol.
- **RBAC-aware tool calls** — Creator, Editor, and Admin see different tool sets.
- **Tool-use integration** — the LLM can invoke tools during a conversation, and results flow back into the response.

Sprint 7 focuses on **read-only tools only**. No mutations, no audit log, no rollback — those are Sprint 8's scope. This sprint builds the foundation: a tool registry, Anthropic tool_use loop, RBAC filtering, and a custom MCP server.

---

## 2. Goals

1. **Tool Registry** — A `ToolRegistry` class that manages tool descriptors, filters by role, and dispatches execution with RBAC enforcement.
2. **Anthropic tool_use loop** — Upgrade the chat route to pass tools to the LLM, handle `tool_use` blocks, execute tools, and return `tool_result` blocks in a multi-turn loop.
3. **Three read-only tools** — `search_corpus`, `get_document_summary`, `list_documents` — covering the core corpus query surface.
4. **RBAC-scoped tool manifests** — Each role sees only the tools it's allowed to use. Creator sees `search_corpus`. Editor adds `get_document_summary`. Admin sees all tools including `list_documents`.
5. **Custom MCP server** — A standalone stdio-based MCP server (`mcp/contentops-server.ts`) that exposes the same tools over the Model Context Protocol, fulfilling Section 5 item 3.
6. **Tool card UI** — Display tool invocations inline in the chat as collapsible cards showing tool name, input, and result.

---

## 3. Non-Goals

- **Mutating tools** — No write operations (scheduling, approving, content creation). Deferred to Sprint 8.
- **Audit log or rollback** — Sprint 8.
- **Deferred/async tool execution** — All tools execute inline (synchronous from the LLM's perspective).
- **MCP client consumption** — We expose an MCP server; we don't consume external MCP servers.
- **Tool policy pipeline** — Ordo has a multi-layer policy system. We use simple role-array filtering — sufficient for 3 roles and 3 tools.

---

## 4. Architecture

### 4.1 Tool Registry (Borrowed from Ordo, Simplified)

**Source pattern:** `_references/ai_mcp_chat_ordo/src/core/tool-registry/`

Ordo's `ToolRegistry` has bundles, policy pipelines, deferred execution modes, and a result formatter. We borrow the **core shape** but drop everything we don't need yet:

```
ToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>   // JSON Schema for Anthropic
  roles: Role[] | 'ALL'
  execute: (input, context) => Promise<unknown>
}

ToolRegistry {
  register(descriptor): void
  getToolsForRole(role): AnthropicTool[]  // Anthropic SDK format
  execute(name, input, context): Promise<unknown>
  canExecute(name, role): boolean
  getDescriptor(name): ToolDescriptor | undefined
}

ToolExecutionContext {
  role: Role
  userId: string
  conversationId: string
}
```

**Key differences from Ordo:**
| Ordo | ContentOps Sprint 7 |
|------|---------------------|
| `ToolCommand` interface + separate command objects | `execute` function on the descriptor directly |
| `ToolBundleDescriptor`, `ToolPolicyPipeline` | Not needed — 3 tools, simple role array |
| `ToolResultFormatter` (role-aware result shaping) | Not needed — all results returned as-is |
| `ToolExecutionMode` (inline/deferred) | All inline |
| `ToolCategory` | Included but cosmetic for now |

### 4.2 Anthropic Tool-Use Loop

The current chat route calls `anthropic.messages.stream()` once with no tools. Sprint 7 upgrades this to a **tool-use loop**:

```
1. Build tool manifest for role → getToolsForRole(role)
2. Call Anthropic with tools + messages
3. If response contains tool_use blocks:
   a. For each tool_use block: execute tool via registry
   b. Append assistant message (with tool_use) + tool_result messages
   c. Go to step 2 (re-call Anthropic with updated messages)
4. If response is text-only: stream to client as before
```

**Max iterations:** 3 (prevent runaway tool loops).

**Streaming strategy:**
- **Tool-use iterations** (when `stop_reason === 'tool_use'`): Use **non-streaming** `messages.create()`. These round-trips are fast (the model is requesting tool execution, not generating long text). We need the full response to extract `tool_use` blocks before executing tools. After execution, emit `{ tool_use }` and `{ tool_result }` NDJSON events to the client.
- **Final text iteration** (when `stop_reason === 'end_turn'`): Use **streaming** `messages.stream()` to maintain the existing real-time typing UX. Text chunks emit as `{ chunk }` events as before.
- **Mixed response** (text + tool_use in the same response): Extract and stream any text content first, then execute tools and loop. This is rare but possible.

### 4.3 Tool Definitions

#### `search_corpus`
- **Roles:** ALL (Creator, Editor, Admin)
- **Input:** `{ query: string, max_results?: number }`
- **Behavior:** Calls `retrieve(query, db)` (existing Sprint 5 function), returns top chunks with content and metadata.
- **Rationale:** This is the RAG retrieval the assistant already uses implicitly — exposing it as a tool lets the LLM decide *when* to search rather than always searching.
- **Performance note:** `search_corpus` performs a fresh `retrieve()` call which loads all chunks and computes embeddings. If the same query was already used for implicit RAG grounding earlier in the same request, this is redundant work. Acceptable for a 5-document corpus; future optimization could cache retrieval results per request.

#### `get_document_summary`  
- **Roles:** Editor, Admin
- **Input:** `{ slug: string }`
- **Behavior:** Looks up a document by slug in the `documents` table, returns title, slug, chunk count, and first 500 chars of content.
- **Rationale:** Lets editors inspect specific corpus documents by name.

#### `list_documents`
- **Roles:** Admin
- **Input:** `{}` (no parameters)
- **Behavior:** Returns all documents from the `documents` table with title, slug, and chunk count.
- **Rationale:** Admin-only corpus inventory.

### 4.4 Custom MCP Server

**Requirement:** Charter Section 5 item 3 — "At least one custom MCP server written by the author."

We create a standalone MCP server at `mcp/contentops-server.ts` using the `@modelcontextprotocol/sdk` package. It:

1. Runs as a **stdio transport** server (standard MCP pattern).
2. Registers the same 3 tools from the registry.
3. Executes tools against the real SQLite database.
4. Can be consumed by any MCP client (Claude Desktop, Cursor, etc.).

**Architecture:**
```
mcp/contentops-server.ts  (entry point — stdio transport)
  └── imports from src/lib/tools/registry.ts (shared tool definitions)
  └── imports from src/lib/db (shared database)
```

The MCP server and the chat route share the **same tool implementations** — the registry is the single source of truth.

### 4.5 Tool Card UI

When the assistant invokes a tool, the chat UI renders an inline **tool card**:

```
┌─ 🔧 search_corpus ──────────────────┐
│ Input: { query: "brand voice" }      │
│ ▶ 3 results returned                 │
│   (click to expand full results)     │
└──────────────────────────────────────┘
```

This is a collapsible component that shows:
- Tool name and icon
- Summarized input
- Summarized result (expandable)

---

## 5. Domain Types

### 5.1 `src/lib/tools/domain.ts`

```typescript
import type { Role } from '@/lib/auth/types';

export type ToolCategory = 'corpus' | 'system';

export interface ToolDescriptor {
  /** Unique tool name — must match the Anthropic tool name exactly */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Which roles can execute this tool. 'ALL' = unrestricted. */
  roles: Role[] | 'ALL';
  /** Organizational category */
  category: ToolCategory;
  /** Execute the tool with validated input */
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

### 5.2 `src/lib/tools/registry.ts`

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

### 5.3 `src/lib/tools/errors.ts`

```typescript
export class UnknownToolError extends Error { ... }
export class ToolAccessDeniedError extends Error { ... }
```

---

## 6. Tool Implementations

### 6.1 `src/lib/tools/corpus-tools.ts`

Three tool descriptor factories:

```typescript
import type { Database } from 'better-sqlite3';

export function createSearchCorpusTool(db: Database): ToolDescriptor;
export function createGetDocumentSummaryTool(db: Database): ToolDescriptor;
export function createListDocumentsTool(db: Database): ToolDescriptor;
```

Each returns a `ToolDescriptor` with the appropriate role restrictions, schema, and `execute` function.

### 6.2 `src/lib/tools/create-registry.ts`

Factory that creates and populates a registry with all tools:

```typescript
export function createToolRegistry(db: Database): ToolRegistry;
```

---

## 7. Chat Route Upgrade

### 7.1 Tool-Use Loop (`src/app/api/chat/route.ts`)

The POST handler changes from a single `stream()` call to a loop:

```typescript
const registry = createToolRegistry(db);
const tools = registry.getToolsForRole(role);

let messages = contextMessages;
let iterations = 0;
const MAX_TOOL_ITERATIONS = 3;

while (iterations < MAX_TOOL_ITERATIONS) {
  const response = await anthropic.messages.create({
    model, system: systemPrompt, messages, max_tokens: 1024,
    tools: tools.length > 0 ? tools : undefined,
  });

  // Collect text and tool_use blocks
  // If tool_use blocks exist:
  //   - Execute each tool via registry
  //   - Emit tool_use/tool_result NDJSON events
  //   - Append to messages array
  //   - Continue loop
  // If text only:
  //   - Stream text chunks
  //   - Break
  iterations++;
}
```

**Important:** The first response that includes text AND tool_use is handled by executing tools first, then continuing. The final text-only response is streamed to the client.

### 7.2 NDJSON Event Types

Existing events:
- `{ conversationId: string }` — conversation ID
- `{ chunk: string }` — text chunk  
- `{ error: string }` — error message
- `{ quota: { remaining: number } }` — quota notice

New events:
- `{ tool_use: { id: string, name: string, input: Record<string, unknown> } }` — tool invocation
- `{ tool_result: { id: string, name: string, result: unknown, error?: string } }` — tool result

---

## 8. MCP Server

### 8.1 `mcp/contentops-server.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

The server:
1. Creates a `ToolRegistry` with the real DB.
2. For each registered tool, calls `server.registerTool(name, { description, inputSchema: { ...zodSchemas } }, handler)`. The handler returns `{ content: [{ type: "text", text: JSON.stringify(result) }] }` per the MCP protocol.
3. Connects via stdio transport.
4. Runs as: `npx tsx mcp/contentops-server.ts`

> **Note:** The `@modelcontextprotocol/sdk` requires `zod@3` as a peer dependency. Verify compatibility with the existing `zod` version in `package.json`, or install it if missing.

### 8.2 MCP Configuration

Add to `package.json`:
```json
{
  "scripts": {
    "mcp:server": "tsx mcp/contentops-server.ts"
  }
}
```

Example MCP client config (for Claude Desktop / Cursor):
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

## 9. UI Changes

### 9.1 `src/components/chat/ToolCard.tsx`

A new component for rendering tool invocations:

```tsx
interface ToolCardProps {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  isExpanded?: boolean;
}
```

- Collapsible card with tool name header
- Shows input as formatted JSON
- Shows result summary (expandable to full JSON)
- Error state with red styling

### 9.2 Chat Stream & Message Updates

Three existing files must be updated to support tool events:

1. **`src/lib/chat/parse-stream-line.ts`** — Add `tool_use` and `tool_result` variants to the `StreamLineMessage` union type.
2. **`src/components/chat/ChatUI.tsx`** — Handle the new NDJSON event types in the stream reader loop (lines 88–111). When a `tool_use` event arrives, append a tool-invocation placeholder to the message list. When `tool_result` arrives, update it with the result.
3. **`src/components/chat/ChatMessage.tsx`** — Extend `ChatMessageProps` with an optional `toolInvocations` array. When present, render `ToolCard` components inline instead of markdown content.

---

## 10. File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tools/domain.ts` | Create | Core types: ToolDescriptor, ToolExecutionContext, AnthropicTool |
| `src/lib/tools/errors.ts` | Create | UnknownToolError, ToolAccessDeniedError |
| `src/lib/tools/registry.ts` | Create | ToolRegistry class |
| `src/lib/tools/registry.test.ts` | Create | Registry unit tests (register, RBAC filter, execute, errors) |
| `src/lib/tools/corpus-tools.ts` | Create | search_corpus, get_document_summary, list_documents descriptors |
| `src/lib/tools/corpus-tools.test.ts` | Create | Tool execution tests against seeded DB |
| `src/lib/tools/create-registry.ts` | Create | Factory: createToolRegistry(db) |
| `src/app/api/chat/route.ts` | Modify | Add tool-use loop, emit tool events |
| `src/components/chat/ToolCard.tsx` | Create | Inline tool card component |
| `src/lib/chat/parse-stream-line.ts` | Modify | Add `tool_use` and `tool_result` to `StreamLineMessage` union |
| `src/components/chat/ChatUI.tsx` | Modify | Handle `tool_use`/`tool_result` NDJSON events in stream reader |
| `src/components/chat/ChatMessage.tsx` | Modify | Extend props to render `ToolCard` inline for tool messages |
| `mcp/contentops-server.ts` | Create | Custom MCP server (stdio transport) |
| `package.json` | Modify | Add `mcp:server` script, `@modelcontextprotocol/sdk` + `zod@3` dependencies |
| `src/lib/db/schema.ts` | Modify | Add `'tool'` to messages table role CHECK constraint |
| `mcp/contentops-server.test.ts` | Create | MCP contract tests (tool parity + execution) |
| `tsconfig.json` | Modify | Add `mcp/**/*.ts` to include |

---

## 11. Testing Strategy

### 11.1 Unit Tests — `registry.test.ts` (~6 tests)

1. **Register and retrieve** — register a tool, verify `getDescriptor` returns it.
2. **Duplicate registration throws** — registering same name twice throws.
3. **RBAC filtering — Creator** — only sees tools with 'ALL' or including 'Creator'.
4. **RBAC filtering — Admin** — sees all tools.
5. **Execute with wrong role throws** — `ToolAccessDeniedError`.
6. **Execute unknown tool throws** — `UnknownToolError`.

### 11.2 Integration Tests — `corpus-tools.test.ts` (~4 tests)

1. **search_corpus returns results** — query against seeded DB returns non-empty results.
2. **get_document_summary returns document** — valid slug returns title and content preview.
3. **get_document_summary with bad slug** — returns not-found indicator.
4. **list_documents returns all docs** — returns 5 documents from seeded corpus.

### 11.3 Chat Route Tests — existing test file updated (~2 tests)

1. **Tool events in NDJSON stream** — mock Anthropic response with tool_use, verify tool_use and tool_result events emitted.
2. **RBAC restricts tools in manifest** — Creator role request doesn't include admin-only tools.

### 11.4 MCP Contract Tests — `mcp/contentops-server.test.ts` (~2 tests)

1. **MCP tool parity** — verify the MCP server exposes the same tool names as the registry.
2. **MCP tool execution** — call a tool via the MCP server and verify the result matches a direct registry call (similar to Ordo's `calculator-mcp-contract.test.ts` pattern).

**Expected test count:** ~14 new tests, bringing total to ~100.

---

## 12. Acceptance Criteria

- [ ] `src/lib/tools/registry.ts` — `ToolRegistry` class with register, getToolsForRole, execute, canExecute.
- [ ] `src/lib/tools/corpus-tools.ts` — 3 tool descriptors (search_corpus, get_document_summary, list_documents).
- [ ] `src/app/api/chat/route.ts` — tool-use loop with max 3 iterations, NDJSON tool events.
- [ ] `src/components/chat/ToolCard.tsx` — inline collapsible tool card in chat UI.
- [ ] `mcp/contentops-server.ts` — custom MCP server exposing 3 tools over stdio.
- [ ] RBAC enforced: Creator sees 1 tool, Editor sees 2, Admin sees 3.
- [ ] `npm run typecheck` — 0 errors.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run test` — ≥ 100 passing.
- [ ] `npm run eval:golden` — still 5/5 passing (no regression).
- [ ] `npm run mcp:server` — starts without error, responds to MCP list_tools.
- [ ] Chat UI shows tool cards when assistant uses tools.

---

## 13. Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should `search_corpus` replace the implicit RAG retrieval in the chat route? | **No** — keep implicit RAG for grounding context. The tool gives the LLM an *additional* explicit search it can invoke if the user asks to "search for X" or "find documents about Y". Both coexist. |
| 2 | Should tool results be persisted in the messages table? | **Yes** — tool_use and tool_result are stored as separate messages with role `assistant` (tool_use) and `tool` (tool_result) so history replay works correctly. **⚠ Requires schema migration:** the current messages table has `CHECK(role IN ('user', 'assistant'))` — must add `'tool'` to the constraint. See Section 10 for the migration file. |
| 3 | Should the MCP server use the same DB file? | **Yes** — it imports from `@/lib/db` and uses `data/contentops.db`. |
| 4 | How many tools per sprint? | 3 read-only tools for Sprint 7. Mutating tools (schedule, approve, etc.) are Sprint 8. |
| 5 | Should we use `@modelcontextprotocol/sdk` or build from scratch? | **Use the SDK** — it's the official package and handles protocol framing. Building from scratch adds no portfolio value. |

---

## 14. Reference Alignment

| Borrowed Pattern | Source | Adaptation |
|---|---|---|
| `ToolDescriptor` with name, schema, roles, command | `_references/.../ToolDescriptor.ts` | Simplified: merged `command.execute` into descriptor directly, dropped execution modes and deferred config. |
| `ToolRegistry` with register, getSchemasForRole, execute | `_references/.../ToolRegistry.ts` | Simplified: dropped bundles, policy pipeline, result formatter. |
| `ToolExecutionContext` with role, userId | `_references/.../ToolExecutionContext.ts` | Simplified: dropped execution principal, abort signal, progress reporting, page snapshot. |
| `UnknownToolError`, `ToolAccessDeniedError` | `_references/.../errors.ts` | Direct adoption. |
| `CorpusTools` (SearchCorpusCommand, GetSectionCommand) | `_references/.../CorpusTools.ts` | Simplified: uses existing `retrieve()` instead of separate SearchHandler. No prefetch, no canonical path resolution. |
| MCP stdio server pattern | `_references/.../mcp-stdio-adapter.ts` | Simplified: standalone server file, not adapter pattern. Uses `@modelcontextprotocol/sdk` directly. |
| `ToolCard.tsx` for rendering tool invocations | `_references/.../ToolCard.tsx` | Inspired by Ordo's concept, but implemented as a simpler collapsible JSON viewer using Tailwind. Omits Radix UI Dialog, download/expand-to-fullscreen, and thumbnail modes. |

---

## 15. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Anthropic tool_use loop adds latency | Medium — extra API round-trips | Max 3 iterations. Most queries won't trigger tools. |
| MCP SDK compatibility with current Node version | Low | SDK supports Node 18+. We're on Node 20+. |
| Tool results too large for context window | Medium | Truncate search results to top-5. Limit document summary to 500 chars. |
| Breaking existing chat behavior | High | Existing RAG grounding remains. Tools are additive. Thorough regression testing. |

---

## 16. Commit Strategy

```
feat(s7): tool registry, Anthropic tool-use loop, and custom MCP server

- Add ToolRegistry with RBAC-filtered tool manifests
- Add 3 read-only corpus tools: search_corpus, get_document_summary, list_documents
- Upgrade chat route with tool-use loop (max 3 iterations)
- Add ToolCard component for inline tool rendering
- Add custom MCP server (mcp/contentops-server.ts) over stdio
- ~14 new tests (registry + corpus tools + chat route + MCP contract)
```
