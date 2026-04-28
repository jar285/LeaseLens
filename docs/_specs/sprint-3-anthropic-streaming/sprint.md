# Sprint 3 Plan — Anthropic Streaming Chat + Demo Cost Guardrails

## Goal

Replace `mockStreamGenerator` with the Anthropic SDK, pass real conversation history through a bounded context window, and implement all charter §11b demo guardrails (rate limit, daily spend ceiling, quota display).

---

## Section 1 — Dependency + Eval Stub

### Task 1.1 — Install `@anthropic-ai/sdk`

**Action:** Add `@anthropic-ai/sdk` to `dependencies` in `package.json` and install.

```
npm install @anthropic-ai/sdk@^0.90.0
```

**Files:** `package.json`, `package-lock.json`
**Verification:** `node -e "require('@anthropic-ai/sdk')"` exits 0.

---

### Task 1.2 — Add `eval:golden` script stub

**Files:** `scripts/eval-golden.ts` (create), `package.json` (add script)

**`scripts/eval-golden.ts`:**
```ts
console.log(
  'Golden eval stub — no-op. Sprint 6 will implement response quality checks.',
);
process.exit(0);
```

**`package.json`** scripts: add `"eval:golden": "tsx scripts/eval-golden.ts"`.

Note: `vitest.config.ts` includes only `src/**/*.test.{ts,tsx}` — `scripts/` is outside the test runner. `eval:golden` is run as a standalone command, not via Vitest.

**Verification:** `npm run eval:golden` exits 0.

---

## Section 2 — DB: Prerequisite Fix + Schema

### Task 2.1 — Fix `src/lib/db/index.ts`

Remove the `readonly` flag and make WAL mode + schema init unconditional.

**Current `src/lib/db/index.ts`:**
```ts
const db = new Database(env.CONTENTOPS_DB_PATH, {
  readonly: env.CONTENTOPS_DEMO_MODE,
});
if (!env.CONTENTOPS_DEMO_MODE) {
  db.pragma('journal_mode = WAL');
}
if (!env.CONTENTOPS_DEMO_MODE) {
  db.exec(SCHEMA);
}
```

**Becomes:**
```ts
const db = new Database(env.CONTENTOPS_DB_PATH);

db.pragma('journal_mode = WAL');
db.exec(SCHEMA);
```

`busy_timeout` pragma and `mkdirSync` guard remain unchanged.

**Files:** `src/lib/db/index.ts`
**Verification:** `npm run typecheck`, `npm run test`

---

### Task 2.2 — Add `spend_log` and `rate_limit` tables to schema

**File:** `src/lib/db/schema.ts` — append to the `SCHEMA` constant:

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

**Verification:** `npm run typecheck`

---

### Task 2.3 — Update schema test

**File:** `src/lib/db/schema.test.ts`

Add assertion that both new tables exist:

```ts
expect(tableNames).toContain('spend_log');
expect(tableNames).toContain('rate_limit');
```

**Verification:** `npm run test src/lib/db/schema.test.ts`

---

## Section 3 — Anthropic Client + Context Window + System Prompt

### Task 3.1 — Create `src/lib/anthropic/client.ts`

```ts
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Set it in .env.local for local development.',
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}
```

Lazy singleton — module-level initialization is avoided. Safe for Vitest module mocking.

**Verification:** `npm run typecheck`, `npx biome check src/lib/anthropic/client.ts`

---

### Task 3.2 — Create `src/lib/chat/context-window.ts`

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/context-window.ts` — `normalizeAlternation` + trim logic. Simplified: no summary slots, no parts system.

```ts
export type ContextMessage = { role: 'user' | 'assistant'; content: string };

const MAX_MESSAGES = 20;
const MAX_CHARS = 40_000;

/** Merge consecutive same-role messages. Anthropic requires strict alternation. */
export function normalizeAlternation(messages: ContextMessage[]): ContextMessage[] {
  if (messages.length === 0) return [];
  const merged: ContextMessage[] = [{ ...messages[0] }];
  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    if (messages[i].role === prev.role) {
      prev.content = prev.content + '\n\n' + messages[i].content;
    } else {
      merged.push({ ...messages[i] });
    }
  }
  return merged;
}

