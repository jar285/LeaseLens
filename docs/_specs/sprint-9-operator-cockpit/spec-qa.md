# Spec QA — Sprint 9: Operator Cockpit Dashboard + Typing Indicator

**Sprint:** 9
**Reviewing:** [docs/_specs/sprint-9-operator-cockpit/spec.md](spec.md)
**Date:** 2026-05-01 (initial review), 2026-05-01 (fixes applied + re-verification)
**Reviewer:** Cascade
**Status:** All 16 findings resolved. Spec is QA-clean.

---

## Summary

Initial review surfaced 16 findings across the spec: 4 HIGH (one false-pricing-source-of-truth, one timezone-edge query format, one misplaced shared hook, one security-framing error), 6 MEDIUM (TypingIndicator visibility against tool_use, Approvals-for-Editor dead UI, audit-feed query missing JOIN, ChatTranscript prop description wrong, Creator-with-cookie redirect untested, `ToolInvocation` duplication unacknowledged), 6 LOW (overlay-removal reversibility, `lastRunAt` field choice, `passedCount` derivation, sprint-chip scope leak, pricing citation cleanup, server-action runtime declaration).

No findings rose to charter §9 stop-the-line — none required a stack change, a charter amendment, or a scope expansion. All resolved as edits to the spec text. The architectural invariant (single RBAC-filtered registry as source of truth for mutating-tool execution) is intact: cockpit reads pass through helpers; the only mutating path (Undo) goes through the existing `POST /api/audit/[id]/rollback`, which already routes through the registry's compensating-action hook.

After fixes, the second QA pass found no further issues. Sprint 9 spec is ready for sprint-plan drafting (charter §7 step 3).

---

## HIGH — All Resolved

### H1 — Pricing constants duplicate an existing source of truth and use wrong numbers

**Status:** RESOLVED

