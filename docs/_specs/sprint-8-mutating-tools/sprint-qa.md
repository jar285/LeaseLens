# Sprint QA Report — Sprint 8: Mutating Tools, Audit Log, and Rollback

**Sprint:** 8
**Reviewed:** 2026-05-01 (initial QA), 2026-05-01 (fixes applied)
**Reviewer:** Cascade
**Sprint Plan Version:** Draft (QA-revised, 2026-05-01)
**QA Mode:** Forward-looking — implementation has NOT started. This QA is the charter Section 7 step 4 gate before Task 1.
**Status:** ✅ All 15 issues resolved — sprint plan ready for human review.

---

## Summary

Sprint plan covers all 13 spec acceptance criteria and all 28 file actions in the spec's file inventory. Task ordering is dependency-correct. Library APIs verified via Context7 are used correctly in code snippets.

QA identified **15 issues**: 5 HIGH (block implementation), 5 MEDIUM (should fix), 5 LOW (wording / clarity). The HIGH issues are all concrete plumbing or test-injection gaps — none invalidate the architecture, all are fixable with localized edits.

No charter Section 9 stop-the-line triggered.

---

## Issues

### 🔴 HIGH — Must Fix

#### H1. `tool_use_id` is stored in `audit_log` but never plumbed from chat route to registry

**Location:** Tasks 5, 7, 11

The spec (Section 4.2 + open question #2) commits to storing the LLM-issued `tool_use_id` in the `audit_log.tool_use_id` column. Task 6 (`audit-log.ts`) accepts `tool_use_id` as an optional input on `writeAuditRow`. But the registry's `execute` (Task 7) never passes one in — so every audit row's `tool_use_id` is silently `NULL`, including for chat-route-originated calls where the LLM did supply an id.

The `tool_use_id` is only available at the chat route's call site (it's the `toolUse.id` from the Anthropic response). The registry has no path to receive it. `ToolExecutionContext` (Task 5 / domain.ts) has only `role`, `userId`, `conversationId`.

**Fix:**
- Task 5: add `toolUseId?: string` to `ToolExecutionContext`.
- Task 7: in the registry's mutating-execute path, pass `tool_use_id: context.toolUseId ?? null` to `writeAuditRow`.
- Task 11: at the chat route's call site, pass `toolUseId: toolUse.id` in the context object.

---

#### H2. Task 16 test 4 (atomicity) has no implementable injection path

**Location:** Task 16

Test 4 needs to verify that when `compensatingAction` throws, the audit row stays `executed` and `rolled_back_at` stays NULL. To do this, the test must inject a *throwing* `compensatingAction` for a registered tool. But the route at Task 16.1 calls `createToolRegistry(db)` internally — the test cannot supply a custom registry.

The sprint plan acknowledges this with a hand-waved hint ("the test will need to construct its own registry") but doesn't commit to a mechanism.

**Fix:** Sprint plan should commit to using `vi.mock('@/lib/tools/create-registry', () => ({ createToolRegistry: vi.fn(...) }))` to inject a registry whose mutating-tool descriptor has a throwing `compensatingAction`. Add a small helper in the test file that builds such a registry and update Task 16 test 4 description to reference it.

---

#### H3. Task 18 Playwright test uses real Anthropic; spec 12.7 says "Anthropic mock"

**Location:** Task 18

Spec section 12.7 reads: "Chat → **Anthropic mock** returns a `schedule_content_item` tool_use → ToolCard renders → Undo click → card transitions to rolled-back."

Sprint plan Task 18 hits the real Anthropic API. The test prompt assumes the LLM will choose to invoke `schedule_content_item` based on natural-language input — that's LLM-dependent and flaky. It also burns Anthropic budget on every test run.

Playwright's `page.route()` cannot intercept the dev server's outbound to Anthropic (that call happens server-side, invisible to the browser). The viable mock options are:

- **(A)** Add a `CONTENTOPS_E2E_MOCK=1` env-flag-gated mock client in `src/lib/anthropic/client.ts`. The mock returns a canned `schedule_content_item` tool_use on first call, end_turn on second. Playwright config sets the env var via `webServer.env`.
- **(B)** MSW server-side interception (heavyweight).
- **(C)** Accept LLM flakiness with `test.slow()` (rejected — violates spec).

