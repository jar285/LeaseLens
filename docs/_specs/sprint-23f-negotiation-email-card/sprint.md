# Sprint 23f — NegotiationEmailCard — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 4. TDD-driven across all phases.

---

## Phase 0 — Pre-flight

1. `git status` clean apart from `handoff.md` (untracked) and pre-existing `package*.json` (unrelated `@vitest/coverage-v8` addition).
2. Baseline: `npm test` (expect 799/799), `npm run lint` (0 errors), `npm run build` (green).
3. Re-read [`src/components/lease/UploadedLeaseCard.tsx`](../../../src/components/lease/UploadedLeaseCard.tsx) (template), [`src/components/chat/ChatMessage.tsx`](../../../src/components/chat/ChatMessage.tsx) (routing target — esp. `ToolInvocationsBlock` lines 200-241), [`src/components/lease/SeverityBadge.tsx`](../../../src/components/lease/SeverityBadge.tsx) (badge primitive), [`src/components/lease/grading.ts`](../../../src/components/lease/grading.ts) (`clauseLabel()` helper), [`src/lib/tools/lease-tools.ts`](../../../src/lib/tools/lease-tools.ts) (tool result shape).

## Phase 1 — `NegotiationEmailCard` primitive + Copy interaction

**Files touched:**
- NEW: [src/components/lease/NegotiationEmailCard.tsx](../../../src/components/lease/NegotiationEmailCard.tsx)
- NEW: [src/components/lease/NegotiationEmailCard.test.tsx](../../../src/components/lease/NegotiationEmailCard.test.tsx)

**TDD red-green:**

