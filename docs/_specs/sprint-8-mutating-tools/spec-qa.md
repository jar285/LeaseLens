# QA Report — Sprint 8 Spec: Mutating Tools, Audit Log, and Rollback

**Date:** 2026-05-01 (initial QA), 2026-05-01 (fixes applied + re-pass)
**Reviewer:** Cascade
**Artifact:** `docs/_specs/sprint-8-mutating-tools/spec.md`
**Status:** ✅ All issues resolved — spec clean on second pass

---

## Summary

The spec is **fundamentally sound**. The architectural invariant (single registry as source of truth for prompt-visible tools and runtime execution) is honored across the new mutation, audit, and rollback paths. The better-sqlite3 sync-transaction constraint is correctly identified and used to drive the mutating-tool execute signature. RBAC flows through the existing registry. Test consolidation is well-scoped and the Playwright introduction is minimal.

QA identified **13 issues**: 4 HIGH (must fix before sprint plan), 5 MEDIUM (should fix), 4 LOW (wording / clarity). None of the findings invalidate the core architecture — every issue is addressable with a localized spec edit, not a redesign. None rise to charter Section 9 stop-the-line.

QA pass used Sequential Thinking (7 passes) per charter Section 7 step 2 / Section 15b for the gap-finding phase.

---

## Issues

### 🔴 HIGH — Must Fix

#### H1. Timestamp convention mismatch with the rest of the codebase

**Spec Section:** 4.2, 4.3, 6.1, 6.2
**Problem:** The spec specifies `audit_log.created_at` and `rolled_back_at` as `INTEGER NOT NULL` in "Unix milliseconds" (Section 4.2), and the Section 4.3 pseudocode uses `created_at: Date.now()` (milliseconds). The same drift appears in Section 6.1 (`content_calendar.created_at`, `approvals.created_at`) and Section 6.2 (`scheduled_for: number (unix ms)`).

The existing codebase is uniformly Unix **seconds**. Confirmed across:
- `src/db/seed.ts:18` — `const now = Math.floor(Date.now() / 1000);`
- `src/app/api/chat/route.ts:43, 174, 388, 501, 511` — same pattern
- `src/lib/db/rate-limit.ts:10` — same pattern
- `src/lib/auth/session.test.ts:29` — same pattern
- All existing `created_at` columns in `users`, `conversations`, `messages`, `documents`, `chunks`

If the spec ships as written, audit timestamps would be in milliseconds while every other timestamp in the same database is in seconds. Filtering and sorting `audit_log.created_at` next to `messages.created_at` (e.g., for a future cockpit timeline) would silently produce nonsense.

**Fix:** Change all timestamp specifications to Unix **seconds**:
- Section 4.2: "Timestamps are `INTEGER NOT NULL` (Unix **seconds**) to match the existing schema convention."
- Section 4.3 pseudocode: `created_at: Math.floor(Date.now() / 1000)`.
- Section 6.1: `scheduled_for INTEGER NOT NULL` is unambiguous in the SQL but state in prose that it stores Unix seconds.
- Section 6.2: `scheduled_for: number (unix seconds)`.

---

#### H2. `audit_id` is splatted into the tool result envelope, leaking to the LLM and persisted messages

**Spec Section:** 4.3, 7
**Problem:** Section 4.3 pseudocode returns `{ ...outcome.result, audit_id }` from the registry's mutating-execute path. Section 7 says the chat route reads `audit_id` from the result envelope.

This means `audit_id` becomes a field on the tool's *logical result* — the same object the LLM sees as the `tool_result` content and the same object persisted to the `messages` table at [route.ts:479+](src/app/api/chat/route.ts#L479). Three concrete failures follow:

1. **Schema drift.** The tool's declared `output` (e.g., `{ schedule_id }` for `schedule_content_item`) acquires an undeclared field. The model may try to reason about or surface `audit_id` to the user.
2. **History pollution.** The `tool_result` message persisted to SQLite contains an `audit_id` that has nothing to do with the tool's semantics. Future history replay sees implementation-detail leakage.
3. **MCP contract drift.** The MCP server returns the same registry result. MCP clients would see `audit_id` in their tool result payload — an internal ContentOps concern leaking across the MCP boundary.

