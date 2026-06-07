# Sprint 44 — Implementation Notes & QA Report

Observability/logging + CI. Spec: [`spec.md`](spec.md) (revised 2026-06-06 after a 5-agent Spec-QA).
Method: `development-philosophy.md` (Spec → QA → revise Spec → Sprint → TDD → QA).

## Status
- **Spec revised** (Part 1) — split into 44A/44B/44C, stale facts corrected, redaction guardrails +
  Target User / Variance / Risks / Definition-of-Done added.
- **44C — Test visibility + CI: DONE.**
- **44A — Runtime observability: DONE** (44A.1 logger core + 44A.2 correlation + 44A.3 error capture).
- **44B — Tool-failure hardening: DONE** (the `tool_calls`/logger surface is sanitized + adversarially
  reviewed). The review surfaced a **pre-existing HIGH leak on an adjacent path** (chat-route
  tool_result → client/`messages`/LLM) — see §44B and the follow-up below.
- **44B.2 — chat-route tool-error sanitization: DONE** (closed the HIGH leak + the LOW stream-catch).
- **44-sweep: DONE** — see §Sweep below.

## 44A.1 — logger core (DONE)
- **`src/lib/log/logger.ts`** (Pino): `createLogger(destination?)` factory + app-wide `logger` singleton;
  `pino-pretty` worker transport only in local dev (tests pass a destination → plain JSON, no worker;
  prod → JSON). **PII guardrails:** backstop `redact` paths (lease/clause/email/body/cookie/secrets) +
  a custom `err` serializer (`serializeError`) that emits `{ name, code, stack }`, **drops the raw
  message**, and runs the stack through `stripErrorMessageFromStack` (keeps only ` at …` frames, since
  V8 puts the message in the stack's first line); non-Error `err` values are not echoed. The real
  contract is the **structured-event allowlist** (call-sites pass typed fields only).
- **`src/lib/env.ts`** + **`.env.example`** — new `LEASELENS_LOG_LEVEL` (Zod enum, default `info`).
- **Deps:** `pino@^10` (dep) + `pino-pretty@^13` (devDep) — the one justified new dependency.
- **Tests (`logger.test.ts`, 8):** level filtering; **PII redaction never emits the raw value**; error
  serializer drops message + message-bearing stack; non-Error not echoed; allowlist passthrough; child
  bindings (requestId); `stripErrorMessageFromStack` keeps only frames. **No call-site changes yet.**
- Gate: lint ✓ · typecheck ✓ · full suite **1216 passing**. (Build defers to the end-of-44A sweep —
  logger-only, no routes/pages touched.)

## 44A.2 — request correlation (DONE)
- **`src/lib/log/request-id.ts`** (new, **logger-free** so Edge middleware can import it without pulling
  Pino): `REQUEST_ID_HEADER = 'x-request-id'` + sync `requestIdFrom(headers)`.
- **`src/lib/log/request-context.ts`** (new, server-only): async `getRequestId()` (Next 16 `headers()` is
  async) + `getRequestLogger()` → `logger.child({ requestId })`.
- **`src/middleware.ts`** — generates one `crypto.randomUUID()` per request, **forwards it onto the
  request headers** via `NextResponse.next({ request: { headers } })` (so Node handlers read it) and
  **echoes it on every response** (including the early-return passthrough and the 401/403 JSON
  responses). Auth/session/workspace/RBAC logic untouched.
- **`src/app/api/chat/route.ts`** — a request-scoped `log = logger.child({ requestId: requestIdFrom(req.headers) })`
  at the top of `POST`; migrated the two genuine error logs: `:340` RAG failure → `log.warn(…'rag.retrieve_failed')`
  (recoverable), `:675` top-level catch → `log.error(…'chat.api_error')`. (The `NODE_ENV`-gated `[chat-diag]`
  lines are left for the 44A.5 sweep, per the spec.)
- **Tests:** `request-context.test.ts` (2 — header present/absent, `next/headers` mocked); `middleware.test.ts`
  extended (+4 — stamps on early-return, on home + still issues the session cookie, **still stamps on an
  RBAC 403 with auth preserved**, fresh id per request). The pre-existing RBAC tests stay green.
- Gate: lint ✓ · typecheck ✓ · full suite **1222 passing** · **build ✓** — the build confirms the
  **Edge/Node boundary holds** (middleware compiles for Edge with no Pino in its bundle; only the known
  Next-16 `middleware→proxy` deprecation warning appears, which we deferred by decision).

## 44A.3 — error capture + standard envelope (DONE)
- **`src/app/error.tsx`** + **`src/app/global-error.tsx`** ('use client') — accessible boundaries that
  **reuse the existing `ErrorState`** primitive (`role="alert"`), surface `error.digest` as a
  correlation handle, offer retry (`reset`) + a way home, and report to the server logger. global-error
  renders its own `<html>/<body>` (it supplants the root layout) and stays semantically correct even if
  the stylesheet doesn't load.
- **`src/lib/log/report-client-error.ts`** ('use server') — the action the boundaries call: logs an
  **allowlist** only (`source`, `digest`, `errName`) — never the raw client message.
- **`src/lib/http/error-response.ts`** — `errorResponse(code, { requestId?, status?, message? })` →
  `{ error, code, requestId }`. `code` is enumerated (`API_ERROR_CODES`); `error` is a SAFE message keyed
  off the code (Arnaud Lauret), never a raw `err.message`. Per-code default statuses.
- **`src/app/api/chat/route.ts`** — kept `requestId` in scope; the two 500 returns now use
  `errorResponse('INTERNAL', { requestId, … })` (the catch + "Failed to initialize conversation"), so a
  client error carries a correlation id. (The 4xx returns convert in the sweep.)
- **Tests:** `error-response.test.ts` (4 — code→status/message, requestId present/omitted, safe override);
  `error.test.tsx` (3 — accessible alert + digest reference, retry calls `reset` + home link, reports
  digest+name only). global-error covered by typecheck (its `<html>` makes a DOM test brittle).
- Gate: lint ✓ · typecheck ✓ · full suite **1229 passing** · **build ✓** (boundaries + envelope + the
  `'use server'` action all compile). **44A is complete.**

## 44B — tool-failure hardening (DONE)
The PII-critical piece: `tool_calls.error_message` used to persist the **raw** `err.message`, and a
`JSON.parse` SyntaxError from `draft_negotiation_email` / `grade_clause_severity` embeds the model's
draft-email body or clause text in that message. Fixed:
- **`src/lib/tools/safe-tool-error.ts`** — `toSafeToolError(err)` → `{ name, code }` (error class NAME +
  enumerated code: `parse_error | tool_error | access_denied | unknown_tool`); **never** the
  message/stack. Non-Error values are not echoed.
- **`src/lib/tools/registry.ts`** — the `execute()` catch now stores `safe.name` (`error_message`) +
  `safe.code` (`error_code`), and emits a structured `logger.error(…, 'tool.execute_failed')` with an
  **allowlist** only (`toolName, status, code, errName, conversationId, workspaceId`). No raw message.
- **`tool-calls.ts` / `schema.ts` / `migrate.ts`** — added the nullable `error_code` column (a clean
  `ADD COLUMN`, idempotent via `columnExists`; **no `audit_log` change** — its `status` CHECK would force
  a table rebuild, and `tool_calls` already records every failure). The migration also swallows the
  "duplicate column name" race that parallel `next build` workers hit on a brand-new column's first build.
- **Consumer now safe:** the cockpit (`AuditFeedPanel.tsx:88,97`) renders `tool_calls.error_message` into
  the admin DOM — pre-44B that was the raw (PII) message; now it's the bare error name.
- **Tests:** `safe-tool-error.test.ts` (4 — incl. "no PII substring" for a SyntaxError);
  `registry.test.ts` +1 — the **named redaction regression**: a tool throwing a PII-bearing SyntaxError
  persists `error_message='SyntaxError'`, `error_code='parse_error'`, and the serialized row contains
  **no** substring of the model output; `audit_log` untouched.
- Gate: lint ✓ · typecheck ✓ · full suite **1234 passing** · **build ✓**.

### Adversarial security review (Ross Anderson / Adam Shostack lens)
A read-only adversarial pass confirmed **44B fully closes the in-scope `tool_calls`/logger leak**
(verified end-to-end; `toSafeToolError` can't leak; the cockpit consumer is now safe). It also surfaced
a **pre-existing HIGH leak outside 44B's surface** that we are NOT introducing but must address next:
- **(HIGH) `route.ts:730-733`** — `toolError = err.message` (raw) → flows to the **client NDJSON stream**
  (`:759-773`), the **`messages` table** (`:783-808`), and back into the **LLM** (`buildMessagesForAnthropic`).
  Same PII class 44B scrubbed elsewhere. Owner: **44B.2** (apply `toSafeToolError`).
- **(LOW) `route.ts:664-669`** — top-level stream catch streams `getErrorMessage(error)` (rarely a tool
  error; fix alongside 44B.2).
- **(MED, dev-only) `route.ts:739-753` / `lease-tools.ts:248,335`** — `NODE_ENV`-gated `console.log`s print
  error/clause heads; route through the redacting logger in the sweep.
- **(LOW, future-risk) `logger.ts` redact paths** — don't cover `reasoning`/`content`/nested
  `tool_result.result.body`; the allowlist is the real defense, but document the footgun. (No prod call
  site logs a raw `result` today.)

## 44B.2 — chat-route tool-error sanitization (DONE)
Closes the HIGH finding above. Single sanitization boundary (Uncle Bob / DRY — reuse the
already-tested `toSafeToolError`; Arnaud Lauret — structured `{ error, code }` over the wire):
- **`src/app/api/chat/route.ts`** — `executeToolAndPersist`'s catch now sets
  `toolError = safe.name` and `toolResult = { error: safe.name, code: safe.code }` via `toSafeToolError`,
  so only the safe shape reaches the client NDJSON stream, the persisted `messages` tool row, and the
  LLM context (the model still gets the error *type*/code to self-correct). The top-level stream catch
  no longer streams the raw `getErrorMessage(error)` — it logs server-side (`chat.stream_error`, scrubbed
  serializer) and streams a safe generic; the now-unused `getErrorMessage` helper was removed.
  `executeToolAndPersist` is now exported as a verifiable unit.
- **Test:** `tool-error-redaction.integration.test.ts` — drives `executeToolAndPersist` with a tool that
  throws a PII-bearing `SyntaxError`; asserts the streamed payload + the persisted `messages` tool row
  contain **no** PII and carry only `{ error: 'SyntaxError', code: 'parse_error' }`. (Mocks `@/lib/db`
  to a fresh in-memory DB.)
- Gate: lint ✓ · typecheck ✓ · full suite **1235 passing** · **build ✓** (also confirms exporting a
  helper from the route file is fine in Next 16).

## Sweep (DONE)
Migrated all **server-runtime** `console.*` to the structured logger (allowlist fields; content heads
dropped):
- `workspaces/route.ts`, `leases/route.ts` (`*.upload_failed`), `lib/chat/rehydrate-history.ts`
  (`rehydrate.orphan_tool_result`), `lib/db/index.ts` (`db.corpus_empty`).
- `chat/route.ts`: `chat.response_truncated` (warn); the two `[chat-diag]` console.logs → `log.debug`/
  `logger.debug` (`chat.turn_complete`, `tool.diag`) with **lengths/IDs only — content heads removed**;
  guarded by log level, not `NODE_ENV`.
- `lease-tools.ts`: the two `[chat-diag s32.2-reject]` console.logs → `logger.debug`
  (`grade.citation_rejected`); replaced `chunk_body_head` (corpus text) with `chunkBodyLength`.
- **Left on `console` by decision:** `src/db/seed.ts` + `lib/rag/ingest.ts` (CLI/build progress — JSON
  logs would worsen them) and the 3 **client** components (`ChatUI`, `SampleWorkspaceSwitcher`,
  `PdfViewer.client`) — Pino is Node-only.
- **Error envelope:** the chat route's **generic** 4xx now use `errorResponse` (VALIDATION ×2,
  UNAUTHENTICATED, RATE_LIMITED) — adding `code` + `requestId`, messages preserved. The two
  `redirect`/cookie-delete 401s (a distinct "navigate home" contract) and the non-chat routes' 4xx were
  left as-is.
- **Redaction backstop widened:** added `reasoning`/`content`/`result` (+ nested) to the redact paths
  (the structured-event allowlist is still the primary defense). Test added to `logger.test.ts`.
- Gate: lint ✓ · typecheck ✓ · full suite **1236 passing** · **build ✓** (the rehydrate test was
  updated to spy on the logger instead of `console`; +1 logger redact-paths test).

## Logs verified live
- **JSON structured logs** (a `logger.child({ requestId })`): correlation id on every line, level
  filtering (debug `chat.turn_complete` shown only at `LEASELENS_LOG_LEVEL=debug`), the **redaction
  backstop** (`leaseText`/`reasoning` → `[redacted]`, `leaseId`/`clauseId` visible), and the **scrubbed
  error serializer** (`err: { name, stack-frames-only }` — a PII-bearing message left no trace).
- **Live x-request-id round-trip:** `curl -i /faq` returned `x-request-id: <uuid>` — the middleware
  stamps it on real responses (Node/Edge split intact).

## 44C — what was built
- **`vitest.config.ts`** — added `reporters` (fast `['default']` locally; adds machine-readable
  `junit` → `test-results/vitest-junit.xml` under `process.env.CI`) and `coverage` (v8;
  `text`/`html`/`lcov`; **ratcheted thresholds** stmts 84 / branches 75 / functions 84 / lines 86).
  Coverage stays opt-in via `--coverage`, so plain `npm test` stays fast.
- **`playwright.config.ts`** — added `['html', { open: 'never' }]` alongside `list` (viewable e2e
  report; `open:'never'` keeps headless/CI from launching a browser).
- **`package.json`** — added `test:coverage` (`vitest run --coverage`).
- **`.gitignore`** — added `playwright-report/` (`coverage/` + `test-results/` were already ignored).
- **`.github/workflows/ci.yml`** (new) — PR + push-to-main; one `verify` job: `npm ci` → **Lint →
  Typecheck → Test (coverage) → Build**, then uploads `coverage/` + `test-results/` as artifacts.
  Provides a throwaway `LEASELENS_SESSION_SECRET` (≥32 chars; `env.ts` validates it at module load,
  which `vitest`/`build` trigger) and sets `CI: true` so the JUnit reporter engages.

## Dependency decision (Dieter Rams / "no surprise deps")
Delivered viewable + machine-readable reports with **zero new dependencies**: Vitest **JUnit** (built-in)
for CI, the **coverage HTML** (`@vitest/coverage-v8`, already installed) for human viewing, **lcov** for
tooling, and the **Playwright HTML** report (built into `@playwright/test`). The interactive Vitest UI
report (`html` reporter) was *not* added because it needs `@vitest/ui` — an unplanned devDep; the
coverage HTML + Playwright HTML already satisfy "easier to view reports." Flagged as an optional upgrade.

## Test status — **PASS**
- **lint ✓ · typecheck ✓ · test ✓ · build ✓.** `CI=true npm run test:coverage`: **1208 passing**,
  coverage **stmts 86.49 / branches 78.49 / functions 86.75 / lines 88.78** — all above the ratcheted
  floors (threshold check exit 0). Verified artifacts render: `test-results/vitest-junit.xml` (307 KB)
  and `coverage/index.html`. `ci.yml` parses as valid YAML with the step order
  checkout → setup-node → npm ci → Lint → Typecheck → Test (coverage) → Build → Upload.
- This slice is config/infra, so it's verified by "gates run green + reports render," not red→green unit
  tests (the honest TDD note from the Spec-QA).

## Power words applied (44C)
- **Jez Humble / Dave Farley + Forsgren/Kim (CD)** — the four gates now run as a pipeline on every PR;
  changes are provably releasable, not "works on my machine."
- **Cindy Sridharan (meaningful monitoring)** — coverage thresholds **ratcheted to measured**, not an
  aspirational round number, so CI doesn't reward assertion-free tests.
- **Guillermo Rauch / Vercel + Git Discipline** — CI mirrors the local gates; e2e/deploy kept out of
  this slice; 44C shipped as its own reviewable unit ahead of 44A/44B.

## Risks / follow-up
- **CI-green-on-a-PR is the true gate** — not exercisable without a push; validate on the first PR.
- **Build-in-CI seed/embeddings:** `prebuild` runs `seed-if-empty.mjs` → `@huggingface/transformers`
  (WASM) embeddings; first CI run may download the model. If slow, cache `~/.cache` or add a CI
  seed-skip (flagged in `ci.yml`).
- **e2e not in CI** (needs browsers + real secret + webServer) — deliberate; a follow-up.
- **44A/44B pending** the revised-spec review (logger core + correlation + error boundaries; tool-failure
  redaction hardening with the named regression test).
