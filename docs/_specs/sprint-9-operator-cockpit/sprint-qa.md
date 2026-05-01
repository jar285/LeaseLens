# Sprint QA — Sprint 9: Operator Cockpit Dashboard + Typing Indicator

**Sprint:** 9
**Reviewing:** [sprint.md](sprint.md) (and consequent edits to [spec.md](spec.md))
**Date:** 2026-05-01 (review + fixes applied + re-verification)
**Reviewer:** Cascade
**Status:** All 9 findings resolved. Plan is QA-clean.

---

## Summary

Initial review of the sprint plan surfaced 9 findings: 1 HIGH (task ordering — panels import a module created later), 3 MEDIUM (eval-reports test mock fragile, test-count discrepancy with spec, E2E typing-indicator timing risk), 5 LOW (`void` cleanup in actions, bash-style redirection isn't portable to PowerShell, missing SpendPanel coverage in spec, ChatMessage test file precondition, characterization-diff path on Windows).

No findings rose to charter §9 stop-the-line. None forced a stack change, charter amendment, or scope expansion. Three findings (H1, M1, M2) required edits to **both** `sprint.md` and `spec.md`; the rest were sprint-plan-local.

After fixes, the second QA pass found no further issues. Sprint 9 is ready for implementation (charter §7 step 5).

---

## HIGH — Resolved

### H1 — Task ordering: panels (Tasks 12-17) import the actions module, which lands at Task 18

**Status:** RESOLVED — task order revised.

**Original problem.** Tasks 12-17 build the cockpit panel components. Each panel imports its corresponding refresh action from `@/app/cockpit/actions`:

```typescript
import { refreshAuditFeed } from '@/app/cockpit/actions';
import { refreshSchedule } from '@/app/cockpit/actions';
// etc.
```

But `actions.ts` is created at Task 18, which lands *after* the panel tasks. Each panel's per-task `npm run typecheck` verification step would fail because the import path does not resolve. Even with `vi.mock` in tests, the typecheck pass at the end of each panel task would error.

**Fix applied.** `actions.ts` (and its tests) moved from Task 18 → Task 11 (after queries.ts at Task 10, before any panel). RefreshButton was the original Task 11; renumbered to Task 12. Panels: 12 → 13, 13 → 14, 14 → 15, 15 → 16, 16 → 17, 17 → 18 (CockpitDashboard). Cockpit page (was Task 19) → Task 19 unchanged (already after dashboard). Header changes (was Task 20) → Task 20 unchanged. E2E (was 21-22) → 21-22 unchanged. Final verification (was 23) → 23 unchanged.

Net: only one task moved (actions-up by 7 positions); RefreshButton and panels shifted by +1. Final task count remains 23.

The new ordering preserves dependencies cleanly:
- Actions imports queries (Task 10) and eval-reports (Task 9) ✓
- RefreshButton has no dependencies on actions ✓
- Each panel imports actions (now Task 11) ✓
- Dashboard imports panels ✓
- Page imports dashboard + queries + eval-reports ✓

Sprint plan task table at the top updated accordingly.

---

## MEDIUM — All Resolved

### M1 — Eval-reports test mock uses a fragile `vi.mock('node:process')` pattern

**Status:** RESOLVED — refactored to `vi.spyOn(process, 'cwd')` pattern.

**Original problem.** Task 9's test file uses:

```typescript
vi.mock('node:process', async () => {
  const actual = await vi.importActual<typeof import('node:process')>('node:process');
  return { ...actual, cwd: vi.fn() };
});
import { cwd } from 'node:process';
// ...
(cwd as ReturnType<typeof vi.fn>).mockReturnValue(tmpRoot);
```

Two issues:
1. `vi.mock` of Node built-ins is hoisted but the destructured `cwd` import binds at module-load time — replacing the mock in `beforeEach` mutates the captured reference; works in some vitest versions but is fragile across upgrades.
2. The implementation also imports `cwd` from `node:process`. Since destructured imports of Node built-ins are bound at module load, swapping the mock doesn't always propagate.

**Fix applied.**

Implementation (`eval-reports.ts`) now uses `process.cwd()` directly (no destructured import):

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// ... (no `import { cwd } from 'node:process'`)
const dir = join(process.cwd(), 'data', 'eval-reports');
```

Test file uses `vi.spyOn(process, 'cwd')`:

```typescript
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'cockpit-evals-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
});
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});
```

This avoids mocking the module entirely; it overrides the live `process.cwd` method. Reliable across vitest versions and node versions.

Sprint.md Task 9 updated with the simpler pattern. Spec §4.6 implementation step 1 already says "`fs.readdirSync(path.join(process.cwd(), 'data', 'eval-reports'))`" — consistent, no spec change needed.

### M2 — Test count: sprint plan implies +35 new Vitest tests; spec §12.12 says +28

**Status:** RESOLVED — spec.md updated to +35; SpendPanel coverage explicitly added to spec §12.7.

**Original problem.** Counting the Vitest tests prescribed by the sprint plan, task by task:

| Task | New tests |
|---|---:|
| 3 (use-rollback) | 3 |
| 5 (TypingIndicator) | 2 |
| 6 (ChatMessage) | 3 |
| 9 (eval-reports) | 3 |
| 10 (queries) | 5 |
| 11 (actions) | 4 |
| 13 (AuditFeedPanel) | 2 |
| 14 (SchedulePanel) | 2 |
| 15 (ApprovalsPanel) | 2 |
| 16 (EvalHealthPanel) | 3 |
| 17 (SpendPanel) | 2 |
| 19 (cockpit page) | 4 |
| **Total** | **35** |

But spec §12.12 declared `+28`. The discrepancy:

- **Spec §12.5 (server actions) said 3 tests; sprint allocates 4.** The fourth test (Editor-on-`refreshApprovals` Admin-only guard) is a real test. Either spec splits into 4 or sprint folds two assertions into one `it()`. The Editor-throws-on-Approvals guard is materially different from the Creator-throws-on-everything guard — they exercise different gate functions (`requireOperator` vs `requireAdmin`). Splitting is correct.
- **Spec §12.7 (panel render) said 5 tests bundling assertions; sprint allocates 11 (one to three per panel).** Bundling empty + populated + special-case into a single `it()` is awkward. The realistic allocation is per-panel-state.
- **Spec §12.7 omitted SpendPanel entirely.** The sprint correctly added 2 tests; the spec needs to acknowledge them.

**Fix applied to `spec.md`.**

§12.5 expanded from 3 tests to 4:

> 1. `refreshAuditFeed` with Admin session: returns all rows.
> 2. `refreshAuditFeed` with Editor session: returns only own rows.
> 3. `refreshAuditFeed` with Creator session: throws (and `refreshSchedule`, `refreshSpend`, `refreshEvalHealth` likewise on Creator).
> 4. `refreshApprovals` with Editor session: throws (Admin-only guard, distinct from #3 — exercises `requireAdmin`, not `requireOperator`).

§12.7 expanded from 5 bullets covering 4 panels to **11 bullets covering 5 panels**, organized per panel:

> **AuditFeedPanel** (2)
> 1. Empty state renders "No tool actions recorded yet."
> 2. Populated state shows Undo for executed rows the viewer owns; falls back to literal `actor_user_id` when display name is null (mcp-server fallback).
>
> **SchedulePanel** (2)
> 3. Empty state.
> 4. Populated state renders the four columns.
>
> **ApprovalsPanel** (2)
> 5. Empty state.
> 6. Populated state. (Admin-only render guard is asserted in §12.6 page tests, not panel tests.)
>
> **EvalHealthPanel** (3)
> 7. Null snapshot → empty message.
> 8. Populated all-passed → green badge + headline.
> 9. Populated some-failed → amber badge + headline.
>
> **SpendPanel** (2)
> 10. Zero state renders "0", "0", "≈ $0.0000".
> 11. Populated state renders the three numbers from the snapshot.

§12.12 counts row updated:

| Category | Sprint 8 baseline | New | Sprint 9 target |
|---|---:|---:|---:|
| Vitest unit + integration + component | 132 | **+35** | **167** |
| Playwright E2E specs | 1 | +1 | 2 |
| Eval (golden) | 5/5 | 0 | 5/5 |

The 35-test net subtotal: 2 + 3 + 3 unit + 5 + 4 + 4 integration + 11 + 3 component = 35. ✓

§13 acceptance: "≥ 167 passing (132 baseline + 35 new)."

§18 commit-strategy line updated: "167+ Vitest tests passing (132 baseline + 35 new)".

§11 file inventory unchanged (the test files themselves are already listed; only the *count of `it()` blocks within them* moved).

Spec status flipped to `QA-revised, sprint-QA amended` with a third date entry.

### M3 — Typing-indicator E2E assertion (Task 21) is timing-fragile

**Status:** RESOLVED — added a stop-the-line condition + a polling note to Task 21.

**Original problem.** Task 21 inserts:

```typescript
await page.getByRole('button', { name: 'Send message' }).click();
const indicator = page.getByRole('status', { name: 'Assistant is composing' });
await expect(indicator).toBeVisible({ timeout: 5000 });
```

The indicator is mounted when `status === 'streaming' && content === '' && toolInvocations.length === 0` (spec §4.9). It unmounts the moment a `tool_use` event arrives (the existing E2E mock's deterministic response). If the mock returns the `tool_use` faster than Playwright's first poll cycle (~100ms), the indicator was visible for, say, 50ms, and `toBeVisible` may not catch it.

**Fix applied.**

1. **Sprint.md Task 21** updated with a polling note:

    > **Timing note.** The indicator unmounts when the first `tool_use` event arrives. If the E2E mock's first response lands faster than Playwright's first poll cycle (~100ms), this assertion can flake. Mitigations available if it surfaces:
    >
    > (a) Add a small artificial delay in `src/lib/anthropic/e2e-mock.ts` (e.g., `await sleep(150)` before the first tool_use chunk) — gates the indicator's visibility window above Playwright's poll interval. Preferred.
    > (b) Use `page.waitForFunction(() => document.querySelector('[role="status"][aria-label="Assistant is composing"]') !== null, { timeout: 1000 })` which can fire on a 10ms internal microtask. Acceptable fallback.
    >
    > Run the spec 10× locally before declaring the task complete; if any run fails on this assertion, apply (a).

2. **Sprint.md stop-the-line checklist** gains a new bullet:

    > - Task 21's typing-indicator assertion flakes more than once in 10 local runs → apply mitigation (a) from the task body before continuing. Do not weaken the assertion to `not.toBeVisible({ timeout: 0 })` or remove it.

No spec change — the spec correctly described the indicator's visibility window; the timing issue is implementation-side.

---

## LOW — All Resolved

### L1 — `void` patterns in `actions.ts` are awkward

**Status:** RESOLVED.

**Fix.** Sprint.md Task 11 (renumbered from Task 18) removes the `void session` and `void requireOperator(...)` constructs:

```typescript
// Before:
export async function refreshSpend(): Promise<{ spend: SpendSnapshot }> {
  void requireOperator(await resolveSession());
  return { spend: getTodaySpend(db) };
}