/** Trim from the front, keeping within message count and char budgets. Always starts with a user message. */
function trimToLimits(messages: ContextMessage[]): ContextMessage[] {
  let trimmed = messages.length > MAX_MESSAGES
    ? messages.slice(messages.length - MAX_MESSAGES)
    : [...messages];

  let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > MAX_CHARS && trimmed.length > 1) {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
  }

  while (trimmed.length > 1 && trimmed[0].role !== 'user') {
    trimmed = trimmed.slice(1);
  }

  return trimmed;
}

export function buildContextWindow(rawMessages: ContextMessage[]): {
  contextMessages: ContextMessage[];
  trimmed: boolean;
} {
  const normalized = normalizeAlternation(rawMessages);
  const contextMessages = trimToLimits(normalized);
  return {
    contextMessages,
    trimmed: contextMessages.length < normalized.length,
  };
}
```

**Verification:** `npm run typecheck`, `npx biome check src/lib/chat/context-window.ts`

---

### Task 3.3 — Create `src/lib/chat/context-window.test.ts`

Tests for `normalizeAlternation` and `buildContextWindow`.

Assertions:
- `normalizeAlternation`: two consecutive user messages → merged into one.
- `normalizeAlternation`: empty array → empty array.
- `normalizeAlternation`: correct alternation → unchanged.
- `buildContextWindow`: history within budget → `trimmed: false`, all messages returned.
- `buildContextWindow`: history exceeding `MAX_MESSAGES` (21 messages) → trimmed to 20, starts with user.
- `buildContextWindow`: empty history → `{ contextMessages: [], trimmed: false }`.

**Verification:** `npm run test src/lib/chat/context-window.test.ts`

---

### Task 3.4 — Create `src/lib/chat/system-prompt.ts`

```ts
import type { Role } from '@/lib/auth/types';

export function buildSystemPrompt(role: Role): string {
  const utcDate = new Date().toISOString().slice(0, 10);
  return [
    'You are an AI assistant for Side Quest Syndicate, a gaming content brand.',
    'You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling gaming content.',
    `The operator's role is ${role}.`,
    `Today's date: ${utcDate}.`,
    'Be concise and practical.',
  ].join(' ');
}
```

**Verification:** `npm run typecheck`, `npx biome check src/lib/chat/system-prompt.ts`

---

## Section 4 — Guardrails: Spend + Rate Limit

### Task 4.1 — Create `src/lib/db/spend.ts`

```ts
import { env } from '@/lib/env';
import { db } from '@/lib/db';

const HAIKU_INPUT_COST_PER_MTOK = 0.80;
const HAIKU_OUTPUT_COST_PER_MTOK = 4.00;

export function estimateCost(tokensIn: number, tokensOut: number): number {
  return (tokensIn * HAIKU_INPUT_COST_PER_MTOK + tokensOut * HAIKU_OUTPUT_COST_PER_MTOK) / 1_000_000;
}

export function isSpendCeilingExceeded(): boolean {
  const row = db
    .prepare("SELECT tokens_in, tokens_out FROM spend_log WHERE date = date('now')")
    .get() as { tokens_in: number; tokens_out: number } | undefined;

  if (!row) return false;
  return estimateCost(row.tokens_in, row.tokens_out) >= env.CONTENTOPS_DAILY_SPEND_CEILING_USD;
}

export function recordSpend(tokensIn: number, tokensOut: number): void {
  db.prepare(`
    INSERT INTO spend_log (date, tokens_in, tokens_out)
    VALUES (date('now'), ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      tokens_in  = spend_log.tokens_in  + excluded.tokens_in,
      tokens_out = spend_log.tokens_out + excluded.tokens_out
  `).run(tokensIn, tokensOut);
}
```

**Verification:** `npm run typecheck`, `npx biome check src/lib/db/spend.ts`

---

### Task 4.2 — Create `src/lib/db/spend.test.ts`

Use `createTestDb()` from `src/lib/db/test-helpers.ts` (injected, not global `db`). Tests must call functions with the test DB, so `spend.ts` functions need to accept an optional `db` parameter or the test creates a parallel helper. 

**Note on testability:** `spend.ts` and `rate-limit.ts` import the global `db` singleton. For unit tests, mock the `@/lib/db` module import via `vi.mock`. Tests assert behavior by reading the test-specific database state after calling the function.

**Alternative (chosen):** Since `createTestDb()` exists and the global `db` is the `:memory:` DB in tests (`.env.test` sets `CONTENTOPS_DB_PATH=:memory:`), tests can call `recordSpend()` / `isSpendCeilingExceeded()` directly against the test DB without mocking. The `beforeEach` should clear `spend_log`.

Assertions:
- `isSpendCeilingExceeded()` returns `false` when no row exists.
- `recordSpend(1000, 500)` followed by `recordSpend(1000, 500)` accumulates (not resets) — total is 2000 in / 1000 out.
- `isSpendCeilingExceeded()` returns `true` when accumulated cost meets or exceeds `CONTENTOPS_DAILY_SPEND_CEILING_USD` (set a low ceiling in the test via env override or use very high token counts: e.g., 1_000_000 in + 500_000 out → $1.30 ... need more for $2 ceiling. Use 2_000_000 in + 500_000 out → $3.60 > $2).

**Verification:** `npm run test src/lib/db/spend.test.ts`

---

### Task 4.3 — Create `src/lib/db/rate-limit.ts`

```ts
import { db } from '@/lib/db';