**Fix:** Make `audit_id` an envelope field, not part of the result. Recommended shape: `ToolRegistry.execute()` returns `{ result, audit_id?: string }` for **all** calls (read-only tools return `{ result, audit_id: undefined }`). The chat route reads `result` for the persisted message body and the `tool_result` event's `result` field; it reads `audit_id` separately for the new `audit_id` and `compensating_available` NDJSON fields.

This is a small breaking change to the registry's return type (currently `Promise<unknown>`). Update Section 4.3 pseudocode, Section 5 type definitions, Section 7 chat-route changes, and Section 11 file inventory (registry.test.ts will need updates beyond the audit-hook tests).

---

#### H3. `audit_log.actor_user_id` FK is documentary only, and the MCP actor is not a real user

**Spec Section:** 4.2, 4.7, 11
**Problem:** Section 4.2 declares `actor_user_id TEXT NOT NULL REFERENCES users(id)`. Two related gaps:

1. **FK enforcement is off project-wide.** No `PRAGMA foreign_keys = ON` is set anywhere in the codebase (verified via grep). SQLite defaults to FK enforcement *off*. Every `REFERENCES` clause in `src/lib/db/schema.ts` is documentary only at runtime today. Adding another such clause to `audit_log` is not wrong, but the spec implies enforcement that doesn't exist.
2. **MCP actor is not a real user row.** Section 4.7 acknowledges that MCP-originated audit rows attribute to actor `mcp-server` / role `Admin` (the hardcoded `MCP_CONTEXT` at [mcp/contentops-server.ts:18-22](mcp/contentops-server.ts#L18-L22)). The string `'mcp-server'` is **not** present in `users.id`. If FK enforcement were ever turned on (a sensible future hardening), every MCP-originated mutation would fail at the audit insert, which would roll back the mutation itself — a major regression introduced silently.

**Fix:** Pick one of the following and call it out in Section 4.2 / 4.7 explicitly:

- **(A) Drop the FK clause.** `actor_user_id TEXT NOT NULL` only. Note that integrity is enforced by the chat route / MCP server layer, not the database. Simplest, matches current state, makes the documentary nature of FKs explicit. **Recommended for Sprint 8.**
- **(B) Seed an `mcp-server` system user row.** Add to `DEMO_USERS` in [src/lib/auth/constants.ts](src/lib/auth/constants.ts). FK clause stays. More principled but adds a synthetic user for every demo install.
- **(C) Make `actor_user_id` nullable.** Allows null for MCP-originated entries. Loses information ("who did this?") and complicates the RBAC filter in Section 4.5.

If (A) is chosen, also add a Section 14 open question / open-followup noting that turning on `PRAGMA foreign_keys = ON` would be a future-sprint hardening that requires a synthetic system user.

---

#### H4. Rollback authorization is independent of current tool roles — policy must be declared

**Spec Section:** 4.4
**Problem:** Step 3 of the rollback path says "Admin can roll back any row; Editor and Creator only rows where `actor_user_id === sessionUserId`." This is **audit ownership** RBAC. But it does not check the descriptor's current `roles` array.

Concrete failure: an Editor invokes `schedule_content_item` (allowed — descriptor.roles includes Editor). The Admin later demotes the user to Creator. The user (now Creator) calls `POST /api/audit/<id>/rollback`. They own the row, so audit RBAC passes. The endpoint then invokes `descriptor.compensatingAction(...)` — running mutation logic on a tool whose `roles` no longer includes Creator.

This is a real ambiguity in the architectural invariant. Two defensible policies:

- **(P1) Rollback respects audit ownership only.** A user can always undo their own past actions, even if their role has changed. Simpler, matches typical "Undo" UX expectations.
- **(P2) Rollback respects current `descriptor.roles`.** A user can only undo actions for tools they currently have access to. Stricter, preserves the architectural invariant under role demotion.

The role-overlay UX in ContentOps (anonymous demo visitors can switch roles) makes this a real edge case, not theoretical. ContentOps doesn't currently demote users mid-session, but the role overlay can flip an Editor session to Creator — and a subsequent Undo click would exhibit exactly this behavior.

**Fix:** Add an explicit policy decision to Section 4.4 step 3 and to Section 14 Open Questions. Recommend **P1** (audit ownership only) — Undo is intuitively about your own past actions, role demotion does not erase historical responsibility — but call it out and tie it to the architectural invariant: rollback is not a tool invocation in the same sense; it executes a pre-recorded compensating action whose authorization was already gated at the original mutation site.

---

### 🟡 MEDIUM — Should Fix

#### M1. Validation failure semantics (throw vs return error) are unspecified

**Spec Section:** 6.2, 6.3, 4.3
**Problem:** Section 6.2 says `schedule_content_item` "Validates the slug exists in `documents`." But the spec does not declare what happens on validation failure. Two paths produce very different audit semantics:

- **(A) Throw.** Invalid slug → execute throws → registry transaction rolls back → no audit row. The user sees a `tool_result` event with an `error` field.
- **(B) Return error result.** Invalid slug → execute returns `{ result: { error: '...' }, compensatingActionPayload: {} }` → the audit row is written for an action that *did not actually mutate state*. The Undo button appears on a non-mutation. Clicking it runs a compensating action against state that doesn't exist.

(B) corrupts the audit log with non-mutations and produces meaningless Undo buttons. (A) is correct.

**Fix:** Add to Section 4.3 (or a new Section 4.8 "Tool execution contract"): "A mutating tool's `execute` MUST throw on validation failures and any other condition that would prevent the actual mutation. Returning a `MutationOutcome` is a commitment that the mutation has occurred."

---

#### M2. `GET /api/audit` no-cookie behavior is unspecified

**Spec Section:** 4.5, 8.1
**Problem:** The spec describes RBAC filtering for Admin / Editor / Creator sessions but does not say what happens for a request with no `contentops_session` cookie. The chat route at [route.ts:111-124](src/app/api/chat/route.ts#L111-L124) falls back to the Creator demo user and proceeds. Should `/api/audit` do the same?

**Fix:** Section 8.1 should declare: "Requests without a session cookie are treated as the Creator demo user, identical to the chat route fallback. The RBAC filter then returns 0 rows because the Creator demo user has not authored any audit entries (Creators cannot invoke mutating tools)."

#### M3. `POST /api/audit/[id]/rollback` no-cookie behavior is unspecified

**Spec Section:** 4.4, 8.2
**Problem:** Same gap as M2 for the rollback endpoint. Without an explicit policy, the implementation may differ between routes — one returning 401, the other defaulting to Creator.

**Fix:** Section 8.2 should declare: "Requests without a session cookie are treated as the Creator demo user. Since Creators have no audit rows of their own, the RBAC check at step 3 fails (the row is not owned by the Creator demo user); response is 403."

#### M4. Atomicity test for compensating-action failure is missing

**Spec Section:** 12.5
**Problem:** Section 4.4 step 7 commits to a strong invariant: if `descriptor.compensatingAction` throws, the entire transaction rolls back and the audit row stays `executed`. But Section 12.5 lists three rollback tests (admin-rollback-anyone, non-admin-cannot-rollback-others, idempotent-rollback) — none of them exercise the throw path. The most load-bearing claim of the rollback design is untested.

**Fix:** Add a fourth test to Section 12.5: "Compensating action throws → audit row stays `executed`, no UPDATE applied, error surfaced. Verifies the transaction-rollback contract."

#### M5. Playwright cookie-injection mechanism is unspecified

**Spec Section:** 10.4
**Problem:** Section 10.4 says "test seeds an Admin session via cookie injection" but does not say how. The session cookie is signed (per Sprint 2's design). Tests need access to the signing secret and the encrypt() function, OR a test-only seed endpoint, OR a mocked session resolver.

**Fix:** Section 10.4 should commit to one mechanism. Recommended: "The Playwright test imports the existing `encrypt()` helper from `src/lib/auth/session.ts` and signs a session cookie with the test environment's `CONTENTOPS_SESSION_SECRET`. No new test-only API routes are introduced. The signing secret is loaded from `.env.local` via Playwright's `webServer.env`."

---

### 🟢 LOW — Wording / Clarity

#### L1. Section 13 acceptance criterion for Editor doesn't address `approve_draft`

**Spec Section:** 13
**Problem:** "Editor: can invoke `schedule_content_item`; can roll back own; cannot roll back others." This is incomplete — Editor must also be **denied** access to `approve_draft` (Admin-only). The spec relies on the registry's RBAC filter to enforce this, but the acceptance criterion does not state the negative case.

**Fix:** Change to: "Editor: can invoke `schedule_content_item`; **cannot invoke `approve_draft`**; can roll back own; cannot roll back others."

#### L2. Section 10.1 has an inverted phrase

**Spec Section:** 10.1
**Problem:** "Vitest is configured via Playwright's separate file to avoid double-runs." Direction is reversed — Playwright is the new tool getting its own config; Vitest already has one.

**Fix:** "Playwright is configured via its own `playwright.config.ts`, separate from `vitest.config.ts`, to avoid double-runs (Vitest's `tests/**/*.test.{ts,tsx}` include pattern does not match `*.spec.ts`)."

#### L3. Section 8.1 anonymous handling could be more explicit about the no-cookie path

**Spec Section:** 8.1
**Problem:** Tied to M2 above. Even after fixing M2, Section 8.1's RBAC bullet should explicitly state: "No cookie → Creator default → 0 rows" alongside the existing "Creator role: 0 rows" bullet.

**Fix:** Wording change once M2 is resolved.

#### L4. Spec does not call out that Playwright introduction is non-conflicting with charter Section 11a

**Spec Section:** 10.4 or 15
**Problem:** Charter Section 11a lists "Playwright + Lighthouse + release evidence scripts" under "Explicitly NOT borrowed from Ordo." A future reader scanning the charter alongside this spec might think Sprint 8 violates Section 11a. It does not — Section 11a is about *Ordo's* full Playwright + Lighthouse + release-evidence stack, not Playwright itself; the user authorized a single smoke test at session start.

**Fix:** Add a brief note to Section 10.4 or to Section 15 reference alignment: "Playwright introduction is consistent with charter Section 11a: that section excludes Ordo's full Playwright + Lighthouse + release-evidence stack from ContentOps. Sprint 8 introduces a single smoke test, not the full stack. Authorization for the introduction comes from the session-start instruction set; nothing in the charter prohibits Playwright as a standalone E2E runner."

---

## Verification Checks

| Check | Result |
|---|---|
| Charter Section 4 invariant survives mutation, audit, and rollback paths | ✅ Yes — registry remains the single source of truth; rollback uses descriptor-resident `compensatingAction` |
| Charter Section 5 item 6 (RBAC) addressed | ✅ Yes — registry filtering + per-route checks |
| Charter Section 5 item 7 (rollback controls + audit visibility) addressed | ✅ Yes — `/api/audit` RBAC-filtered, ToolCard Undo affordance |
| Charter Section 11b (demo-mode constraint — no third-party side effects) honored | ✅ Yes — both new tools are SQLite-only |
| Sprint 7 contracts preserved (read-only tools, MCP server, message persistence) | ✅ Yes — read-only path unchanged; MCP server gets new tools automatically |
| better-sqlite3 sync-transaction constraint correctly handled | ✅ Yes — Section 4.1 commits to sync mutating execute, verified via Context7 |
| Next.js 16 dynamic-route handler signature correct | ✅ Yes — `params: Promise<{ id: string }>` with `await params`, verified via Context7 |
| Timestamp convention matches existing codebase | ❌ **No — H1** |
| `audit_id` does not leak into tool result | ❌ **No — H2** |
| `actor_user_id` is consistent with seeded users | ❌ **No — H3** (works today only because FK enforcement is off) |
| Rollback authorization policy is unambiguous | ❌ **No — H4** |
| Validation-failure path is specified | ❌ **No — M1** |
| No-cookie behavior is specified for new routes | ❌ **No — M2, M3** |
| Critical atomicity claims are tested | ❌ **No — M4** |
| Test architecture consolidation is well-scoped | ✅ Yes — 3 deduplications + Playwright smoke, no spillover |
| Playwright introduction does not conflict with charter | ✅ Yes — but should be called out explicitly (L4) |

---

## Recommendations

1. **Fix H1–H4 before drafting `sprint.md`.** All four are localized spec edits, but each affects multiple sections. Re-pass the spec end-to-end after fixes to catch any cascading wording inconsistencies.
2. **Fix M1–M5 alongside H-fixes.** They are smaller but each closes a real ambiguity that would surface during implementation as "what does the spec actually want here?" A spec that needs interpretation during implementation has failed its purpose.
3. **L1–L4 are wording.** Apply during the same edit pass; do not re-QA for these alone.
4. **The architecture is sound.** None of the findings require a redesign. The better-sqlite3 sync constraint is correctly handled, the registry remains the single source of truth, and the rollback machinery is colocated with the descriptor — all the load-bearing decisions hold.
5. **No charter Section 9 stop-the-line triggered.** Continue to sprint plan drafting after fixes are confirmed.
