# Sprint 29 — FAB + Chat Assistant Production UX Refactor

**Status:** In progress on `feature/fab-menu`. Sprint 29.1 landed (this commit); 29.2–29.7 queued per the parent plan.
**Date range:** 2026-05-26 → (open).
**Branch:** `feature/fab-menu` (forked from `feature/cockpit` after Sprint 28 closed).
**Parent plan:** [`~/.claude/plans/please-review-my-current-fizzy-lampson.md`](../../../).
**Predecessor:** [Sprint 28 — Bug Triage](../sprint-28-bug-triage/spec.md).

> Sprint 28 made the state boundary safe (parser state on `LeaseParserContext`, chat state on `ChatStreamContext`, FAB state on `AssistantFabContext`). Sprint 29 makes the UI **feel** as safe as the state already **is**, so real tenants stop hesitating before clicking the FAB.

---

## 1. Problem

After Sprint 28 a real-user UX pass surfaced that the FAB drawer + Clear-chat action still confused first-time tenants. Concrete failures we observed:

1. **"New conversation" tested as ambiguous** — tenants thought it would reset their whole lease review (the destructive-sounding word "new" reads as "start over").
2. **Drawer feels like a second homepage** — `ChatEmptyState`'s big "Find what to negotiate, before you sign" hero is rendered inside the FAB drawer, so the assistant visually competes with the parser surface instead of supporting it.
3. **The user can't tell what the assistant is using** — no context bar shows the active lease, scan progress, or focused clause.
4. **Chip set is static** — no awareness of whether the user is pre-upload, mid-scan, or post-scan.
5. **No undo affordance** — clearing chat fires an aria-live announcement but no visible safety net for sighted users.
6. **Pill is opaque on desktop** — a circular icon-only pill at 64×64 carries no state cue (busy/scanning/empty).
7. **A11y posture isn't audited end-to-end** — Sprint 27/28 work touched keyboard + aria piecemeal; we owe a single audited pass.

The state architecture is fine; the *surface* is what's behind on production readiness.

---

## 2. Invariants (carried into every sub-sprint)

1. **Parser state is owned only by `LeaseParserContext`.** The FAB may *read* parser state; it must never *write* it. Only the workspace-level "Replace lease" action resets parser state.
2. **Closing the FAB never destroys assistant input, conversation, or selection** (Sprint 27 contract).
3. **Clearing the assistant chat never touches the lease, clauses, red flags, or PDF** (Sprint 28.7-8 contract).
4. **Screen-reader users get accurate status announcements.** All visible state changes have an aria-live or aria-label equivalent.
5. **Every behaviour change ships with a test.** TDD red→green per sub-sprint.
6. **No skipped tests, no `xit`, no `describe.skip`.**
7. **WCAG AA** contrast, keyboard, focus, reduced-motion.
8. **`prefers-reduced-motion: reduce`** suppresses motion, never silences status.

---

## 3. Sub-sprint breakdown

See parent plan `§4` for full per-sprint TDD steps. High-level:

- **29.1 — Rename `New conversation` → `Clear assistant chat`** + helper text + aria-live copy refresh.
- **29.2 — Compact drawer header** (suppress the big `ChatEmptyState` hero inside the FAB).
- **29.3 — Assistant context bar** (`Using: …`, `Focused on: … [×]`) + new `detachSelection()` method.
- **29.4 — Job-aware empty states & chips** (no-lease / scanning / complete chip sets, derived from `useScanLifecycle()`).
- **29.5 — Undo toast** after clearing chat (transient ~6s with [Undo] button; restores `previousMessages` stash).
- **29.6 — FAB pill state labels on lg+** (Help / Scanning… / Ask about lease / Draft saved / New reply).
- **29.7 — Accessibility audit + final verification** (keyboard flow, reduced-motion, touch targets, aria-label coverage).

Per the parent plan's cadence, each sub-sprint ships green and waits for explicit user approval before the next starts.

---

## 4. Definition of done

- All seven sub-sprints shipped behind green TDD tests.
- `npm run lint` (0/0/info), `npm run typecheck` clean, `npm test` ≥ 1036/1036 (will grow), `npm run build` clean — for *every* sub-sprint commit.
- The acceptance criteria from the user's brief all hold (assistant feels secondary; user can always tell what the assistant is using; "Clear assistant chat" cannot be mistaken for a workspace reset; closing the FAB never deletes work; clearing chat never removes the lease; clear states for no-lease / scanning / complete; drawer no longer feels like a homepage; pill communicates state; destructive actions clearly separated; a11y preserved or improved).
- No new TODOs / dead code / commented-out blocks.
- This file and [`impl.md`](./impl.md) carry a QA report per sub-sprint.

---

## 5. Out of scope (carry items)

- Delete the dead `LeaseLensWorkspaceShell.tsx` + its 543-line colocated test (Sprint 28 carry).
- Replace `window.confirm` in the "Replace lease" flow with a styled inline confirmation (Sprint 28 carry).
- `.gitignore` `next-env.d.ts` (Sprint 28 carry).
- Telemetry on FAB usage (separate observability ticket).

---

## 6. Files (cross-sprint reference)

| File | Sub-sprint(s) | Reason |
|---|---|---|
| [`src/components/chat/AssistantFabContext.tsx`](../../../src/components/chat/AssistantFabContext.tsx) | 29.3 | Add `detachSelection()` |
| [`src/components/chat/AssistantFab.client.tsx`](../../../src/components/chat/AssistantFab.client.tsx) | 29.2, 29.3, 29.4, 29.6 | Compact header, context bar, job-aware chips, pill labels |
| [`src/components/chat/AssistantFab.tsx`](../../../src/components/chat/AssistantFab.tsx) | 29.6 | Loading-state placeholder width parity |
| [`src/components/chat/ChatUI.tsx`](../../../src/components/chat/ChatUI.tsx) | 29.1, 29.2, 29.5 | Label/aria copy, `emptyStateVariant` prop, undo toast |
| [`src/components/chat/ChatTranscript.tsx`](../../../src/components/chat/ChatTranscript.tsx) | 29.2 | Forward `emptyStateVariant` to `ChatEmptyState` (or suppress it) |
| [`src/components/chat/AssistantFab.integration.test.tsx`](../../../src/components/chat/AssistantFab.integration.test.tsx) | 29.1–29.7 | Integration coverage for every sub-sprint |
| [`src/components/chat/AssistantFabContext.test.tsx`](../../../src/components/chat/AssistantFabContext.test.tsx) | 29.3 | `detachSelection()` contract test |
| [`tests/e2e/fab-assistant.spec.ts`](../../../tests/e2e/fab-assistant.spec.ts) | 29.7 | Keyboard + reduced-motion e2e |

Hook reuse (do not duplicate): `useLeaseParser()`, `useScanLifecycle()`, `useScanProgress()`, `useAssistantFab()`.