const WINDOW_SECONDS = 3600;
const MAX_REQUESTS = 10;

export function checkAndIncrementRateLimit(sessionId: string): {
  allowed: boolean;
  remaining: number;
} {
  const now = Math.floor(Date.now() / 1000);

  const result = db.transaction(() => {
    const row = db
      .prepare('SELECT window_start, count FROM rate_limit WHERE session_id = ?')
      .get(sessionId) as { window_start: number; count: number } | undefined;

    if (!row || now - row.window_start >= WINDOW_SECONDS) {
      db.prepare(
        'INSERT OR REPLACE INTO rate_limit (session_id, window_start, count) VALUES (?, ?, 1)',
      ).run(sessionId, now);
      return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }

    if (row.count >= MAX_REQUESTS) {
      return { allowed: false, remaining: 0 };
    }

    const newCount = row.count + 1;
    db.prepare(
      'UPDATE rate_limit SET count = ? WHERE session_id = ?',
    ).run(newCount, sessionId);
    return { allowed: true, remaining: MAX_REQUESTS - newCount };
  })();

  return result;
}
```

**Verification:** `npm run typecheck`, `npx biome check src/lib/db/rate-limit.ts`

---

### Task 4.4 — Create `src/lib/db/rate-limit.test.ts`

Uses global `db` (`:memory:` in tests). `beforeEach` clears `rate_limit`.

Assertions:
- First call for a session ID → `{ allowed: true, remaining: 9 }`.
- 10th call → `{ allowed: true, remaining: 0 }`.
- 11th call → `{ allowed: false, remaining: 0 }`.
- Call after window expires (manipulate `window_start` to be `>= 3600s` ago directly in DB) → `{ allowed: true, remaining: 9 }` (window resets).

**Verification:** `npm run test src/lib/db/rate-limit.test.ts`

---

## Section 5 — Updated `/api/chat` Route

### Task 5.1 — Rewrite `src/app/api/chat/route.ts`

Full replacement of the mock loop. Key changes from current file:

1. **Remove** `import { mockStreamGenerator } from '@/lib/mock-stream'`.
2. **Add** imports: `getAnthropicClient`, `buildContextWindow`, `buildSystemPrompt`, `isSpendCeilingExceeded`, `recordSpend`, `checkAndIncrementRateLimit`, `env`.
3. **Extract `role`** from session cookie alongside `userId` (the `SessionClaims` type already has `role`).
4. **Load history** from DB before opening the stream:
   ```ts
   const history = db
     .prepare(
       'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
     )
     .all(activeConversationId) as { role: 'user' | 'assistant'; content: string }[];
   ```
   Note: history is loaded AFTER the conversation is ensured but BEFORE the user message is persisted, so the current message is NOT in the history. It is appended explicitly to the messages array.
5. **Demo guardrails** (wrapped in `if (env.CONTENTOPS_DEMO_MODE)`):
   - Rate limit check → 429 response.
   - Spend ceiling check → stream the static error message as a single `{ chunk }` line then close.
6. **Anthropic stream** replaces the mock loop:
   ```ts
   const anthropic = getAnthropicClient();
   const stream = anthropic.messages.stream({
     model: env.CONTENTOPS_ANTHROPIC_MODEL,
     system: buildSystemPrompt(role),
     messages: [
       ...contextMessages,
       { role: 'user', content: message },
     ],
     max_tokens: 1024,
   });

   stream.on('text', (text: string) => {
     fullResponse += text;
     controller.enqueue(encoder.encode(`${JSON.stringify({ chunk: text })}\n`));
   });

   const finalMessage = await stream.finalMessage();
   const tokensIn = finalMessage.usage.input_tokens;
   const tokensOut = finalMessage.usage.output_tokens;
   ```
7. **Persist assistant message with token counts.**
8. **Increment spend** after message is persisted.

Pattern borrowed from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/anthropic-stream.ts` lines 194–219 (`stream.on("text", ...)` + `stream.finalMessage()`).

