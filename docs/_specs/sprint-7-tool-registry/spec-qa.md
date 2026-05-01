# QA Report — Sprint 7 Spec: Tool Registry + Read-Only MCP Tools

**Date:** 2026-04-29 (reviewed), 2026-04-30 (all fixes applied)  
**Reviewer:** Cascade  
**Artifact:** `docs/_specs/sprint-7-tool-registry/spec.md`  
**Status:** ✅ All issues resolved

---

## Summary

The spec is **well-structured and comprehensive**. It correctly borrows and simplifies Ordo's `ToolRegistry` pattern, proposes a clean Anthropic tool-use loop, defines sensible RBAC boundaries, and satisfies the charter's MCP server requirement. QA identified **8 issues** (2 high, 4 medium, 2 low). **All 8 issues have been resolved** — fixes applied directly to `spec.md` on 2026-04-30.

---

## Issues

### 🔴 HIGH — Must Fix

#### H1. `ChatMessages.tsx` does not exist — wrong file reference

**Spec Section:** 10 (File Inventory), 9.2  
**Problem:** The spec lists `src/components/chat/ChatMessages.tsx` as a file to modify, but this file does not exist. The actual chat message rendering chain is:

- `ChatUI.tsx` → handles NDJSON stream parsing
- `ChatTranscript.tsx` → renders the message list
- `ChatMessage.tsx` → renders individual messages

Stream event parsing happens in `ChatUI.tsx` (lines 88–111), which calls `parseStreamLine()`. The `tool_use` and `tool_result` events need to be handled there, and `ChatMessage.tsx` or `ChatTranscript.tsx` need to render `ToolCard` components.

**Fix:** Replace `ChatMessages.tsx` with the correct files:
- **Modify** `src/lib/chat/parse-stream-line.ts` — add `tool_use` and `tool_result` to `StreamLineMessage` union
- **Modify** `src/components/chat/ChatUI.tsx` — handle new event types in the stream reader
- **Modify** `src/components/chat/ChatMessage.tsx` — extend `ChatMessageProps` to optionally include tool invocations, or render `ToolCard` inline

**✅ RESOLVED** — File inventory (Section 10) and Section 9.2 updated with correct file references.

---

#### H2. Messages table role constraint blocks tool_result persistence

**Spec Section:** 13 (Open Questions, Q2)  
**Problem:** The spec states tool_use and tool_result will be persisted as separate messages with roles `assistant` and `tool`. However, the current `messages` table has a CHECK constraint:

```sql
role TEXT NOT NULL CHECK(role IN ('user', 'assistant'))
```

Inserting a message with `role = 'tool'` will throw a SQLite constraint violation.

**Fix:** Either:
- **(A) Schema migration** — Add `'tool'` to the CHECK constraint. This requires a migration step (Sprint 7 should include a schema version bump).
- **(B) Store as JSON** — Persist the entire tool exchange as a single `assistant` message with structured JSON content (e.g., `{ type: 'tool_exchange', tool_use: [...], tool_result: [...] }`).
- **Recommended: (A)** — cleaner, aligns with Anthropic's message roles, and is needed anyway for history replay.

**✅ RESOLVED** — Open Question #2 updated with migration warning. `src/lib/db/schema.ts` added to file inventory.

---

### 🟡 MEDIUM — Should Fix

#### M1. MCP SDK uses `server.registerTool()` with Zod schemas, not `server.tool()`

**Spec Section:** 8.1  
**Problem:** The spec says the MCP server "calls `server.tool(name, schema, handler)`" but the current `@modelcontextprotocol/sdk` TypeScript API uses:

```typescript
server.registerTool(name, { description, inputSchema: { ...zodSchemas } }, handler)
```

The handler must return `{ content: [{ type: "text", text: string }] }`.

**Fix:** Update spec Section 8.1 to use the correct API:
```typescript
server.registerTool("search_corpus", {
  description: "Search the corpus...",
  inputSchema: { query: z.string(), max_results: z.number().optional() },
}, async ({ query, max_results }) => {
  // execute and return { content: [{ type: "text", text: JSON.stringify(result) }] }
});
```

Also note: the MCP SDK requires `zod@3` as a peer dependency — add this to the package.json modifications.

**✅ RESOLVED** — Section 8.1 updated with correct `server.registerTool()` API and zod@3 note.

---

#### M2. Streaming behavior under tool-use loop is underspecified

**Spec Section:** 4.2, 7.1  
**Problem:** The spec shows `anthropic.messages.create()` (non-streaming) in the loop pseudocode, but the current route uses `anthropic.messages.stream()`. When tools are involved, the Anthropic API returns a response with `stop_reason: "tool_use"` — the model **stops generating text** to request tool execution. The spec needs to clarify:

1. **Intermediate iterations** (tool-use rounds) should use **non-streaming** `messages.create()` since we need the full response to extract tool_use blocks.
2. **Final iteration** (text-only response) should use **streaming** `messages.stream()` to maintain the existing streaming UX.
3. Alternatively, all iterations can use streaming, but the tool_use blocks must be accumulated from the stream before execution.

