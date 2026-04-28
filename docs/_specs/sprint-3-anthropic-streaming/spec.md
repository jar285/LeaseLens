# Sprint 3 Spec — Anthropic Streaming Chat + Demo Cost Guardrails

## Problem Statement

`/api/chat/route.ts` uses `mockStreamGenerator`. Every real response is fabricated. Sprint 3 replaces the mock with the Anthropic SDK, passes real conversation history as context, and implements all charter §11b demo cost guardrails. No public URL may be shared without these guardrails in place.

## Invariants

1. **Charter §4:** No tool registry exists yet. Prompt-visible tool schemas and runtime-executable tools cannot drift because neither exists in Sprint 3. This invariant is trivially satisfied and must be maintained going into Sprint 4.
2. **Session required:** `/api/chat` remains protected by the Sprint 2 session cookie. The `userId` extracted from the cookie is the identity used for rate limiting.
3. **Streaming protocol unchanged:** The existing NDJSON line format (`{ conversationId }`, `{ chunk }`, `{ error }`) is preserved. Sprint 3 adds one optional new line type: `{ quota: { remaining: number } }`.
4. **All state in SQLite:** Rate limit counters and spend totals live in SQLite via `better-sqlite3`. No in-memory-only state for guardrails (they must survive server restarts).
5. **Idempotent schema:** All new table definitions use `CREATE TABLE IF NOT EXISTS`. Existing databases are upgraded on next server start without a separate migration step.
6. **No real API calls in tests:** Tests mock `@anthropic-ai/sdk` at the module level via Vitest. `ANTHROPIC_API_KEY` is not required in `.env.test`.

## Prerequisite Fix

`src/lib/db/index.ts` opens the DB with `readonly: env.CONTENTOPS_DEMO_MODE` and gates both `db.pragma('journal_mode = WAL')` and `db.exec(SCHEMA)` behind `!env.CONTENTOPS_DEMO_MODE`. This prevents writes to the new guardrail tables and leaves them uncreated in demo mode.

This sprint makes three changes to `src/lib/db/index.ts`:
1. Remove `readonly: env.CONTENTOPS_DEMO_MODE` from the `new Database(...)` call.
2. Run `db.pragma('journal_mode = WAL')` unconditionally (WAL mode is needed for concurrent reads/writes in demo mode too).
3. Run `db.exec(SCHEMA)` unconditionally (guardrail tables must be created in demo mode).

The `mkdirSync` guard (`!env.CONTENTOPS_DEMO_MODE`) is left in place — the DB directory is assumed to exist in demo mode (pre-seeded file). Write-protection of corpus data is enforced at the API layer, not the SQLite driver level.

## Architecture

### 1. New Dependency

`@anthropic-ai/sdk` — added to `dependencies` in `package.json`. Target version: `^0.90.0` (current latest as of Sprint 3; confirmed against official SDK documentation). Ordo reference uses `^0.78.0` — ContentOps pins to the newer release.

### 2. Anthropic Client Singleton

**File:** `src/lib/anthropic/client.ts`

Exports `getAnthropicClient(): Anthropic`. Reads `env.ANTHROPIC_API_KEY`. Throws a descriptive error at call time (not import time) if the key is absent. Module-level initialization is avoided so test environments can mock the module without a valid key.

`env.ts`: `ANTHROPIC_API_KEY` stays `z.string().min(1).optional()` at the Zod level. Runtime enforcement lives in `getAnthropicClient()`.

### 3. Context Window

**File:** `src/lib/chat/context-window.ts`

`buildContextWindow(rawMessages: { role: 'user' | 'assistant'; content: string }[])` returns `{ contextMessages, trimmed: boolean }`.