**Fix:** Sprint plan must add a sub-task to Task 18 introducing the env-flag-gated mock client. The mock module is small (~30 lines) but needs to be a named deliverable. The current Task 18 description must be updated to reflect that the test runs against the mocked Anthropic.

---

#### H4. Playwright cookie injection breaks `SessionPayload` type contract

**Location:** Task 18.2

The snippet uses:
```typescript
const token = await encrypt({ userId: admin.id, role: 'Admin' });
```

But `SessionPayload` (verified in [src/lib/auth/types.ts](src/lib/auth/types.ts)) is:
```typescript
export interface SessionPayload {
  userId: string;
  role: Role;
  displayName: string;   // required
}
```

The snippet omits `displayName`. The TypeScript compile would fail at `npm run typecheck` once `tests/**/*.ts` is added to `tsconfig.json` `include` (Task 19).

**Fix:** Pass `displayName: admin.display_name` in the encrypt payload.

---

#### H5. `markRolledBack` is not idempotent on second call — SQL overwrites `rolled_back_at`

**Location:** Task 6.1, Task 6.2

The sprint's `markRolledBack` SQL is:
```sql
UPDATE audit_log SET status = ?, rolled_back_at = ? WHERE id = ?
```

Task 6.2 test 2 claims: "Calling `markRolledBack` twice on the same id is a no-op (idempotent UPDATE; same status)."

This is wrong. The UPDATE has no `status` filter — calling it twice will overwrite `rolled_back_at` with the second timestamp. The status doesn't change, but the timestamp does. That's not idempotent.

The route at Task 16 is correct (it checks `if (row.status === 'rolled_back') return early`), so in production `markRolledBack` is never called twice. But the helper itself promises an invariant it doesn't enforce.

**Fix:** Add a status guard to the SQL:
```sql
UPDATE audit_log SET status = 'rolled_back', rolled_back_at = ?
WHERE id = ? AND status = 'executed'
```

Now the second call is a true no-op (0 rows affected). The test description in Task 6.2 becomes accurate.

---

### 🟡 MEDIUM — Should Fix

#### M1. Test count arithmetic mismatch — sprint adds 19 new tests, says +17

**Location:** Task 8, Task 20, Completion Checklist, Outcomes, Commit Strategy

Spec Section 12.9 commits to "+17 net" (3 registry + 2 audit-log + 4 mutating + 3 audit-list + 4 rollback + 1 MCP). Sprint plan Task 8 lists 5 new registry tests, not 3. Per-task counts: 5 + 2 + 4 + 3 + 4 + 1 = **19 new tests**, total **125** Vitest tests, not 123.

The two extra tests in Task 8 (no-db registry diagnostic; validation-throw contract) are valuable and derived from the spec's HIGH findings. They should stay.

**Fix:** Update sprint plan totals consistently — Task 20 verification, Completion Checklist, Outcomes, and Commit Strategy all need "≥ 125 (106 baseline + 19 new)". Document the deviation here in sprint-qa rather than re-opening the spec (spec uses "~" so the deviation is within tolerance).

---

#### M2. Task 2.2 seed helpers are abbreviated with `/* ... */` — under-specified

**Location:** Task 2.2

The sprint plan stubs `seedConversation`, `seedDocument`, `seedChunk` bodies with `/* ... */`. An implementer cannot copy-paste these into `src/lib/test/seed.ts` — they have to reverse-engineer field shapes from the existing local test files.

**Fix:** Add a cite-and-copy directive: "Copy the existing local implementations from `src/lib/rag/retrieve.test.ts` and `src/lib/evals/runner.test.ts` verbatim. Characterization-diff (Task 3) verifies preservation."

---

#### M3. Task 3 characterization-diff commands use Unix `/tmp/` path on a Windows project

**Location:** Task 3

The diff capture commands use `> /tmp/before-runner.txt`. ContentOps runs on Windows; `/tmp/` is not a valid path.

**Fix:** Use a project-local `.gitignored` working dir:
```bash
mkdir -p .characterization-diffs
npm run test -- src/lib/evals/runner.test.ts --reporter=verbose > .characterization-diffs/before-runner.txt
```
Add `.characterization-diffs/` to `.gitignore`.

