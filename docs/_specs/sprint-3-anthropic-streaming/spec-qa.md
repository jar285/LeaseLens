# Spec QA — Sprint 3: Anthropic Streaming Chat + Demo Cost Guardrails

## API Verification

`anthropic.messages.stream({...}).on("text", cb)` + `await stream.finalMessage()` confirmed current against the official Anthropic TypeScript SDK documentation (latest version 0.90.0 as of this QA pass). `finalMessage()` returns `Anthropic.Message` with `usage.input_tokens` and `usage.output_tokens`. The streaming helper API in the spec is correct.

Current latest `@anthropic-ai/sdk` version: `0.90.0`. The sprint plan should pin `^0.90.0` (not ^0.78.0 from Ordo reference, which is older).

---

## Issues Found

### Issue 1 — Blocking: `db/index.ts` prerequisite fix is under-specified

**Location:** § Prerequisite Fix

**Problem:** The spec says "remove the `readonly` flag." But `src/lib/db/index.ts` also gates two other operations behind `!env.CONTENTOPS_DEMO_MODE`:

```ts
if (!env.CONTENTOPS_DEMO_MODE) {
  db.pragma('journal_mode = WAL');
}
if (!env.CONTENTOPS_DEMO_MODE) {
  db.exec(SCHEMA);
}
```

If only the `readonly` flag is removed, the `spend_log` and `rate_limit` tables will not be created in demo mode (`db.exec(SCHEMA)` is skipped), and WAL mode will not be enabled for concurrent writes. Both must run in demo mode for guardrails to function.

**Fix applied to spec:** Prerequisite Fix section updated to explicitly state: in addition to removing the `readonly` flag, `db.pragma('journal_mode = WAL')` and `db.exec(SCHEMA)` must run unconditionally (not gated on `!DEMO_MODE`). The only guard that remains is the `mkdirSync` call, which correctly stays gated on non-demo mode (the DB file pre-exists in demo).

---

### Issue 2 — Blocking: `recordSpend()` uses wrong upsert strategy

**Location:** § Architecture §6 — Daily Spend Tracking

**Problem:** The spec says `recordSpend()` uses "`INSERT OR REPLACE` inside a `better-sqlite3` transaction." `INSERT OR REPLACE` deletes the existing row and inserts a fresh one — it would reset today's total to just the current turn's tokens, not accumulate.

**Correct SQL:**
```sql
INSERT INTO spend_log (date, tokens_in, tokens_out)
VALUES (date('now'), ?, ?)
ON CONFLICT(date) DO UPDATE SET
  tokens_in  = spend_log.tokens_in  + excluded.tokens_in,
  tokens_out = spend_log.tokens_out + excluded.tokens_out
```

**Fix applied to spec:** `recordSpend()` description updated to use `INSERT ... ON CONFLICT DO UPDATE SET` with accumulation. `INSERT OR REPLACE` wording removed.

---

### Issue 3 — Blocking: Route messages array assembly is under-specified

**Location:** § Architecture §8 — Updated `/api/chat` Route, step 10c

**Problem:** The spec says `anthropic.messages.stream({ model, system, messages, max_tokens: 1024 })` but does not define what `messages` contains. The history is loaded at step 6 and the current user message is persisted at step 9 — the current message is NOT in the history loaded at step 6 (it is written to DB in step 9, after the history query). The `messages` array passed to Anthropic must be:

```ts
[...contextMessages, { role: 'user', content: currentUserMessage }]
```

If `contextMessages` is empty (first message in a conversation), the array is `[{ role: 'user', content: currentMessage }]` — valid for Anthropic. Without this, the current user message would be silently dropped.

**Fix applied to spec:** Step 10c updated to explicitly state the messages array construction.

---

### Issue 4 — Blocking: `role` extraction missing from route session resolution

**Location:** § Architecture §8 — Updated `/api/chat` Route, steps 2 and 8

**Problem:** `buildSystemPrompt(role)` requires the user's role. The current route extracts only `userId` from the session cookie payload:

```ts
const payload = await decrypt(sessionCookie.value);
if (payload?.userId) { userId = payload.userId; }
```

The session payload is `{ sub: userId, role, name }` (Sprint 2 spec §2). The route must also extract `role` from the payload. For the fallback case (no cookie / invalid cookie), the default role is `'Creator'` (consistent with the default creator-1 session issued by middleware).

**Fix applied to spec:** Step 2 updated to "Resolve `userId` and `role` from session cookie. Default role: `'Creator'`."

---

### Issue 5 — Minor: "Dismissible" quota banner not required by charter

**Location:** § Architecture §9 — ChatUI Quota Display

**Problem:** The spec says "a dismissible notice." Charter §11b says "The chat surface displays the remaining quota when fewer than 3 messages remain." No requirement for dismissibility. Adding a dismiss button adds UI complexity (state, aria, interaction) without charter justification.

**Fix applied to spec:** "Dismissible" removed. The notice is a simple non-interactive banner that disappears when a new conversation is started (existing `handleNewConversation` reset).

---

### Issue 6 — Minor: SDK version clarification

**Location:** § Architecture §1 — New Dependency

**Problem:** Spec says "ContentOps targets the same major line as Ordo's ^0.78.0." Ordo's version is outdated; current latest is `0.90.0`.

**Fix applied to spec:** Updated to reference `^0.90.0` as the target version, to be confirmed in the sprint plan step.

---

## Fixes Applied

All six issues above have been corrected directly in `spec.md`. The corrected sections are:

| Section | Fix |
|---------|-----|
| Prerequisite Fix | Added: WAL + SCHEMA exec must also run in demo mode |
| §1 Dependency | Version updated to `^0.90.0` |
| §6 Spend Tracking | `INSERT OR REPLACE` → `INSERT ... ON CONFLICT DO UPDATE SET` with accumulation |
| §8 Route step 2 | Added role extraction from cookie payload; default `'Creator'` |
| §8 Route step 10c | Explicit `[...contextMessages, { role: 'user', content: currentMessage }]` construction |
| §9 ChatUI | Removed "dismissible" — simple non-interactive banner |

---

## No Other Issues Found

- Charter §4 invariant (tool registry drift): correctly handled — no tools in Sprint 3.
- Charter §11b guardrails checklist: all six items addressed.
- Streaming protocol backward compatibility: new `{ quota }` line type is additive; existing clients silently skip it.
- Test environment compatibility: `ANTHROPIC_API_KEY` stays optional at Zod level; module mocking in tests remains clean.
- SQLite concurrency: `better-sqlite3` synchronous transactions prevent intra-process races; inter-process (Vercel) is best-effort per charter §11b intent.
- Out-of-scope list is complete and consistent with charter §11a.

---

**QA Lead:** Cascade (AI Assistant)
**Date:** 2026-04-24
