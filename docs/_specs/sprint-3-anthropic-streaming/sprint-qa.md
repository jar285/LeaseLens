# Sprint QA — Sprint 3: Anthropic Streaming Chat + Demo Cost Guardrails

## Issues Found

All issues are minor. None are blocking. All are addressed during implementation.

---

### Issue 1 — Minor: Task 1.1 verification command may fail for ESM SDK

`node -e "require('@anthropic-ai/sdk')"` may fail because `@anthropic-ai/sdk` is an ESM-primary package. **Fix:** Replace with `npm run typecheck` as the post-install verification, which confirms the import resolves correctly at the TypeScript level.

---

### Issue 2 — Minor: Task 5.2 mock target should be `@/lib/anthropic/client`, not `@anthropic-ai/sdk`

The sprint plan suggests mocking `@anthropic-ai/sdk` directly in the integration test. This creates a module-level cache problem: `getAnthropicClient()` caches `_client` after the first call. If the SDK mock is replaced between tests, `_client` is already set and won't pick up the new mock.

**Fix:** Mock `@/lib/anthropic/client` instead, returning a fully controlled `getAnthropicClient` stub. This bypasses the cache entirely and is the correct isolation boundary:

```ts
vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: vi.fn().mockReturnValue({
    messages: {
      stream: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation(function (event, cb) {
          if (event === 'text') cb('Test assistant response');
          return this;
        }),
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    },
  }),
}));
```

---

### Issue 3 — Minor: History load order — load after persisting user message

The spec says "load history at step 6, persist user message at step 9, append current message explicitly." This requires knowing `activeConversationId` before the transaction, which complicates the flow.

**Simpler approach (used in implementation):** Run the transaction first (ensure conversation + persist user message), then load history. History now includes the current user message as its final row. Pass `contextMessages` directly to Anthropic — no explicit append needed. The `buildContextWindow` will include the current user turn at the end.

This produces identical behavior and eliminates a source of subtle bugs (forgetting to append the message).

---

### Issue 4 — Minor: context-window.test.ts — use 22 messages, not 21

With 21 alternating messages (user first, ending with user), trimming to the last 20 starts with an assistant message. The role-guard then drops it, leaving 19. The test assertion "trimmed to 20" would fail.

**Fix:** Use 22 alternating messages (11 user + 11 assistant pairs). Last 20 = 10 user + 10 assistant, starting with user. Assertion is clean.

---

## No Other Issues Found

- `INSERT ... ON CONFLICT DO UPDATE SET` requires SQLite 3.24+. `better-sqlite3 ^12.x` bundles SQLite 3.46+. ✓
- WAL mode on `:memory:` DB returns `'memory'` in tests — existing schema test already handles this. ✓
- `db.transaction(() => { return value; })()` is valid with `better-sqlite3` — transaction functions can return values. ✓
- `tsx` is already a devDependency — `eval:golden` script will work without new dependencies. ✓
- All new `src/lib/**` test files are picked up by `vitest.config.ts` include pattern `src/**/*.test.{ts,tsx}`. ✓

---

**QA Lead:** Cascade (AI Assistant)
**Date:** 2026-04-24