**Fix:** Explicitly state the streaming strategy in Section 7.1. Recommended approach: use non-streaming `create()` for tool-use iterations (they're fast — tool responses are short), switch to `stream()` for the final text response, or stream all iterations and accumulate tool_use blocks from the stream events.

**✅ RESOLVED** — Section 4.2 now specifies the non-streaming/streaming hybrid strategy.

---

#### M3. `search_corpus` tool calls `retrieve()` which loads ALL chunks into memory

**Spec Section:** 4.3  
**Problem:** The existing `retrieve()` function (Sprint 5) loads every chunk from the DB, computes embeddings, and runs BM25 scoring. This is fine for implicit RAG at the start of a request, but if the LLM invokes `search_corpus` during a tool-use loop, it will run a second full retrieval. For our 5-doc corpus this is acceptable, but the spec should acknowledge this cost and consider whether `search_corpus` should share the already-computed RAG context from the same request.

**Fix:** Add a note in the risk assessment or implementation notes: "For Sprint 7, `search_corpus` performs a fresh retrieval call. If the same query was already used for implicit RAG grounding, this is redundant but acceptable for a small corpus. Future optimization: cache retrieval results per request."

**✅ RESOLVED** — Performance note added to `search_corpus` definition in Section 4.3.

---

#### M4. Test count estimate is wrong

**Spec Section:** 11, 12  
**Problem:** The spec says "~12 new tests, bringing total to ~98." Current test count is 86. 86 + 12 = 98, which checks out numerically. However, the spec breaks down tests as:
- Registry tests: ~6
- Corpus tools tests: ~4  
- Chat route tests: ~2
- **Total: 12**

This is correct, but the acceptance criterion says "≥ 98 passing." This is fine as written, but the MCP server is not tested. Consider adding at least 1 MCP contract test (similar to Ordo's `calculator-mcp-contract.test.ts`) to verify tool parity between the registry and MCP server.

**Fix:** Add an MCP contract test to the testing strategy (~1-2 tests), bump expected total to ~100.

**✅ RESOLVED** — Section 11.4 added with 2 MCP contract tests. Test target bumped to ≥100. Test file added to file inventory.

---

### 🟢 LOW — Nice to Fix

#### L1. `ToolCard.tsx` references Ordo's `ToolCard.tsx` but they serve different purposes

**Spec Section:** 14 (Reference Alignment)  
**Problem:** The spec claims it borrows from `_references/.../ToolCard.tsx`. However, Ordo's `ToolCard` is a general-purpose expandable card component using Radix UI Dialog for full-screen expansion, media thumbnails, and download buttons. ContentOps's `ToolCard` is a simple collapsible JSON viewer for tool invocations. The reference alignment table overstates the borrowing.

**Fix:** Change the reference alignment entry to: "Inspired by Ordo's ToolCard concept, but implemented as a simpler collapsible JSON viewer without Radix UI Dialog, download, or thumbnail features."

**✅ RESOLVED** — Reference alignment table updated in Section 14.

---

#### L2. `zod` is already a dependency but version should be verified

**Spec Section:** 8  
**Problem:** The MCP SDK requires `zod@3` as a peer dependency. The spec mentions adding `@modelcontextprotocol/sdk` but doesn't mention checking `zod` compatibility.

**Fix:** Verify `zod` version in `package.json` during implementation. If already `zod@3`, no action needed. If missing or incompatible, add it.

**✅ RESOLVED** — Section 8.1 includes zod@3 note. File inventory updated to include zod@3 in package.json modifications.

---

## Verification Checks

| Check | Result |
|-------|--------|
| Charter alignment (Section 5 items 3, 6, 7) | ✅ MCP server, RBAC tools, tool-use integration all addressed |
| Ordo pattern borrowing is accurate | ✅ ToolDescriptor, ToolRegistry, ToolExecutionContext, errors correctly simplified |
| Anthropic SDK `Tool` interface matches `AnthropicTool` | ✅ Both use `name`, `description`, `input_schema` |
| DB schema supports tool operations | ✅ Fixed — migration documented (H2) |
| File references are accurate | ✅ Fixed — correct files listed (H1) |
| MCP SDK API is correct | ✅ Fixed — uses `registerTool()` (M1) |
| Current test count baseline | ✅ 86 tests confirmed |
| Non-goals are sensible | ✅ Correctly defers mutations, audit log, rollback to Sprint 8 |

---

## Recommendations

~~1. **Fix H1 and H2 before implementation** — these will cause build failures or runtime errors.~~  
~~2. **Clarify M2 (streaming strategy)** — this is the most complex part of the chat route upgrade and needs a clear decision.~~  
~~3. **Add MCP contract test (M4)** — this is a differentiator for the portfolio and proves the MCP server actually works.~~  
4. **The overall architecture is sound** — the simplified Ordo patterns are appropriate for ContentOps's scale.

> **All recommendations addressed.** The spec is ready for implementation.