1. RED — write `NegotiationEmailCard.test.tsx` from scratch with these test cases:
   - Renders `data-testid="negotiation-email-card"` with the clauseLabel text.
   - Renders subject verbatim, body verbatim, line breaks preserved (assert `whitespace-pre-line` class or that `<br>`/multiple `<p>` are present and contain the body's split lines).
   - When severity is given, renders a `SeverityBadge` with `data-severity={severity}` inside the card.
   - When severity is omitted, no SeverityBadge renders.
   - Renders a Copy button labeled "Copy email" (or aria-label).
   - On Copy click, `navigator.clipboard.writeText` is called with the body text. Mock the clipboard API for the test.
   - After Copy click, the button shows a transient "Copied" state (assert `data-state="copied"` or label flip to "Copied").
   - When `navigator.clipboard` is undefined, the Copy button has `disabled` attribute.
2. RED — run the test file; expect all assertions to fail (component doesn't exist).
3. GREEN — implement `NegotiationEmailCard.tsx`:
   - Header: `<header>` with the clause label and SeverityBadge.
   - Subject row: `Subject: {subject}` in a mono / accent style.
   - Body: `<div className="whitespace-pre-line">{body}</div>` to preserve `\n`.
   - Footer: `<footer>` on `bg-surface-sunken` with the Copy button.
   - Copy button: `useState<boolean>` for `copied`; onClick calls `navigator.clipboard.writeText(body)` and sets `copied = true`, then a `setTimeout(() => setCopied(false), 1600)` clears it.
   - Feature detection: if `typeof navigator === 'undefined' || !navigator.clipboard?.writeText`, render the button with `disabled`.
4. REFACTOR — verify the test runs in jsdom with the clipboard mock; all assertions pass.

**Verification:** `npx vitest run src/components/lease/NegotiationEmailCard.test.tsx` green.

## Phase 2 — ChatMessage routing for Tenant + draft_negotiation_email

**Files touched:**
- [src/components/chat/ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx)
- [src/components/chat/ChatMessage.test.tsx](../../../src/components/chat/ChatMessage.test.tsx)

**TDD red-green:**

1. RED — add tests to `ChatMessage.test.tsx`:
   - **Tenant + draft_negotiation_email invocation** with a prior `grade_clause_severity` event in the stream for the same `clause_id`: render via a `<ChatStreamProvider>` wrapper. Assert `[data-testid="negotiation-email-card"]` is rendered. Assert no `<ToolCard>` for that invocation (i.e. no `tool-card` element with the matching name).
   - **Reviewer + same invocation**: assert inline `<ToolCard>` is rendered, no `NegotiationEmailCard`.
   - **Tenant + draft_negotiation_email WITHOUT a matching prior grading**: assert the card still renders (graceful fallback: no severity badge, generic "Clause" label or the clause_id).
2. RED — run; expect failure.
3. GREEN — update `ToolInvocationsBlock` in `ChatMessage.tsx`:
   - Add `import { NegotiationEmailCard } from '@/components/lease/NegotiationEmailCard';`
   - Add `import { useChatStream } from './ChatStreamContext';` (if not already imported).
   - Inside the function, partition `nonScanInvocations` into `draftEmailInvocations` (name === 'draft_negotiation_email') and `otherNonScanInvocations`.
   - When `viewerRole === 'Tenant'` and `draftEmailInvocations.length > 0`, render each as `NegotiationEmailCard` (with lookup helpers for label + severity from `toolEvents`).
   - Else (Reviewer/Admin or other tools), render inline `ToolCard`s for all non-scan invocations.
   - Add a small `resolveClauseContext(invocation, toolEvents)` helper that returns `{ clauseLabel, severity }` from the most-recent matching `grade_clause_severity` result.
4. REFACTOR — verify existing ChatMessage tests still pass (especially the role-gated rendering tests for ScanTimeline). Run the full file.

**Verification:** `npx vitest run src/components/chat/ChatMessage.test.tsx` green; cross-check existing role tests survive.

## Phase 3 — Entry animation (fade-in, matching UploadedLeaseCard)

**Files touched:** [src/components/lease/NegotiationEmailCard.tsx](../../../src/components/lease/NegotiationEmailCard.tsx), [src/components/lease/NegotiationEmailCard.test.tsx](../../../src/components/lease/NegotiationEmailCard.test.tsx).

**TDD red-green:**

1. RED — add tests:
   - Card carries `data-motion="on"` when `useReducedMotion()` returns false (default in jsdom).
   - Mock `useReducedMotion` to return true; card carries `data-motion="off"` and renders a plain `<div>` (not `motion.div`).
2. GREEN — wrap the card root in `motion.div` with the same entry shape as UploadedLeaseCard: `initial={{ opacity: 0, y: 16 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}`. Reduced-motion branch returns a plain `<div>` with `data-motion="off"`.
3. REFACTOR — verify all Phase 1 tests still pass with the wrapper.

**Verification:** Phase 1 + Phase 3 tests both pass.

## Phase 4 — Full smoke + commit sequence

1. `npm test && npm run typecheck && npm run lint && npm run build` — all green.
2. Manual smoke walk per spec §4.
3. Update `impl-qa.md` with per-phase change ledger, test deltas, commit-log placeholders.
4. **HALT for user smoke walk via `npm run dev`** before any implementation commit.
5. After user approval, commit in granular sequence (NOT pushed):

```txt
feat(s23f.1): NegotiationEmailCard component + clipboard interaction
feat(s23f.2): ChatMessage routes Tenant draft_negotiation_email to email card
refactor(s23f.3): NegotiationEmailCard entry fade-in (matches UploadedLeaseCard)
docs(s23f): record implementation audit in impl-qa.md
```

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/components/lease/NegotiationEmailCard.tsx` | NEW |
| 1 | `src/components/lease/NegotiationEmailCard.test.tsx` | NEW |
| 2 | `src/components/chat/ChatMessage.tsx` | Routing branch + helper |
| 2 | `src/components/chat/ChatMessage.test.tsx` | Routing tests |
| 3 | `src/components/lease/NegotiationEmailCard.tsx` | Motion wrapper |
| 3 | `src/components/lease/NegotiationEmailCard.test.tsx` | Motion assertions |
| 4 | `docs/_specs/sprint-23f-negotiation-email-card/impl-qa.md` | Implementation audit |

## Test impact

- Expected to grow: +6 Phase 1 (testid, severity-with, severity-without, copy-writes, copied-feedback, disabled-fallback), +3 Phase 2 (tenant-routes, reviewer-routes, fallback-no-grading), +2 Phase 3 (motion-on, motion-off). Net ~+11 tests.
- No deletions.
- After sprint-23f: expected total ≥ 810.