---

#### M4. Task 4 verification uses `grep` — not on Windows PowerShell PATH by default

**Location:** Task 4

`grep -rn "from '@/lib/db/test-helpers'" src/ tests/ mcp/` works under Git Bash but not PowerShell. Sprint 7 used only platform-portable commands.

**Fix:** Replace with a Grep-tool note: "Verify no remaining imports of the old path before deletion. Use the Grep tool with pattern `from '@/lib/db/test-helpers'` against `src/`, `tests/`, and `mcp/`. Both relative (`./test-helpers`) and alias forms must return zero matches."

---

#### M5. Task 19 says "verify dotenv with `npm ls dotenv`" — but it's not present

**Location:** Task 19

`grep "dotenv" package.json` returns no matches. The Playwright config (Task 18.1) imports dotenv directly. Without it as an installed dependency, `npm install` won't resolve the import; `npm run test:e2e` throws at config load.

**Fix:** Sprint plan Task 19.1 must commit to adding `dotenv` to `devDependencies`. Replace conditional language with a direct add.

---

### 🟢 LOW — Wording / Clarity

#### L1. Task 7 type cast `as Promise<unknown>` is misleading

The cast asserts the return is a Promise, true at runtime but unenforced by TypeScript. `await` on a non-Promise is harmless. The cast is superfluous.

**Fix:** Drop the cast: `const rawResult = await descriptor.execute(input, context);`

---

#### L2. Task 13 ToolCard: existing pill renders alongside new state pills

The current ToolCard renders "Done"/"Error"/"Running…" based on `hasResult`/`hasError`. Task 13's new pills render unconditionally — the user sees "Done | Rolling back…" simultaneously.

**Fix:** Suppress the existing pill when `rollbackState !== 'idle'`. Add the guard to the render snippet.

---

#### L3. Task 17 new MCP handlers' Zod schemas are not concretely sketched

**Fix:** Add explicit schema sketches for `schedule_content_item` (`{ document_slug, scheduled_for, channel }`) and `approve_draft` (`{ document_slug, notes? }`).

---

#### L4. Task 18 button selector should match `aria-label="Send message"` exactly

[src/components/chat/ChatComposer.tsx:48](src/components/chat/ChatComposer.tsx#L48) sets `aria-label="Send message"`. Sprint uses regex `/send/i`, which works but is loose.

**Fix:** Tighten to `page.getByRole('button', { name: 'Send message' })`.

---

#### L5. vi.mock alias-vs-relative path note

Existing test files mix `vi.mock('./embed', ...)` and `vi.mock('@/lib/rag/embed', ...)`. Sprint's `applyEmbedderMock` uses the alias form. Vitest resolves both to the same module — safe to swap.

**Fix:** Add a one-line note in Task 3 confirming module-identity equivalence.

---

## Verified — No Issues

| Check | Result |
|---|---|
| All 13 spec acceptance criteria map to sprint tasks | ✅ |
| All 28 file actions in spec inventory have matching tasks | ✅ |
| Task ordering respects dependencies | ✅ |
| Charter Section 4 invariant survives mutation, audit, rollback | ✅ |
| Charter Section 5 items 6 & 7 satisfied | ✅ |
| Charter Section 11a out-of-scope respected | ✅ |
| Charter Section 11b demo-mode honored | ✅ |
| Library API correctness (Next 16, better-sqlite3, Playwright) | ✅ |
| Verification commands declared after each task | ✅ |
| Final verification matches charter Section 10 | ✅ |
| Sprint 7 contracts preserved | ✅ |
| Commit Strategy follows `feat(sN):` convention | ✅ |

---

## Recommendations

1. **Apply all 5 HIGH fixes before implementation begins.** H1 (tool_use_id plumbing) and H3 (E2E Anthropic mock) are the most substantive — they require new code paths the sprint plan doesn't currently name.
2. **Apply all 5 MEDIUM fixes alongside HIGH.** All are small; four are documentation fixes that an implementer would otherwise interpret incorrectly.
3. **L1–L5 are wording.** Apply in the same edit pass.
4. **The sprint plan is otherwise sound.** Architecture, task ordering, dependency chains, and Sprint 7 contract preservation are correct.