**Original problem.** The spec proposed a new `src/lib/cockpit/pricing.ts` with constants `inputUsdPerMillion: 3, outputUsdPerMillion: 15`. Two issues: (a) [src/lib/db/spend.ts:4-13](src/lib/db/spend.ts#L4-L13) already defines `estimateCost()` with `HAIKU_INPUT_COST_PER_MTOK = 0.8` / `HAIKU_OUTPUT_COST_PER_MTOK = 4.0` — used by the daily-spend ceiling check. A second pricing module would produce a silent display-vs-enforcement divergence. (b) `$3 / $15` are Sonnet-tier numbers; ContentOps runs Haiku 4.5 ($0.80 / $4.00).

**Fix applied.**
- Spec §3 (Non-Goals) gains a "New pricing module" entry — explicit non-goal.
- Spec §4.7 rewritten to use `estimateCost(tokens_in, tokens_out)` from [src/lib/db/spend.ts:7-13](src/lib/db/spend.ts#L7-L13). The same function the daily-spend ceiling uses; single source of truth.
- Spec §5 removes the `pricing.ts` code block and the `PRICING` / `estimateDollars` declarations. `SpendSnapshot.estimated_dollars` documented as "computed via `estimateCost` from `src/lib/db/spend.ts`."
- Spec §6.6 references `estimateCost` directly.
- Spec §11 Created table: `pricing.ts` and `pricing.test.ts` removed.
- Spec §11 Modified table: `src/lib/db/spend.ts` added — adds a one-line citation comment above the constants pointing to https://www.anthropic.com/pricing.
- Spec §12 — `pricing.test.ts` test count removed (-1).
- Spec §13 acceptance criteria — removed pricing-module checkpoint.
- Spec §14 question #10 rewritten: "Reuse existing `estimateCost`..."
- Spec §15 reference table gains a "Pricing-via-existing-function" row.
- Spec §17 risks — pricing-drift row updated to point at single source.

### H2 — `getTodaySpend` query format unspecified; risks date-mismatch with the writer

**Status:** RESOLVED

**Original problem.** Spec said `getTodaySpend(db)` returns "today's row from `spend_log` keyed on `YYYY-MM-DD`," but did not specify whether "today" is computed via SQL or JS. The writer at [src/lib/db/spend.ts:32](src/lib/db/spend.ts#L32) uses SQLite `date('now')` (UTC). A JS-side `new Date().toISOString().slice(0, 10)` would compute against host timezone — silent miss during DST overlap.

**Fix applied.**
- Spec §4.3 (new "Spend query shape" subsection): query is `SELECT date, tokens_in, tokens_out FROM spend_log WHERE date = date('now')` — using SQL `date('now')` is "non-negotiable." Reader and writer agree on UTC.
- Spec §5 `SpendSnapshot.date` comment updated: "as written by SQLite `date('now')` (UTC)".
- Spec §12.4 #5 expanded to a writer/reader round-trip test: `recordSpend(N, M)` then `getTodaySpend()` returns matching values.
- Spec §17 risks — new HIGH-impact row dedicated to the timezone-divergence risk and its mitigation.

### H3 — `useRollback` hook home is under `cockpit/` but used by chat too

**Status:** RESOLVED

**Original problem.** Hook placed at `src/lib/cockpit/use-rollback.ts` but consumed by both `<ToolCard>` (chat) and `<AuditFeedPanel>` (cockpit). Wrong dependency direction — chat shouldn't depend on a cockpit module.

**Fix applied.**
- Spec §4.8 rewritten — hook home is `src/lib/audit/use-rollback.ts`. Folder name reflects the domain (audit-log rollback), not the consumer.
- Spec §9.5, §11 Created, §13 acceptance, §15 reference table, §18 commit strategy all updated to the new path.
- Spec §14 question #9 expanded: "...under `src/lib/audit/`...because the chat shouldn't depend on a cockpit module."

### H4 — Server-action RBAC text mis-labels the security boundary

**Status:** RESOLVED

**Original problem.** §8 step 2 framed the role check as "defense-in-depth for direct action calls" — the page redirect was implied to be the primary defense. Backwards: server actions are POST-able by any authenticated client with the action ID, so the role check inside each action IS the primary security boundary.

**Fix applied.**
- Spec §8 step 2 rewritten — bold heading "**This check is the primary security boundary, not defense-in-depth.**" Concrete attack vector documented: a Creator session cookie + JS console can attempt invocation; without the check, `refreshAuditFeed` with `actorUserId: undefined` would return all rows.
- Spec §8 also adds: `refreshApprovals` additionally throws on Editor (panel is Admin-only — see M2). Section 12.5 #3 covers both gates.
- Spec §17 risks — server-action exposure row updated to **HIGH** impact (was Medium); mitigation cites Section 8 + Section 12.5.

---

## MEDIUM — All Resolved

### M1 — TypingIndicator visibility races with tool_use rendering

**Status:** RESOLVED

**Original problem.** Three-clause condition (`!content && isStreaming && role === 'assistant'`) would render dots simultaneously with a `<ToolCard>` when `tool_use` arrives before any text chunk.

**Fix applied.**
- Spec §4.9, §7, §9.3 condition expanded to four clauses, adding `(toolInvocations === undefined || toolInvocations.length === 0)`.
- Spec §12.8 (renumbered from §12.9) gains a third assertion: `<ChatMessage isStreaming toolInvocations=[<ToolCard>] />` does **not** render `<TypingIndicator>`.
- Spec §17 risks — new Medium row covering the simultaneous-render risk and its mitigation.

### M2 — Approvals panel for Editor is always empty

**Status:** RESOLVED — chose option (a) "Hide for Editor"

**Original problem.** `approve_draft` is Admin-only; an Editor's RBAC-filtered Approvals panel is structurally always empty. Permanently empty panel is dead UI.

**Fix applied.**
- Spec §2 (Goals #4): Approvals panel marked Admin-only.
- Spec §4.5 rewritten — "Decision: the Approvals panel is **Admin-only**. Editors do not see it..." `<CockpitDashboard>` conditionally renders.
- Spec §6.1, §6.4 — `<ApprovalsPanel>` documented as Admin-only render branch.
- Spec §8 — `refreshApprovals` additionally throws on Editor (defends against direct action call from Editor session).
- Spec §11 — `ApprovalsPanel.test.tsx` description updated to verify Admin-only render guard.
- Spec §12.6 #2 / #3 — Editor-renders-without-approvals-panel and Admin-renders-with verified.
- Spec §12.7 #5 — empty + populated tests + not-rendered-for-Editor.
- Spec §13 — RBAC matrix updated.
- Spec §14 question #4 expanded to record the Admin-only decision.

### M3 — Audit-feed query needs a `LEFT JOIN users`; MCP-actor fallback undocumented

**Status:** RESOLVED

**Original problem.** Spec §6.2 said "actor (display name)" but the query in §4.3 didn't JOIN `users`. Plus: MCP-originated rows have `actor_user_id = 'mcp-server'` which doesn't match `users.id`.

**Fix applied.**
- Spec §4.3 (new "Audit-feed query shape" subsection) shows the SQL: `SELECT a.*, u.display_name AS actor_display_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id ...`.
- Spec §5 — new `CockpitAuditRow` type (extends `AuditLogEntry` with `actor_display_name: string | null`). Base `AuditLogEntry` in `src/lib/tools/domain.ts` unchanged (Sprint 8 ABI preserved).
- Spec §6.2 — actor column behavior documented: render `actor_display_name` if present, otherwise literal `actor_user_id` (which yields `mcp-server` for MCP-originated rows — correct labeling).
- Spec §12.4 #1 updated to assert JOIN return shape: null `actor_display_name` for an `actor_user_id` not in `users`.
- Spec §12.7 #2 — AuditFeedPanel test verifies `mcp-server` literal fallback.

### M4 — `<ChatTranscript isStreaming>` description wrong

**Status:** RESOLVED

**Original problem.** §9.4 stated the prop is "already declared, not passed." Wrong on the second clause: `ChatUI.tsx:207` already passes it; the gap is that `ChatTranscript` doesn't destructure it.

**Fix applied.**
- Spec §4.9 paragraph rewritten with the actual current state — declared at line 7, received at line 207, but body destructures only `messages` at line 10.
- Spec §9.2 shows the destructure-and-thread fix.
- Spec §9.4 rewritten to remove the `<ChatTranscript>` prop-passing claim; clarifies the original spec text was wrong; only the overlay-removal change remains for `ChatUI`.

### M5 — Creator-with-cookie redirect path is untested

**Status:** RESOLVED

**Original problem.** §12.7 (now §12.6) #1 covered no-cookie. A Creator with a valid session cookie is a separate code path: cookie decrypts, role === 'Creator', redirect must still fire.

**Fix applied.**
- Spec §12.6 #4 (new) — "Creator session (cookie decrypts to `role: 'Creator'`): redirects to `/`. Distinct from #1 — exercises the role-check branch, not the no-cookie default branch."
- Spec §13 RBAC matrix bullet rewritten: "Creator (with cookie) and no-cookie: `/cockpit` redirects to `/`."

### M6 — `ToolInvocation` interface duplicated; Sprint 9 should acknowledge

**Status:** RESOLVED

**Original problem.** `interface ToolInvocation` exists in both `ToolCard.tsx:6-14` and `ChatMessage.tsx:5-15`. Sprint 9 touches `ToolCard.tsx` — natural moment to dedup.

**Fix applied.**
- Spec §4.8 (new "ToolInvocation interface dedup" paragraph): Sprint 9 deletes the local copy in `ToolCard.tsx` and imports from `ChatMessage.tsx`.
- Spec §4.11: explicitly notes the interface contents are byte-identical so no consumer change.
- Spec §9.5 step list includes the dedup.
- Spec §11 Modified — `ToolCard.tsx` change description updated.
- Spec §17 risks — new Low-impact row covering the unification risk.

---

## LOW — All Resolved

### L1 — Overlay removal reversibility

**Status:** RESOLVED — documented in §17 risks

**Fix.** Spec §14 question #6 expanded with the revert path. Spec §17 gains the "Operators with scrolled-up chats..." row.

### L2 — `lastRunAt` field choice

**Status:** RESOLVED

**Fix.** Spec §4.6 step 5 + §5 — `lastRunAt = report.completedAt`. Spec §6.5 also clarified. Spec §14 question #11 (new) records the decision.

### L3 — `passedCount` derivation

**Status:** RESOLVED

**Fix.** Spec §4.6 step 5 makes derivation explicit: `passedCount = report.caseResults.filter(r => r.passed).length`. Spec §5 inline comment.

### L4 — Header sprint chip

**Status:** RESOLVED — chose option (a) drop entirely

**Fix.** Spec §3 Non-Goals, §9.1, §11 Modified, §13 acceptance all reflect chip removal. Spec §14 question #12 (new) records the decision.

### L5 — Pricing source citation collapses with H1

**Status:** RESOLVED

**Fix.** Spec §11 Modified — `src/lib/db/spend.ts` row added: "Add a one-line citation comment above the `HAIKU_*_COST_PER_MTOK` constants pointing to https://www.anthropic.com/pricing. No constant value change."

### L6 — Server-action runtime declaration

**Status:** RESOLVED

**Fix.** Spec §8 — explicit `export const runtime = 'nodejs'` added to `actions.ts` shape; rationale documented (defensive against future cross-page imports). Spec §16 Context7 verification list updated to confirm runtime export accepted on action modules. Spec §17 mitigation row updated.

---

## Re-verification after fixes

After applying every fix, the spec was read end-to-end. Specific checks:

1. **Cross-references consistent.** Every `§X.Y` reference resolves to the right new section. The renumber of §12 (panel render became §12.7, chat render became §12.8) is reflected in §17 mitigation citations and §13 acceptance criteria.
2. **Test counts reconcile.**
    - Original spec claimed `+27` tests with subtotals: 2 + 3 + 1 + 3 unit + 5 + 3 + 3 integration + 5 + 2 component = 27.
    - After fixes: H1 −1 (pricing.test.ts removed); M1 +1 (TypingIndicator-with-tool test); M5 +1 (Creator-cookie redirect test). Net **+28**.
    - Section 12 subtotals after fixes: 2 + 3 + 3 unit + 5 + 3 + 4 integration + 5 + 3 component = 28. ✓
    - §13 acceptance criteria: "≥ 160 passing (132 baseline + 28 new)." ✓
    - §18 commit strategy: "160+ Vitest tests passing." ✓
3. **File inventory ↔ tests reconcile.** Removed: `pricing.ts`, `pricing.test.ts`. Relocated: `use-rollback.{ts,test.ts}` from `src/lib/cockpit/` to `src/lib/audit/`. Added: `src/lib/db/spend.ts` to Modified (for the citation comment).
4. **Risk register ↔ findings reconcile.** §17 has 13 rows now (up from 9). New rows: H2 spend timezone divergence, H4 server-action exposure (severity raised from Medium to High), M1 typing-indicator/ToolCard race, M6 ToolInvocation unification, L1 scrolled-chat indicator-miss. Updated row: pricing drift mitigation.
5. **Open questions cover all decisions.** §14 grew from 10 to 12 questions: question #11 ("`lastRunAt` derivation") and question #12 ("sprint chip") added; questions #4 (Approvals queue), #6 (overlay), #9 (hook home), #10 (pricing) updated to reflect the new decisions.
6. **Architectural invariant.** Cockpit reads through helpers; mutating writes (Undo) flow through `POST /api/audit/[id]/rollback` which already goes through the registry. No new mutation paths introduced. Invariant intact.
7. **Charter §9 stop-the-line conditions.** Re-read: nothing in the patched spec triggers a stop-the-line. No stack change, no charter amendment needed, no scope into a prior sprint's delivered artifacts.

---

## What does *not* need to change

- Architecture and panel set (§2, §6) — six panels (Approvals Admin-only) and their RBAC posture are correct.
- Server Actions over new HTTP routes (§14 q2) — sound for the demo's single consumer.
- Manual refresh over polling/SSE (§14 q1) — sound under the simplicity meta-rule.
- TypingIndicator implementation pattern (`animate-bounce` + staggered delays) — Tailwind 4 supports it; verified in `node_modules/tailwindcss/theme.css`.
- Rollback API reuse — the existing `POST /api/audit/[id]/rollback` already handles RBAC, idempotency, and atomicity per Sprint 8 §4.4. Sprint 9 calls it; doesn't change it.
- The architectural invariant — single registry as source of truth for prompt-visible-and-runtime-executable tools — survives Sprint 9 unchanged. The cockpit reads; the only mutation is Undo through the registry's compensating-action path.

---

## Verification artifacts

- Spec file: [spec.md](spec.md) (status: **QA-revised**, dated 2026-05-01).
- This QA file: [spec-qa.md](spec-qa.md) (this document).
- No code changes in the QA pass — spec is the artifact.

**Outcome:** Sprint 9 spec is QA-clean and ready for sprint-plan drafting per charter §7 step 3.