Two constraints enforced before passing history to the Anthropic SDK:
- **Alternation:** Consecutive messages with the same role are merged (Anthropic requires strict user/assistant alternation). Pattern adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/context-window.ts` — simplified: no summary slots, no multi-part messages.
- **Budget:** Trim from the front to stay within 20 messages and 40,000 characters. The window always starts with a user message.

### 4. System Prompt

**File:** `src/lib/chat/system-prompt.ts`

`buildSystemPrompt(role: Role): string` returns a minimal brand-identity prompt for Side Quest Syndicate. Content:

```
You are an AI assistant for Side Quest Syndicate, a gaming content brand.
You help the content team with content operations: brainstorming, drafting,
reviewing, and scheduling gaming content. The operator's role is {role}.
Be concise and practical. Today's date: {utcDate}.
```

No tool manifest section yet — that arrives in Sprint 7.

### 5. New DB Tables

Added to `src/lib/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS spend_log (
  date TEXT PRIMARY KEY,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rate_limit (
  session_id TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
```

`spend_log.date` — UTC date string (`YYYY-MM-DD`), derived from SQLite `date('now')`.
`rate_limit.session_id` — the `userId` from the session cookie. For demo mode, anonymous visitors share the `creator-1` userId, so they share the rate limit bucket. This is consistent with the Sprint 2 "shared demo state" design.

### 6. Daily Spend Tracking

**File:** `src/lib/db/spend.ts`

Two exports:

- `isSpendCeilingExceeded(): boolean` — reads today's row from `spend_log`, computes estimated cost as `(tokens_in × 0.80 + tokens_out × 4.00) / 1_000_000`, compares to `env.CONTENTOPS_DAILY_SPEND_CEILING_USD`. Returns `true` if at or over ceiling.
- `recordSpend(tokensIn: number, tokensOut: number): void` — accumulates into today's row using an atomic upsert inside a `better-sqlite3` transaction. Called after a stream completes. SQL:

```sql
INSERT INTO spend_log (date, tokens_in, tokens_out)
VALUES (date('now'), ?, ?)
ON CONFLICT(date) DO UPDATE SET
  tokens_in  = spend_log.tokens_in  + excluded.tokens_in,
  tokens_out = spend_log.tokens_out + excluded.tokens_out
```

Note: `INSERT OR REPLACE` must NOT be used here — it would delete the existing row and reset the daily total to the current turn only.

Pricing constants used (Haiku, as of Sprint 3): input $0.80 / MTok, output $4.00 / MTok. These are declared as named constants in the file, not inline magic numbers.

### 7. Per-Session Rate Limiting

**File:** `src/lib/db/rate-limit.ts`

One export: `checkAndIncrementRateLimit(sessionId: string): { allowed: boolean; remaining: number }`.

Logic (synchronous, inside a `better-sqlite3` transaction):
1. Read the row for `session_id`.
2. If no row, or if `now - window_start >= 3600`: insert/replace with `count = 1`, `window_start = now`. Return `{ allowed: true, remaining: 9 }`.
3. If `count >= 10`: return `{ allowed: false, remaining: 0 }`.
4. Increment `count`. Return `{ allowed: true, remaining: 10 - newCount }`.

Only called when `env.CONTENTOPS_DEMO_MODE` is `true`.

### 8. Updated `/api/chat` Route

**File:** `src/app/api/chat/route.ts`

Replaces the mock loop. Execution order:

```
1. Parse + validate request body (unchanged)
2. Resolve `userId` and `role` from session cookie. The JWT payload is `{ sub: userId, role, name }`. Default role: `'Creator'` (matches the middleware fallback). (New: also extract `role` — needed for `buildSystemPrompt`)
3. Ensure demo users exist in DB (unchanged)
4. [DEMO ONLY] checkAndIncrementRateLimit(userId)
     → 429 if not allowed
5. [DEMO ONLY] isSpendCeilingExceeded()
     → stream static ceiling-hit message, do not call Anthropic
6. Load conversation history from DB (new)
7. buildContextWindow(history) (new)
8. buildSystemPrompt(role) (new)
9. Open DB transaction: persist user message (unchanged logic, moved inside)
10. Start ReadableStream:
     a. [DEMO ONLY] if remaining <= 2: emit { quota: { remaining } }
     b. emit { conversationId } (unchanged)
     c. Construct messages array: `[...contextMessages, { role: 'user', content: currentMessage }]`
        Note: history loaded at step 6 does NOT include the current message (it is persisted at step 9, after the query). The current message is always appended explicitly.
        anthropic.messages.stream({ model, system, messages: assembledMessages, max_tokens: 1024 })
        stream.on("text", chunk => emit { chunk })
        finalMessage = await stream.finalMessage()
     d. Persist assistant message with tokens_in/tokens_out (new: write token counts)
     e. [DEMO ONLY] recordSpend(tokensIn, tokensOut)
```

Pattern for `stream.on("text")` + `stream.finalMessage()` adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/anthropic-stream.ts`.

`max_tokens` is fixed at 1024 for Sprint 3. No tool blocks. `stop_reason` is expected to be `"end_turn"`.

The `mockStreamGenerator` import is removed from the route. `src/lib/mock-stream.ts` is not deleted — it remains available for tests.

### 9. ChatUI Quota Display

**File:** `src/components/chat/ChatUI.tsx`

`parseStreamLine` gains a new branch for `{ quota: { remaining: number } }`.

When `remaining <= 2`, a non-interactive banner is shown above the composer:
> "Demo quota: N message(s) remaining this hour."

This state is stored in a `quotaRemaining: number | null` React state variable. It resets to `null` on `handleNewConversation`. No dismiss button — the charter requirement is display only.

### 10. Eval Golden Stub

**File:** `scripts/eval-golden.ts`

```ts
console.log("Golden eval stub — no-op. Sprint 6 will implement response quality checks.");
process.exit(0);
```

`package.json` scripts: `"eval:golden": "tsx scripts/eval-golden.ts"`.

Charter §10 requires `npm run eval:golden` to pass from Sprint 3 onward.

## Acceptance Criteria

1. Sending a message returns real Anthropic output (not mock text) when `ANTHROPIC_API_KEY` is set in `.env.local`.
2. After a turn, `SELECT tokens_in, tokens_out FROM messages WHERE role = 'assistant' ORDER BY created_at DESC LIMIT 1` returns non-null integer values.
3. In demo mode (`CONTENTOPS_DEMO_MODE=true`), the 11th message within a rolling hour returns HTTP 429 with `{ error: "..." }`.
4. In demo mode, when `spend_log` shows today's cost at or above `CONTENTOPS_DAILY_SPEND_CEILING_USD`, the response stream contains the static ceiling-hit error message and no Anthropic call is made.
5. In demo mode, when `remaining <= 2` after rate-limit increment, the NDJSON stream includes `{ quota: { remaining: N } }` before the first `{ chunk }` line, and the ChatUI shows the quota notice.
6. `npm run typecheck` passes (zero errors).
7. `npm run lint` passes (zero errors).
8. `npm run test` passes (all tests, including new ones).
9. `npm run eval:golden` exits 0.

## Verification Commands

```
npm run typecheck
npm run lint
npm run test
npm run eval:golden
```

## File Map

### Created
- `docs/_specs/sprint-3-anthropic-streaming/spec.md` (this file)
- `src/lib/anthropic/client.ts`
- `src/lib/chat/context-window.ts`
- `src/lib/chat/system-prompt.ts`
- `src/lib/db/spend.ts`
- `src/lib/db/rate-limit.ts`
- `scripts/eval-golden.ts`
- `src/lib/chat/context-window.test.ts`
- `src/lib/db/spend.test.ts`
- `src/lib/db/rate-limit.test.ts`

### Modified
- `src/app/api/chat/route.ts`
- `src/components/chat/ChatUI.tsx`
- `src/lib/db/schema.ts`
- `src/lib/db/index.ts` (remove `readonly` flag)
- `src/lib/env.ts` (comment update only — ANTHROPIC_API_KEY stays optional at Zod level)
- `package.json` (add `@anthropic-ai/sdk`, add `eval:golden` script)

### Updated Tests
- `src/lib/db/schema.test.ts`
- `src/app/api/chat/route.integration.test.ts`

## Reference Citations

- `normalizeAlternation` pattern adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/context-window.ts`
- `stream.on("text")` + `stream.finalMessage()` pattern adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/anthropic-stream.ts`
- Rate limiter logic concept from `docs/_references/ai_mcp_chat_ordo/src/lib/rate-limit.ts` — adapted to SQLite instead of in-memory Map

## Out of Scope

- RAG / corpus retrieval (Sprint 5)
- Tool registry and MCP tool calls (Sprint 7)
- Multi-turn tool rounds (Sprint 7)
- Ordo's resilience/retry/fallback machinery (ContentOps uses single-attempt for Sprint 3)
- Abort signal handling / active stream deduplication (Sprint 7)
- Prompt engineering beyond minimal brand identity
- Context window summarization (Sprint 5 or later)
