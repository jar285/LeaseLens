# Spec QA — Sprint 11: Workspaces & Brand Onboarding

**Sprint:** 11
**Reviewing:** [docs/_specs/sprint-11-workspaces-brand-onboarding/spec.md](spec.md)
**Date:** 2026-05-04 (initial review + fixes applied + re-verification)
**Reviewer:** Cascade
**Status:** All 10 findings resolved. Spec is QA-clean.

---

## Summary

Initial review surfaced **10 findings**: 3 HIGH (documents.slug UNIQUE constraint conflict; workspace-expiry gray-state handling between cookie and `expires_at`; broader test-file sweep for `ToolExecutionContext.workspaceId` not enumerated), 4 MEDIUM (sample-workspace UUID computation convoluted; multipart MIME-vs-filename validation; test-baseline not pinned; audit-rollback cross-workspace clarification), 3 LOW (system-prompt template formatting; WorkspaceHeader vs inline header span; documentary-FK posture for new column).

No findings rise to charter §9 stop-the-line — none force a stack change, charter amendment, or scope expansion. The architectural invariant survives: workspaces add a tenant column to existing tables; the registry, RBAC, audit, rollback, and MCP paths all stay intact, just receiving an extra context parameter.

After fixes, the second QA pass found no new issues. Sprint 11 spec is ready for sprint-plan drafting.

---

## HIGH — All Resolved

### H1 — `documents.slug UNIQUE` is enforced at the table level on fresh DBs; composite UNIQUE INDEX does not override it

**Status:** RESOLVED

**Original problem.** Spec §4.1 / §14 claimed the existing `slug TEXT UNIQUE NOT NULL` in `CREATE TABLE documents` becomes "documentary" on Sprint 11, with workspace-scoped uniqueness handled by an additional `CREATE UNIQUE INDEX (slug, workspace_id)`. This is wrong on SQLite. UNIQUE column constraints in `CREATE TABLE` are *not* documentary — they're enforced via an internal automatic UNIQUE INDEX that fires on every INSERT regardless of any additional indexes. (FK clauses are documentary because they need `PRAGMA foreign_keys = ON`; UNIQUE has no such switch.) On a fresh DB built from the SCHEMA constant, the second workspace's "brand-identity" slug would be rejected.

**Fix applied.**

§4.1 schema: the `documents` table's `slug` column declaration drops the `UNIQUE` keyword. The composite uniqueness moves into a `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id)` line in the SCHEMA constant. New `:memory:` DBs and fresh production DBs both get the composite-only constraint from the start.

§14 Schema-collision tradeoff: rewritten. Option A is now "drop the column-level UNIQUE in SCHEMA + add composite UNIQUE INDEX." Existing dev databases keep the old column-level UNIQUE in their stored schema; the spec explicitly tells operators to run `npm run db:seed` (which truncates + reseeds) for a clean slate after pulling Sprint 11. This matches the demo-grade posture from Sprint 8 §3 (no migration framework).

§4.1 also adds a verification-fixture note: `migrate.test.ts` writes a row to two different workspaces with the same slug and asserts both INSERTs succeed against an in-memory DB built from the new SCHEMA.

### H2 — Workspace expiry between cookie validity and `expires_at` is ambiguous

**Status:** RESOLVED

**Original problem.** A workspace's `expires_at` and its cookie's JWT `exp` are both 24h from create time, but they tick at different precisions and the lazy-purge only runs on next workspace create. There's a window where the cookie is still valid but the workspace's `expires_at` has passed. Spec §4.7 / §4.12 didn't specify whether the chat route and cockpit treat such workspaces as live.

**Fix applied.**

New §4.13 "Workspace expiry semantics" subsection:

> A workspace is *active* when its row exists AND (`is_sample = 1` OR `expires_at > unixepoch()`). Read paths (chat route, cockpit page, MCP context resolution) check this predicate, not just row existence. An expired-but-not-yet-purged workspace is treated as if not present: clear the cookie, redirect to `/onboarding`. Helper: `getActiveWorkspace(db, id): Workspace | null` in `src/lib/workspaces/queries.ts` encapsulates the predicate; every read site uses it instead of bare `getWorkspace`.

§5 domain types: `getActiveWorkspace` added to the queries module's exports.

§11.1 unit tests: `queries.test.ts` gains a fifth test — "getActiveWorkspace returns null for an expired non-sample workspace." Now 5 query tests instead of 4.

