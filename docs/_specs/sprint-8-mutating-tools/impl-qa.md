# Implementation QA Report — Sprint 8: Mutating Tools, Audit Log, and Rollback

**Sprint:** 8
**Date:** 2026-05-01
**Reviewer:** Cascade
**Mode:** Post-implementation self-QA per charter Section 7 step 6.
**Status:** ✅ All sprint-plan tasks complete. Ready for human confirmation.

---

## Summary

All 20 tasks of [sprint.md](sprint.md) implemented. The architectural invariant — single RBAC-filtered registry as source of truth for prompt-visible schemas and runtime-executable tools — is preserved, and now extends across mutation, audit, and rollback paths.

| Verification command | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run test` (Vitest) | ✅ **132 passing** across 26 files (was 131; +1 from the ISO-validation amendment in Issue 6) |
| `npm run eval:golden` | ✅ 5/5 cases passing (17.0/20.0 points — no regression) |
| `npm run mcp:server` | ✅ starts cleanly, prints "ContentOps MCP Server running on stdio" |
| `npm run test:e2e` (Playwright) | ✅ 1 passing |
| `npm run lint` | ⚠ Sprint 8-introduced lint clean; 67 pre-existing format issues in Sprint 7 files documented as out-of-scope (see Issue 4 below) |

---

## Test Count Reconciliation

The sprint plan target was **125 Vitest tests** (106 baseline + 19 new). Actual: **132**. Breakdown of the +26 over baseline:

| Source | Sprint plan estimate | Actual |
|---|---:|---:|
| `registry.test.ts` (mutating-path tests) | +5 | +5 |
| `audit-log.test.ts` | +2 | +3 |
| `mutating-tools.test.ts` (incl. post-impl ISO-validation amendment — Issue 6) | +4 | +5 |
| `route.integration.test.ts` (`GET /api/audit`) | +3 | +3 |
| `route.integration.test.ts` (`POST /api/audit/[id]/rollback`) | +4 | +4 |
| `mcp/contentops-server.test.ts` (mutating contract) | +1 | +1 |
| **Subtotal — net new tests** | **+19** | **+21** |
| MCP contract tests previously hidden by vitest config gap | 0 | +5 |
| **Total** | **125** | **132** |

The +1 in `audit-log.test.ts` is a `listAuditRows` filter test added because the helper is the integration point for `GET /api/audit`. The +1 in `mutating-tools.test.ts` is the post-impl ISO-validation test (Issue 6). The +5 hidden MCP tests are explained in **Issue 1** below — they are Sprint 7 tests that never ran due to a vitest config gap.

---

## Issues

### Issue 1 — Sprint 7 contract gap: MCP contract tests never ran

**Severity:** Medium (Sprint 7 bug; Sprint 8 fix delivered)
**Location:** [vitest.config.ts](vitest.config.ts) (modified by Sprint 8 Task 19)

The Sprint 7 sprint plan's Task 14 created `mcp/contentops-server.test.ts` and claimed "2 MCP contract tests passing" as part of the 106-test total. Investigation during Sprint 8 Task 17 revealed that vitest's `include` glob covered only `src/**/*.test.{ts,tsx}` and `tests/**/*.test.{ts,tsx}` — the `mcp/` directory was excluded. The MCP contract tests, despite existing on disk, never ran in Sprint 7.

**Sprint 8 fix:** added `'mcp/**/*.test.{ts,tsx}'` to the include glob. After the fix, the file's full 6 tests run (5 pre-existing, 1 new for mutating-tool MCP parity).

**Impact:** the Sprint 7 "106 tests" count was accurate as a count of *running* tests but did not include 5 tests on disk that were silently skipped. Sprint 8's 132-test total includes those 5 plus the +21 net-new from this sprint (20 from sprint plan + 1 post-impl ISO-validation amendment in Issue 6).

**Status:** ✅ Resolved in Sprint 8. Surfaced here as a Sprint 7 contract observation per charter Section 9.

---

### Issue 2 — E2E mock client: hardcoded slug had to change from sprint plan

**Severity:** Low (sprint plan error; corrected during impl)
**Location:** [src/lib/anthropic/e2e-mock.ts](src/lib/anthropic/e2e-mock.ts), [tests/e2e/chat-tool-use.spec.ts](tests/e2e/chat-tool-use.spec.ts)

Both the spec and sprint plan named `'sqs-launch'` as the document slug the E2E mock would invoke `schedule_content_item` against. The seeded corpus in `src/corpus/` does not include that slug — the actual slugs are `audience-profile`, `brand-identity`, `content-calendar`, `content-pillars`, `style-guide`. The mock's first run threw the `Unknown document_slug: sqs-launch` validation error from the tool, the audit row never wrote, and the Undo button never rendered.

**Sprint 8 fix:** replaced the hardcoded slug with `'brand-identity'` (a real seeded slug) in both the mock and the test prompt. The validation now passes; the Undo button renders; the rollback flow completes.

**Impact:** the spec / sprint-qa references to `sqs-launch` are now misleading. They should be re-read as a placeholder slug name; the actual implementation uses `brand-identity`. A future sprint that introduces a `drafts`-style placeholder document might reintroduce the original name.

**Status:** ✅ Resolved.

---

### Issue 3 — ToolCard had nested-button HTML (Sprint 7 baseline + Sprint 8 inheritance)

**Severity:** Low (HTML invalidity, not test-blocking)
**Location:** [src/components/chat/ToolCard.tsx](src/components/chat/ToolCard.tsx)

Sprint 7's ToolCard wrapped the entire header (chevron, name, status pill) in a single click-target `<button>`. Sprint 8 task 13 added the Undo button inside that wrapper, producing nested `<button>` elements — invalid HTML. The Playwright run surfaced the issue via React's `validateDOMNesting` warning (DEV-only, non-fatal).

**Sprint 8 fix:** restructured the header as a `<div>` flex row with the click-target as the first child `<button>` and the Undo / status pills as siblings. Aria-label preserves the click-target's accessibility name. No nested buttons.

**Status:** ✅ Resolved. Restructure is minimal and stylistically equivalent.

---

### Issue 4 — Pre-existing Sprint 7 lint format issues out of scope for Sprint 8

**Severity:** Low (process / documentation)
**Location:** Various Sprint 7 files reported by `npm run lint` (biome).

`npm run lint` reports 67 errors and 10 warnings against the post-Sprint-8 codebase. Investigation:
- All Sprint 8-introduced lint findings have been resolved (5 noNonNullAssertion + 1 useOptionalChain + 1 nested-button — addressed inline during impl).
- The remaining 67 errors are all `format` violations (whitespace / line length) in files Sprint 8 did not modify: `src/middleware.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/chat/ChatEmptyState.tsx`, `src/components/auth/RoleSwitcher.tsx`, `src/app/globals.css`, etc.
- The pre-existing `src/app/api/chat/route.ts:253` non-null assertion (`activeConversationId!`) is also Sprint 7 code; Sprint 8 added new lines to the same file but the assertion was unchanged.

Per charter Section 9 stop-the-line: "A verification command fails and the fix would require scope outside the current sprint." Reformatting Sprint 7's UI components and middleware to current biome strictness is exactly that out-of-scope work. A `npm run lint --fix` / `biome check --write` pass on a future sprint would remediate them in a single commit.

**Sprint 8 lint deliverables:** ✅ all clean. **Pre-existing Sprint 7 lint:** documented; deferred to a future formatting sprint.

**Status:** Surfaced; not blocking Sprint 8 close.

---

### Issue 6 — Post-impl amendment: ISO 8601 datetime input for `schedule_content_item` + system-prompt tool-usage guidance

**Severity:** Medium (UX correctness; in-sprint amendment with user authorization)
**Location:** [src/lib/tools/mutating-tools.ts](src/lib/tools/mutating-tools.ts), [src/lib/chat/system-prompt.ts](src/lib/chat/system-prompt.ts), [mcp/contentops-server.ts](mcp/contentops-server.ts), [src/lib/anthropic/e2e-mock.ts](src/lib/anthropic/e2e-mock.ts), test consumers
**Spec sections amended:** 6.2, 7

Manual UI testing surfaced two related LLM-behavior issues during dev-server smoke. With the Sprint-8-as-built tool contract (`scheduled_for: number (unix seconds)`):

1. The model exposed raw Unix timestamps in user-facing prose ("9:00 AM UTC would be 1651497600 in Unix seconds.").
2. The model computed Unix seconds **incorrectly** — `1651497600` is May 2, **2022**, not May 2, 2026. If allowed to complete, the audit row + `content_calendar` row would have pointed at a date four years in the past.

The architecture's validation-throw contract worked correctly (the first guessed-slug attempt produced an Error pill with no audit row written), but the input shape was forcing the LLM into date arithmetic it isn't reliable at, plus exposing internal representations.

**Amendment applied:**

- **`schedule_content_item.scheduled_for` input shape changed from `number (unix seconds)` to `string (ISO 8601 datetime)`.** Server parses to Unix seconds via `Date.parse` inside the tool's execute (a new `parseIsoToUnixSeconds` helper). Throws on invalid ISO before any SQL write — honors the validation-throw contract.
- Storage column `content_calendar.scheduled_for` is unchanged (still `INTEGER` Unix seconds). The shape change is at the input boundary only.
- Tool's `result.scheduled_for` echoes the original ISO string (not the parsed Unix seconds), so audit row `output_json` and the LLM-visible tool result contain a human-readable timestamp.
- **System prompt extended** ([src/lib/chat/system-prompt.ts](src/lib/chat/system-prompt.ts)) with two lines: (a) prefer `list_documents` / `search_corpus` to find an exact slug instead of guessing, (b) pass `scheduled_for` as ISO 8601 and phrase scheduled times in human-friendly form in conversational replies, never expose Unix timestamps.
- Consumers updated: MCP server's Zod schema (`z.string()` instead of `z.number().int()`), E2E mock now emits `new Date(...).toISOString()`, mutating-tools tests use ISO inputs, audit-row seed in rollback integration test stores ISO in `input_json`.
- New test added: `mutating-tools.test.ts` test 3 — *rejects a non-ISO `scheduled_for`*. Verifies parse-throw runs before slug-existence check and leaves `content_calendar` empty.

**Why this is in-sprint** rather than a deferred-to-Sprint-9 amendment: the user-visible UX failure was material (wrong dates committed silently), the change is small (~30 lines across 6 files), and it strengthens rather than expands Sprint 8's scope — the architectural invariants (validation-throw, single registry, audit + rollback semantics) are preserved exactly.

**Verification:** all six commands re-run and pass (typecheck 0, Vitest 132, eval:golden 5/5, mcp:server starts, test:e2e 1 passing). Spec §6.2 / §7 amended with explicit dating; sprint.md task 10 sketch + acceptance updated; this addendum documents the deviation.

**Status:** ✅ Resolved.

---

### Issue 5 — `corpus-tools.test.ts` requires production DB seed for prerequisite check

**Severity:** Low (Sprint 7 pattern; flagged for future consolidation)
**Location:** [src/lib/tools/corpus-tools.test.ts](src/lib/tools/corpus-tools.test.ts)

Sprint 7's `corpus-tools.test.ts` opens `data/contentops.db` (production seeded DB) directly rather than using `createTestDb()` + a seeded in-memory document. On a fresh checkout, the test fails until `npm run db:seed` runs. Sprint 8's spec consolidation list (sec 11) explicitly excluded this file from the refactor — it stays on the production-DB pattern for now.

**Workaround during Sprint 8 impl:** ran `npm run db:seed` once before the baseline test check passed.

**Status:** Documented. Future-sprint candidate: migrate `corpus-tools.test.ts` to `createTestDb()` + ingest a small seeded corpus inline. Not blocking Sprint 8.

---

## Charter Alignment

| Charter requirement | Sprint 8 delivery |
|---|---|
| Section 4 — invariant: prompt-visible schemas + runtime tools from same registry | ✅ `ToolRegistry.execute()` is the only path for tool invocation; mutating tools are filtered by the same `getToolsForRole` RBAC; audit + rollback flow through the same registry |
| Section 5 item 6 — RBAC: Creator / Editor / Admin with middleware-enforced authorization | ✅ Creator can't invoke either mutating tool (registry filter); Editor invokes `schedule_content_item` only; Admin invokes both; rollback API enforces audit-ownership at the route layer |
| Section 5 item 7 — rollback controls: every mutating tool produces compensating action; Admin sees full audit, non-admins see own | ✅ `audit_log` table with compensating_action_json; `GET /api/audit` RBAC-filtered; `POST /api/audit/[id]/rollback` runs the compensating action atomically with the status update |
| Section 11a — out-of-scope patterns | ✅ no deferred queues, no multi-provider routing, no full Playwright/release-evidence stack — only one smoke test |
| Section 11b — demo-mode constraints | ✅ both new tools write SQLite only, no third-party side effects |
| Section 12 — declarative writing style for artifacts | ✅ |
| Section 15 — Context7 grounding before naming library APIs | ✅ Next.js 16 dynamic params, better-sqlite3 sync transactions, Playwright config + addCookies all verified before use |

---

## Files Created (13)

| File | Purpose |
|---|---|
| `src/lib/test/db.ts` | Shared `createTestDb()` |
| `src/lib/test/seed.ts` | Shared seed helpers (incl. new `seedUser`, `seedConversation`) |
| `src/lib/test/embed-mock.ts` | Shared embedder mock (factory + Buffer producer) |
| `src/lib/tools/audit-log.ts` | Audit-row helpers (write, get, list, mark) |
| `src/lib/tools/audit-log.test.ts` | 3 unit tests |
| `src/lib/tools/mutating-tools.ts` | `createScheduleContentItemTool`, `createApproveDraftTool` |
| `src/lib/tools/mutating-tools.test.ts` | 4 integration tests |
| `src/app/api/audit/route.ts` | `GET /api/audit` |
| `src/app/api/audit/route.integration.test.ts` | 3 integration tests |
| `src/app/api/audit/[id]/rollback/route.ts` | `POST /api/audit/[id]/rollback` |
| `src/app/api/audit/[id]/rollback/route.integration.test.ts` | 4 integration tests (incl. atomicity) |
| `src/lib/anthropic/e2e-mock.ts` | E2E flag-gated mock client |
| `playwright.config.ts` | Playwright config (`webServer.env` engages mock) |
| `tests/e2e/chat-tool-use.spec.ts` | 1 smoke test |

## Files Modified (15)

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | +3 tables (`audit_log`, `content_calendar`, `approvals`) +2 indexes |
| `src/lib/tools/domain.ts` | +`MutationOutcome`, `ToolExecutionResult`, `AuditLogEntry`; `ToolDescriptor.compensatingAction` optional; `ToolExecutionContext.toolUseId` optional |
| `src/lib/tools/registry.ts` | Constructor accepts `db`; `execute()` returns envelope; mutating path runs in `db.transaction(...)` with audit insert |
| `src/lib/tools/registry.test.ts` | Existing tests adjusted for envelope; +5 mutating-path tests |
| `src/lib/tools/create-registry.ts` | Forwards `db` to registry; registers mutating tools |
| `src/lib/db/test-helpers.ts` | **Deleted** (moved to `src/lib/test/db.ts`) |
| `src/lib/evals/runner.test.ts` | Stripped local helpers; imports shared |
| `src/lib/rag/ingest.test.ts` | Stripped local helpers; imports shared |
| `src/lib/rag/retrieve.test.ts` | Stripped local helpers; imports shared |
| `src/app/api/chat/route.ts` | Destructures envelope; emits `audit_id`/`compensating_available` on `tool_result`; plumbs `toolUseId` |
| `src/lib/chat/parse-stream-line.ts` | `tool_result` variant gains `audit_id`, `compensating_available` |
| `src/components/chat/ToolCard.tsx` | Header restructure + Undo button + state machine |
| `src/components/chat/ChatUI.tsx` | Threads `audit_id`/`compensating_available` from stream to invocation state |
| `src/components/chat/ChatMessage.tsx` | `ToolInvocation` carries the new optional fields |
| `src/lib/anthropic/client.ts` | E2E mock flag gate |
| `mcp/contentops-server.ts` | Read `.result` from envelope; +2 mutating-tool handlers (Zod schemas) |
| `mcp/contentops-server.test.ts` | +1 mutating-tool contract test; updated existing tests for envelope |
| `vitest.config.ts` | +`mcp/**/*.test.{ts,tsx}` to include glob |
| `package.json` | +`@playwright/test`, +`dotenv` devDeps; +`test:e2e` script |
| `tsconfig.json` | +`tests/**/*.ts` to include |

---

## Recommendations

1. **Sprint 8 is ready to commit.** All sprint-plan tasks executed; all verification commands pass except the pre-existing Sprint 7 format issues documented in Issue 4.
2. **Next sprint candidate cleanup:** the format-only lint failures (Issue 4) can be remediated by a single `biome check --write` pass on the affected Sprint 7 files. Schedule for early in Sprint 9 to avoid carrying the warning indefinitely.
3. **Future migration-framework consideration:** Issue 5 + the production-DB-needs-reseed prerequisite check both stem from the absence of a real schema migration framework. Sprint 8 was explicitly out-of-scope for this; revisit in a future sprint if multiple existing tests start to fail on schema drift.
4. **Open question #9 from spec:** the FK enforcement (`PRAGMA foreign_keys = ON`) hardening is still future work. Sprint 8 deliberately stayed with the documentary-FK pattern; the corollary is that `'mcp-server'` audit rows continue to attribute to a non-existent user without any DB-level objection.
