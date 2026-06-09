# Sprint 44 — Observability: Structured Logs, Correlation, Error Capture & CI

> Draft plan (2026-06-03; renumbered 40→44 to keep spec order == ship order — predates shipped
> Sprint 41/42). Source intent: the user's research ask — "well-designed logs so it's much easier to
> view and find errors, and easier to set up tests." **Revised 2026-06-06 after a 5-agent Spec-QA**
> (corrected stale findings; split into 44A/44B/44C; added redaction guardrails + the missing
> spec sections). **No commits until the user says so.**

## Goal

Make runtime errors fast to find and test failures fast to read — **without ever leaking lease PII**.
Replace scattered `console.*` with one structured logger, give every request a correlation ID so a
chat round-trip can be traced end-to-end (RAG → Anthropic stream → tool execution), capture client
crashes behind accessible error boundaries, **harden the existing tool-failure record so it can't
persist raw PII**, and turn the invisible test/coverage tooling into readable reports gated in CI.

## Target user

The **developer/operator** of LeaseLens (debugging a failed chat round-trip, triaging a tool error,
or gating a PR) — *not* the tenant. This is a developer-facing reliability + delivery feature; the only
tenant-facing surface is the accessible error fallback (44A).

## Why now (current-state findings — verified 2026-06-06)