// After:
export async function refreshSpend(): Promise<{ spend: SpendSnapshot }> {
  requireOperator(await resolveSession());
  return { spend: getTodaySpend(db) };
}
```

`requireOperator` and `requireAdmin` are called for their throw-side-effect; the return value is intentionally discarded. Modern Biome / TypeScript flag uncaptured returns only when the function is a pure expression — these aren't. No `void` needed.

### L2 — Bash-style redirection (`tee`, `/tmp/`) won't run in PowerShell

**Status:** RESOLVED.

**Fix.** Sprint.md Task 4 characterization steps now use OS-agnostic redirection and a project-relative path (gitignored):

```bash
npm run test -- src/components/chat/ToolCard.test.tsx > tmp/toolcard-before.txt 2>&1
# ... apply edits ...
npm run test -- src/components/chat/ToolCard.test.tsx > tmp/toolcard-after.txt 2>&1
diff tmp/toolcard-before.txt tmp/toolcard-after.txt
```

A note added to the task: "If `tmp/` does not exist, create it via `mkdir tmp` (or `New-Item -ItemType Directory tmp` in PowerShell). The `tmp/` directory should be in `.gitignore` already; if it isn't, add it before running."

`diff` is cross-platform (Git Bash on Windows ships `diff`; PowerShell users can run via Git Bash or use `Compare-Object` as fallback). The Windows `Compare-Object` fallback is documented in the task body for completeness.

### L3 — Spec §12.7 omitted SpendPanel coverage

**Status:** RESOLVED via M2 (spec §12.7 now includes 2 SpendPanel tests).

### L4 — Task 6 ChatMessage test file may not exist yet

**Status:** RESOLVED — task hedged correctly.

**Original concern.** The codebase may not have `src/components/chat/ChatMessage.test.tsx`. Task 6 says "If `ChatMessage.test.tsx` does not exist yet, create it..." — this is correct hedging. Verified via grep: file does NOT exist as of Sprint 8 commit. Task 6 will create it.

No fix needed beyond the existing hedging text. Spec §11 file inventory updated to mark `src/components/chat/ChatMessage.test.tsx` as **Created** rather than left ambiguous.

### L5 — Characterization-diff path on Windows

**Status:** RESOLVED via L2.

The `tmp/` project-relative path replaces `/tmp/`. Same fix as L2.

---

## Cross-cutting fix: spec status line

Spec.md status line was `**Status:** QA-revised`. After the sprint-QA round forced spec edits (M2: §12.5/§12.7/§12.12/§13/§18 all changed), the status moved to:

```
**Status:** QA-revised; sprint-QA amended
**Date:** 2026-05-01 (drafted), 2026-05-01 (QA fixes applied), 2026-05-01 (sprint-QA amendments — §12.5/§12.7/§12.12/§13/§18 test counts and panel-test enumeration)
```

Spec.md changelog references in the body do not change.

---

## Re-verification after fixes

After applying every fix, both `sprint.md` and `spec.md` were re-read end-to-end. Specific checks:

1. **Cross-reference consistency.** Every "Task N" reference in `sprint.md` resolves to the correct task after the H1 reorder. Every "§X.Y" reference in `spec.md` resolves to the correct (renumbered) section.
2. **Task ordering.**
    - Tasks 1-10: data-layer foundations, no Sprint-9 cross-deps.
    - Task 11: actions (depends on queries + eval-reports — both done).
    - Task 12: RefreshButton (no deps).
    - Tasks 13-17: panels (depend on actions + RefreshButton + types — all done).
    - Task 18: dashboard (depends on panels — done).
    - Task 19: page (depends on dashboard + queries + eval-reports — done).
    - Task 20: page.tsx header (no deps).
    - Tasks 21-22: E2E.
    - Task 23: final verification.
    - Dependency graph is now acyclic and forward-only. ✓
3. **Test counts reconcile.**
    - sprint.md per-task: 3 + 2 + 3 + 3 + 5 + 4 + 2 + 2 + 2 + 3 + 2 + 4 = 35 ✓
    - spec.md §12.12 says +35 → 167 ✓
    - spec.md §13 says ≥167 ✓
    - spec.md §18 commit-strategy says 167+ ✓
    - sprint.md prerequisite count says 132 baseline ✓
    - sprint.md Task 23 says ≥167 ✓
4. **Eval-reports test pattern.** Implementation uses `process.cwd()` (not destructured); test uses `vi.spyOn`. Both modules consistent.
5. **`actions.ts` shape.** No `void` patterns. `requireOperator` and `requireAdmin` invoked for their throw-side-effect. `refreshApprovals` calls `requireAdmin` (not `requireOperator`).
6. **Architectural invariant.** Cockpit reads through helpers; the only mutating path (Undo) flows through the existing `POST /api/audit/[id]/rollback` which routes through the registry's compensating-action hook. Sprint 9 introduces zero new mutating paths. Invariant intact.
7. **Charter §9 stop-the-line conditions.** Re-read: nothing in the patched plan triggers a stop-the-line. The sprint-plan stop-the-line checklist itself gained one bullet (E2E typing-indicator flake threshold) — that's a per-task gate, not a sprint-wide stop.

---

## What does *not* need to change

- Task ordering of the chat-side tasks (Tasks 3-8) — characterization discipline + bottom-up assembly is correct.
- Cite-and-copy notes for `useRollback` (Task 3) and queries.ts SQL shapes (Task 10) — accurate against current codebase.
- Server-action runtime declaration (Task 11) — explicit `runtime = 'nodejs'` retained per spec §8 / §16.
- Cockpit page test mocks for `next/navigation` and `next/headers` (Task 19) — patterns work; no library-version concerns.
- Cockpit E2E spec dependency on the chat tool flow as a row-seeder (Task 22 `beforeEach`) — fine because Playwright tests run sequentially and Sprint 8's chat-tool-use spec already proves the seeding path. The cockpit spec's `beforeEach` independently re-seeds; cross-spec ordering is not assumed.
- Final verification command list (Task 23) — six commands match charter §7 step 6 + Sprint 8 baseline.

---

## Verification artifacts

- Sprint plan: [sprint.md](sprint.md) (status: **QA-revised**, dated 2026-05-01).
- Spec amendments: [spec.md](spec.md) (status: **QA-revised; sprint-QA amended**).
- This QA file: [sprint-qa.md](sprint-qa.md) (this document).
- No code changes in the QA pass — sprint and spec are the artifacts.

**Outcome:** Sprint 9 is ready for implementation per charter §7 step 5.