**Verification:** `npm run typecheck`, `npx biome check src/app/api/chat/route.ts`

---

### Task 5.2 — Update `src/app/api/chat/route.integration.test.ts`

The current test asserts `messages[1].content.toContain('onboard Side Quest Syndicate')` — this is hardcoded to the mock response and will fail with a real (mocked) Anthropic SDK.

**Changes:**
1. Add `vi.mock('@anthropic-ai/sdk')` at the top of the test file, providing a mock `messages.stream()` that:
   - Emits one `"text"` event with `"Test assistant response"`.
   - Returns a `finalMessage()` with `usage: { input_tokens: 10, output_tokens: 5 }`.
2. Update the assertion on `messages[1].content` to match the mocked response.
3. Add assertion that `messages[1].tokens_in` and `messages[1].tokens_out` are non-null integers.
4. Add assertion that `rate_limit` and `spend_log` tables are present (schema test coverage addition).

**Vitest mock shape for `@anthropic-ai/sdk`:**
```ts
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue({
          on: vi.fn().mockImplementation(function (
            this: unknown,
            event: string,
            cb: (text: string) => void,
          ) {
            if (event === 'text') cb('Test assistant response');
            return this;
          }),
          finalMessage: vi.fn().mockResolvedValue({
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        }),
      },
    })),
  };
});
```

**Verification:** `npm run test src/app/api/chat/route.integration.test.ts`

---

## Section 6 — ChatUI Quota Display

### Task 6.1 — Update `src/components/chat/ChatUI.tsx`

1. Add `quotaRemaining: number | null` to `StreamLineMessage` type:
   ```ts
   type StreamLineMessage =
     | { conversationId: string }
     | { chunk: string }
     | { error: string }
     | { quota: { remaining: number } };
   ```
2. Add branch to `parseStreamLine`:
   ```ts
   if (
     typeof parsed === 'object' && parsed !== null &&
     'quota' in parsed &&
     typeof (parsed as { quota?: unknown }).quota === 'object'
   ) {
     return { quota: (parsed as { quota: { remaining: number } }).quota };
   }
   ```
3. Add `quotaRemaining` state: `const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null)`.
4. Reset in `handleNewConversation`: `setQuotaRemaining(null)`.
5. Handle in stream loop:
   ```ts
   } else if ('quota' in data) {
     setQuotaRemaining(data.quota.remaining);
   }
   ```
6. Render notice above the composer when `quotaRemaining !== null && quotaRemaining <= 2`:
   ```tsx
   {quotaRemaining !== null && quotaRemaining <= 2 && (
     <div className="mx-6 mb-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
       Demo quota: {quotaRemaining} message{quotaRemaining !== 1 ? 's' : ''} remaining this hour.
     </div>
   )}
   ```
   Placed between the error banner and `<ChatComposer>`.

**Verification:** `npm run typecheck`, `npx biome check src/components/chat/ChatUI.tsx`

---

## Section 7 — Final Verification Pass

### Task 7.1 — Run full verification suite

```
npm run typecheck
npm run lint
npm run test
npm run eval:golden
```

All four commands must pass with zero errors.

### Task 7.2 — Smoke test with real API key (local)

Manual verification with `ANTHROPIC_API_KEY` set in `.env.local`:
1. `npm run dev`
2. Send a message → confirm real Anthropic response (not mock text).
3. `SELECT tokens_in, tokens_out FROM messages WHERE role = 'assistant' ORDER BY created_at DESC LIMIT 1;` → confirm non-null integers.
4. Set `CONTENTOPS_DEMO_MODE=true` in `.env.local`, send 11 messages → confirm 11th returns 429.
5. Manually insert a high-spend row → confirm ceiling message in stream.

---

## Completion Checklist