- **22** raw `console.*` calls (non-test), stdout-only/unstructured, clustered in `src/db/seed.ts` (5)
  and `src/app/api/chat/route.ts` (5); the rest are scattered singletons. (The original "~30, mostly
  `workspaces/route.ts`" was wrong — `workspaces/route.ts` has 1.) Stack traces are discarded.
- **No request/correlation IDs** — a user's chat session can't be traced across requests.
- **Tool failures ARE already persisted — with a raw error string.** `src/lib/tools/tool-calls.ts`
  `writeToolCall` records every `ToolRegistry.execute()` (success *and* error) into `tool_calls` with
  `error_message TEXT` (raw `err.message`) + latency. So failures do **not** "vanish into stdout" — and
  that raw `error_message` is a **PII leak today** (a `draft_negotiation_email` / `grade_clause_severity`
  `JSON.parse` failure embeds the model's draft-email body / clause text). `audit_log` is intentionally
  mutations-only (`tool-calls.ts` header) and its `status` has `CHECK(executed|rolled_back)` — adding a
  `'failed'` value needs a full SQLite table rebuild, so we will **not** touch `audit_log`.
- **No `error.tsx` / `global-error.tsx` / ErrorBoundary** anywhere in `src/app/`.
- Tests are strong (**~134 colocated `*.test.{ts,tsx}` + 10 e2e**, ~1208 cases) but: **no CI workflow**,
  no coverage thresholds, `vitest.config.ts` has no reporters, `playwright.config.ts` is `list`-only.
  `@vitest/coverage-v8` is already installed (coverage needs no new dep).

## Locked decisions (Spec-QA gate — 2026-06-06)
1. **Logger = Pino** — the one justified new dep (`pino` dep + `pino-pretty` devDep, both absent today).
   Node runtime is confirmed (10 `runtime='nodejs'` route/page sites; no `runtime='edge'`); JSON in
   prod, `pino-pretty` in dev. Pino is **never** imported into middleware.
2. **Correlation ID stamped in the existing `src/middleware.ts`** (kept — Next 16's `proxy` rename is
   deferred to its own change). Middleware sets `x-request-id` via `crypto.randomUUID()` **on every
   matched path** (its early-returns currently bypass the `response` object — fix that). Route handlers
   read it (`headers()` is async in Next 16) → `logger.child({ requestId })`.
3. **Redaction = structured-event allowlist, not just path-blocklist.** Call-sites pass only typed,
   enumerated fields (`leaseId`, `clauseId`, `clauseType`, `severity`, `toolName`, `status`, `requestId`,
   `durationMs`); **raw content is never handed to the logger**. Pino path-redaction (lease/clause/email
   bodies, cookies, `ANTHROPIC_API_KEY`, `LEASELENS_SESSION_SECRET`) + a custom error serializer that
   drops/scrubs `err.message` are the belt-and-suspenders backstop.
4. **Tool-failure hardening reuses the existing `tool_calls` path — no `audit_log` migration.**
   `error_message` becomes a **structured, redacted record** (`{ error_name, code, tool_name, ids-only }`),
   never the raw message/stack. Optional clean `ALTER TABLE tool_calls ADD COLUMN error_code`. `audit_log`
   success/rollback semantics untouched.
5. **Test visibility uses existing tooling** — Vitest `junit` + `html` reporters + **ratcheted** coverage
   thresholds (set at/just below *current measured* coverage, per Cindy Sridharan — never aspirational);
   Playwright `html` (trace-on-first-retry already on). CI runs the existing four gates. No new framework.

## Sub-sprints (each a small reviewable commit, TDD red→green)

### 44A — Runtime observability
- **Logger core** `src/lib/log/logger.ts` (Pino; pretty/JSON by `NODE_ENV`; redaction paths + custom
  `err` serializer). New `LEASELENS_LOG_LEVEL` (Zod enum, default `info`) in `src/lib/env.ts` **and**
  `.env.example`. Add `pino` / `pino-pretty`. Tests: level filtering, redaction (incl. a PII-never-logged
  assertion), structured fields.
- **Correlation** — `src/middleware.ts` stamps `x-request-id` on all matched paths; async `getRequestId()`
  helper; `logger.child({ requestId })`. **First consumer: the chat route** — migrate the genuine error
  logs (`route.ts:340` RAG, `:675` API error); explicitly **decide keep/route/drop** for the two
  `NODE_ENV`-gated `[chat-diag]` lines (`:617/:736`). Tests: header set; child carries `requestId`.
- **Error capture + envelope** — `src/app/error.tsx` + `global-error.tsx` (report to logger, render an
  **accessible** fallback — focus, AA contrast, semantic, reduced-motion). API errors standardize to
  `{ error, requestId, code }` with **`code` required + enumerated** (consume `src/lib/tools/errors.ts`
  classes); `error` is a *safe* message keyed off `code`, never raw `err.message`. Tests: boundary
  renders + reports; envelope shape + requestId.

### 44B — Tool-failure hardening (no migration)
- Harden `writeToolCall` so `tool_calls.error_message` stores the structured/redacted record; thread
  `requestId` into the tool path (`executeToolAndPersist` → `ToolRegistry.execute`) so a failure joins
  its request. Optional `ADD COLUMN error_code`. Tests: a `draft_negotiation_email` JSON-parse failure
  produces a row with **no substring of the model output** (named for the sprint); success/read-only
  paths unchanged.

### 44C — Test visibility + CI (built this pass)
- `vitest.config.ts`: `reporters` (`['default']` locally; + `junit` + `html` under `process.env.CI`) +
  `coverage` (v8, html/lcov/text, ratcheted thresholds). `playwright.config.ts`: add `['html',{open:'never'}]`.
  `package.json`: `test:coverage` script. `.gitignore`: report dirs. `.github/workflows/ci.yml`: Node ≥20.9,
  `npm ci`, **lint → typecheck → test (+coverage) → build**, upload junit/html/coverage artifacts; provide
  a throwaway `LEASELENS_SESSION_SECRET` (≥32 chars) CI env (required by `env.ts` at load). Verified by
  CI-green-on-a-PR + reports rendering (not red→green units — this slice is config/infra).

## Variance (allowed to change)
- The logger library is swappable behind `src/lib/log/`; log field names and the JSON shape are not
  frozen; coverage threshold numbers ratchet upward over time; CI job structure can evolve.

## Invariants (must not change)
- **No PII in logs or the DB error record** — structured-event allowlist + redaction + scrubbed error
  serializer; lease/clause/email content never logged or persisted raw.
- **No Pino in middleware** (Node-only); middleware only stamps the header.
- **`audit_log` success/rollback semantics untouched**; no `'failed'` status added (use `tool_calls`).
- New env var in `env.ts` (Zod) **and** `.env.example`; `// Sprint 44.x —` comments on non-trivial adds.
- No `middleware→proxy` rename; no OTel/remote sink (JSON-to-stdout is the contract — flag if OTel wanted);
  no timeouts/retries/circuit-breakers (recorded as a Nygard follow-up: the two unbounded
  `anthropic.messages.create` calls in `lease-tools.ts`). No commits until the user says so.

## Risks
- **(HIGH) A redaction miss leaks lease PII** — to stdout *or* durably to `tool_calls.error_message`.
  Mitigation: allowlist-first logging + scrubbed error serializer + the 44B regression test asserting no
  model-output substring in the persisted row. This is the gating risk for 44B.
- **(MED) CI build hangs on the `prebuild` seed** — `seed-if-empty.mjs` generates corpus embeddings via
  `@huggingface/transformers` (WASM). Mitigation: cache the model or a CI seed-skip so `next build`
  completes; resolve during 44C.
- **(MED) Stamping `x-request-id` in security-sensitive auth middleware** — its early-returns bypass the
  `response`. Mitigation: stamp once at the top for all matched paths; keep auth logic untouched; covered
  by a middleware test.
- **(LOW) Coverage-as-vanity** — mitigated by ratcheting to measured coverage, not a round number.

## Definition of Done (per sub-sprint)
Maps to `development-philosophy.md`: sprint maps back to this spec; the named tests exist and pass (or
failures are explained); no work-ahead; clean/readable code with `// Sprint 44.x —` rationale comments;
gate sweep `lint / typecheck / test` green (+ `build` only with no dev server live); a QA note appended
to `impl.md` (using the QA-report template); useful context carried forward. **44C specifically:** all
four gates green locally, `vitest --coverage` renders HTML/JUnit and enforces the ratcheted threshold,
the Playwright HTML report opens, and `ci.yml` is valid YAML mirroring the four gates (CI-green-on-a-PR
is the true gate — run on push, on request).