§17 risk-register row "Workspace cookie outlasts the workspace it points to" rewritten to cite the §4.13 mechanism.

### H3 — Test-file sweep for `ToolExecutionContext.workspaceId` is not exhaustive in the file inventory

**Status:** RESOLVED

**Original problem.** Adding `workspaceId: string` as a required field on `ToolExecutionContext` is a breaking change for every test that constructs a context. §8 listed `src/lib/test/seed.ts` and "Existing tests touching `seedDocument` / `seedChunk`" but didn't enumerate the actual test files that build `ToolExecutionContext` directly. There are at least three I can name from prior sprints: `registry.test.ts`, `mutating-tools.test.ts`, `audit-log.test.ts`. Possibly more. The sprint plan needs the exact list.

**Fix applied.**

§8 file inventory adds an explicit "Modified — test files that construct `ToolExecutionContext`" sub-table:

| File | Change |
|---|---|
| `src/lib/tools/registry.test.ts` | Add `workspaceId` to every test-context literal |
| `src/lib/tools/mutating-tools.test.ts` | Add `workspaceId` to every test-context literal |
| `src/lib/tools/audit-log.test.ts` | Add `workspaceId` to every test-context literal |
| `src/app/api/audit/[id]/rollback/route.integration.test.ts` | If the test seeds audit rows directly, add `workspace_id` to the INSERT (audit-log table now has the column) |
| `src/app/api/chat/route.integration.test.ts` | Same — any direct INSERT into per-data tables needs `workspace_id` |

§17 risk row "Test sweep misses a context construction site → typecheck or test failure" added with mitigation: "grep audit before sprint-plan drafting; the sprint plan task list enumerates each affected file."

The grep audit itself is deferred to sprint-plan drafting — the spec's job is to commit to the sweep, not to enumerate every line.

---

## MEDIUM — All Resolved

### M1 — Sample workspace UUID literal computation is convoluted

**Status:** RESOLVED

**Original problem.** Spec §4.1 / §5 used `'00000000-0000-0000-0000-00000000sample'.padEnd(36, '0').slice(0, 36)` — a 38-char string sliced to 36 to form a UUID-shaped literal. Final string is `'00000000-0000-0000-0000-00000000samp'` ("le" sliced off). Cute but obscure. The pattern of "encode-the-name-in-the-UUID" doesn't survive the slice.

**Fix applied.**

§5 / §4.2 use a clean fixed UUID:

```typescript
export const SAMPLE_WORKSPACE = {
  id: '00000000-0000-0000-0000-00000000sample',  // <- WAS
  // becomes:
  id: '00000000-0000-0000-0000-000000000010',     // 36-char clean literal
  name: 'Side Quest Syndicate',
  description:
    'A gaming content brand for players who treat every session as an adventure worth talking about.',
} as const;
```

Numeric suffix `0010` keeps it distinct from `DEMO_USERS` UUIDs (`...0001` Creator, `...0002` Editor, `...0003` Admin). No clever encoding; just a stable readable literal.

§4.1 also drops the `.padEnd(36, '0').slice(0, 36)` pattern from the migrate function — references `SAMPLE_WORKSPACE.id` directly.

### M2 — Multipart upload validates MIME but not filename extension

**Status:** RESOLVED

**Original problem.** Spec §6.2 / §11.3 validates MIME types `text/markdown` or `text/plain`. But browsers inconsistently report MIME for `.md` files — some send `application/octet-stream`, some send `text/x-markdown`, etc. A defensive validator should also check the filename extension.

**Fix applied.**

§6.2 (UploadForm) and §4.4 (`POST /api/workspaces` route validation) extended:

- Server-side validation accepts a file if EITHER: (a) MIME is `text/markdown` or `text/plain`, OR (b) filename ends in `.md` (case-insensitive).
- Both checks fail → 400 with error referencing the specific file's field name.
- Client-side `<input>` accept attribute stays as `.md,text/markdown,text/plain` — that's a hint to the OS file picker, not a real constraint; server-side is authoritative.

§11.3 ingest-upload tests gain one case: "file with `.md` extension and `application/octet-stream` MIME is accepted (5 cases instead of 4)."

§17 risk row "Upload route accepts oversized or malformed file" remains; the new MIME-or-extension fallback expands its coverage.

### M3 — Test baseline not pinned; spec says "TBD ≈ 168-185"

**Status:** RESOLVED