- [x] `@anthropic-ai/sdk ^0.90.0` installed and in `package.json`.
- [x] `npm run eval:golden` exits 0.
- [x] `src/lib/db/index.ts`: `readonly` flag removed, WAL + schema init unconditional.
- [x] `spend_log` and `rate_limit` tables in `schema.ts`.
- [x] `src/lib/anthropic/client.ts`: lazy singleton, throws at call time without key.
- [x] `src/lib/chat/context-window.ts`: `normalizeAlternation` + trim, tests pass.
- [x] `src/lib/chat/system-prompt.ts`: brand prompt with role + date.
- [x] `src/lib/db/spend.ts`: `isSpendCeilingExceeded` + `recordSpend` (accumulating upsert).
- [x] `src/lib/db/rate-limit.ts`: `checkAndIncrementRateLimit` with rolling-window reset.
- [x] `/api/chat/route.ts`: mock removed, Anthropic SDK streaming, role extracted, history loaded, guardrails applied, tokens written.
- [x] `ChatUI.tsx`: `{ quota }` line handled, banner rendered when ≤ 2.
- [x] `route.integration.test.ts`: Anthropic SDK mocked, token assertions added.
- [x] `schema.test.ts`: new tables asserted.
- [x] `npm run typecheck` — zero errors.
- [x] `npm run lint` — zero errors.
- [x] `npm run test` — all tests pass (57 tests across 13 files).
- [x] `npm run eval:golden` — exits 0.

---

## Post-Sprint Addendum

**Status:** Complete  
**Date:** 2026-04-28

### Test Gap-Fills (added before closing sprint)

After the initial verification pass, three test gaps were identified and filled:

1. **`vitest.config.ts`** — expanded `include` to `['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}']` to support a future top-level `tests/` directory.

2. **`src/lib/chat/system-prompt.test.ts`** (new) — 4 unit tests for `buildSystemPrompt`: brand name presence, role injection, UTC date format (`YYYY-MM-DD`), and distinct output per role.

3. **`src/lib/chat/parse-stream-line.ts`** (extracted from `ChatUI.tsx`) + **`src/lib/chat/parse-stream-line.test.ts`** (new) — `parseStreamLine` moved to a shared module; 9 unit tests covering all 5 line types (`conversationId`, `chunk`, `error`, `quota`) plus malformed JSON, unknown shapes, primitives, and invalid field types.

4. **`route.integration.test.ts`** — 2 new integration tests added to a `Chat API Demo Guardrails` describe block:
   - 11th message in demo mode → 429 with `"Rate limit exceeded"`.
   - Spend ceiling pre-seeded → stream body contains `"Daily demo quota reached"`.
   - `@/lib/env` mocked via a getter-based proxy so `CONTENTOPS_DEMO_MODE` is controllable per-describe without module re-import.

Final test count: **57 tests across 13 files** (up from 42).

### UI Bug Fixes (found during manual review)

1. **Markdown not rendered** — Assistant messages displayed raw `**bold**` syntax. Fixed by extracting `src/lib/chat/render-markdown.tsx` (a dependency-free renderer supporting bold, inline code, `#`/`##`/`###` headings, bullet/numbered lists, and `---` dividers) and calling it from `ChatMessage.tsx` for assistant-role messages only.

2. **Scroll broken** — Three separate root causes, fixed in order:
   - `globals.css`: added `html, body { height: 100% }` so the viewport height chain reaches the scroll container.
   - `layout.tsx`: added `className="h-full"` to `<body>` for the same reason.
   - `ChatUI.tsx`: added `flex-1` to the transcript wrapper div so it fills the `minmax(0,1fr)` grid row.
   - `ChatTranscript.tsx`: replaced `flex min-h-full flex-col justify-end` on the inner content div with `shrink-0`. `min-h-full` forced `scrollHeight === clientHeight` at all times, making overflow scroll a no-op. Pattern sourced from Ordo's `ChatMessageViewport` inner content wrapper.

---

## Commit Strategy

- **Section 1:** `feat(s3): install anthropic sdk + eval:golden stub`
- **Section 2:** `feat(s3): prerequisite fix — db writable in demo mode + guardrail schema`
- **Section 3:** `feat(s3): anthropic client, context window, system prompt`
- **Section 4:** `feat(s3): spend tracking + rate limit guardrails`
- **Section 5:** `feat(s3): replace mock stream with anthropic sdk streaming`
- **Section 6:** `feat(s3): chatui quota display`
- **Section 7:** `feat(s3): final verification pass`

---

## Reference Citations

- `normalizeAlternation` adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/context-window.ts`
- `stream.on("text")` + `stream.finalMessage()` adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/chat/anthropic-stream.ts` lines 194–219
- Rate limit rolling-window concept from `docs/_references/ai_mcp_chat_ordo/src/lib/rate-limit.ts` — adapted to SQLite