**Original problem.** §11.10 lists baseline as "TBD (≈ 168-185 from Sprint 9 + Sprint 10)" — too vague for sprint-plan to verify against.

**Fix applied.**

The Sprint 10 commit (`1f646c7 implemented sprint10`) is on `main`. The sprint-plan's prerequisite preflight will run `npm run test` once and pin the actual baseline. The spec leaves a marker:

> §11.10: Baseline is the post-Sprint-10 Vitest count, confirmed at sprint-plan preflight (likely 170-180; Sprint 9's 168 + Sprint 10's polish-related additions). Sprint 11 target = baseline + 33 net-new (10 unit + 5 ingest + 6 API + 3 chat + 3 cockpit + 4 component + 1 H2 fix + 1 M2 fix). Sprint 11 net-new becomes **+35** after H2 + M2 fixes — the new 5th query test and new 5th ingest test.

§13 Acceptance criteria updated: "≥ baseline + 35 Vitest passing."

§18 Commit-strategy line updated to "200+ tests" — both the previous heuristic and the post-fix +35 count comfortably exceed 200 if the baseline is 170+.

### M4 — Audit rollback handler does not check workspace consistency; should be explicit

**Status:** RESOLVED

**Original problem.** Spec §4.13 "What does not change" listed the rollback path as unchanged. But: a stale audit-row ID held by a user from one workspace, against a row in a different workspace, technically satisfies the audit-ownership check (Sprint 8 §4.4 P1) only if `actor_user_id` matches — which is workspace-independent. The cookie-scoped session means a user can't realistically *get* a stale ID from another workspace, but the spec should make the cross-workspace stance explicit rather than implicit.

**Fix applied.**

§4.6 (Cockpit per-workspace) gains a paragraph:

> The rollback path (`POST /api/audit/[id]/rollback`) does NOT add workspace filtering. Audit-row IDs are global UUIDs; the existing audit-ownership check (`actor_user_id === sessionUserId` for non-Admins; Admin allowed for any row) remains the authoritative gate. A user whose cookie scopes them to Workspace A cannot acquire an audit-row ID from Workspace B in normal usage, and even if they did, the audit-ownership check would reject the rollback unless they happen to also own that row in Workspace B (which is consistent — they're rolling back their own action). Rationale: workspace_id is a *retrieval* concern, not an *ownership* concern; the existing P1 policy already handles cross-workspace edge cases correctly.

§17 risk row: "Cross-workspace audit-row rollback" added with mitigation citing §4.6's reasoning.

---

## LOW — All Resolved

### L1 — System prompt template depends on description ending with a period

**Status:** RESOLVED

**Original problem.** The templated brand-identity line `'You are an AI assistant for ${workspace.name}. ${workspace.description} You help...'` reads cleanly only if `description` doesn't end with a period (which would yield "...A test brand. You help..." vs. "...A test brand.. You help..." for descriptions that include trailing punctuation).

**Fix applied.**

§4.7 system prompt: the template normalizes the description — strips trailing whitespace and trailing period before interpolation:

```typescript
function normalizeDescription(d: string): string {
  return d.trim().replace(/\.$/, '');
}
const intro = `You are an AI assistant for ${workspace.name}. ${normalizeDescription(workspace.description)}. You help...`;
```

Always exactly one trailing period before "You help." Robust to operator input variation.

`system-prompt.test.ts` (in §11.2): one of the two existing tests now uses a description with a trailing period to verify the normalization.

### L2 — WorkspaceHeader vs inline header span — clarify which surface uses which

**Status:** RESOLVED

**Original problem.** §9.2 (chat header) describes a "muted-color span" inline. §9.3 (cockpit header) uses a `<WorkspaceHeader>` component (file in §8 inventory at `src/components/cockpit/WorkspaceHeader.tsx`). Spec didn't explicitly state these are two different things.

**Fix applied.**

§8 file inventory comment clarifies: `WorkspaceHeader.tsx` is *cockpit-specific* (renders the workspace name + Switch link + edit-pencil icon). The chat-page header in `src/app/page.tsx` (already modified) gets a *small inline span* — not a separate component, just an additional `<span>` in the existing JSX. No `WorkspaceHeader` import on the chat page.

This is a one-line clarification in §9.2 and §9.3.

### L3 — Documentary-FK posture for new `workspace_id` columns

**Status:** RESOLVED

**Original problem.** Spec §4.1 doesn't explicitly state whether `workspace_id` columns get a `REFERENCES workspaces(id)` documentary-FK clause. Per Sprint 8 §4.2 convention, FK clauses are documentary only because PRAGMA foreign_keys is off. New schema should be explicit.

**Fix applied.**

§4.1 paragraph added: *"`workspace_id` columns do NOT carry a `REFERENCES workspaces(id)` clause, consistent with the Sprint 8 §4.2 documentary-FK posture. Integrity is enforced at the application layer (the migrate/seed paths populate the column with a known-valid UUID; the upload route validates the workspace exists before INSERT). Adding documentary FKs would mislead a future reader into thinking `PRAGMA foreign_keys = ON` is safe — it is not, until every existing schema reference is reviewed."*

This matches the Sprint 8 §4.2 / spec-QA H2 reasoning verbatim. No new posture; just made explicit.

---

## What changes in the spec

A patched spec applies these as in-place edits. Summary of net deltas:

- **Schema collision** (H1): drop `UNIQUE` from `documents.slug` column declaration; add composite `UNIQUE INDEX (slug, workspace_id)`. §4.1 + §14 rewritten.
- **Workspace expiry semantics** (H2): new §4.13 subsection; `getActiveWorkspace` helper added to the queries module.
- **Test sweep** (H3): §8 file inventory adds explicit test-files sub-table; risk row added.
- **Sample UUID** (M1): clean literal `'00000000-0000-0000-0000-000000000010'`.
- **MIME-or-extension validation** (M2): server-side accepts either MIME or `.md` filename; one new test case.
- **Test-baseline pinning** (M3): "+35 net-new" target with sprint-plan preflight as the source of truth for baseline.
- **Cross-workspace rollback explicit** (M4): §4.6 paragraph added.
- **System prompt normalization** (L1): description trimmed + de-suffixed.
- **WorkspaceHeader vs inline span** (L2): §8 / §9.2 / §9.3 clarification.
- **Documentary-FK posture** (L3): §4.1 paragraph added.

**Final test counts after all fixes** (consolidated):

- Vitest: baseline (post-Sprint-10, confirmed at sprint-plan preflight) + **35 net-new**.
- Playwright: 2 baseline + 1 (`workspace-onboarding.spec.ts`) = **3 specs**.
- Eval: 5/5 unchanged.

---

## What does *not* need to change

- The 13-sprint roadmap in charter §16 — already amended in v1.7.
- Architecture surface (§4.1-§4.12 except H1/H2 fixes) — sound.
- Onboarding UX (§6) — both CTAs and the form shape are correct.
- Domain types (§5) other than the M1 UUID literal.
- Reference borrows (§15) — none from Ordo are critical for this sprint; Sprint 11 is mostly original work.
- The architectural invariant from prior sprints — workspace_id is added orthogonally to the registry / RBAC / audit / rollback / MCP layers; their behavior contracts are preserved.

---

## Re-verification after fixes

After applying every fix, the spec was read end-to-end. Specific checks:

1. **Cross-references.** Every `§X.Y` reference resolves; the new §4.13 is reachable from §4.7 and §4.12. The new §8 sub-table is reachable from §11.5.
2. **Test counts reconcile.** Subtotals sum to 35: 5 query (was 4) + 3 cleanup + 3 cookie + 2 prompt + 5 ingest (was 4) + 6 API + 3 chat + 3 cockpit + 4 component + 1 (audit-rollback cross-workspace test added per M4) = 35.
3. **File inventory ↔ tests reconcile.** Every Created file has a corresponding test entry; every Modified file is either covered by an existing test or has a new test in the sweep.
4. **Schema invariants.** `migrate.test.ts` (referenced in H1 fix) is added to §8 Created list. `cleanup.test.ts` covers the "sample never purged" invariant. `getActiveWorkspace` covered.
5. **Architectural invariant.** The single-RBAC-filtered-registry-as-source-of-truth claim survives — workspaces add a context parameter; they do not bypass the registry.
6. **Charter §9 stop-the-line conditions.** Re-read: nothing in the patched spec triggers a stop-the-line. No stack change, no charter amendment beyond v1.7 (which has already landed), no scope expansion.

---

## Verification artifacts

- Spec file: [spec.md](spec.md) (status: **QA-revised**, dated 2026-05-04).
- This QA file: [spec-qa.md](spec-qa.md) (this document).
- No code changes in the QA pass — spec is the artifact.

**Outcome:** Sprint 11 spec is QA-clean and ready for sprint-plan drafting per charter §7 step 3.
