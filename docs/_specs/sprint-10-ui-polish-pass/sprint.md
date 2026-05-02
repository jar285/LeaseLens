# Sprint Plan - Sprint 10: UI Polish Pass

**Sprint:** 10
**Status:** QA-revised
**Date:** 2026-05-01 (drafted), 2026-05-01 (sprint-QA fixes applied)
**Spec:** [spec.md](spec.md) (status: QA-revised)
**Spec QA:** [spec-qa.md](spec-qa.md) (status: QA-clean)
**Sprint QA:** [sprint-qa.md](sprint-qa.md) (status: QA-clean)
**Author:** Codex

---

## Prerequisites

Before implementation:

1. Human confirms [spec.md](spec.md) and [spec-qa.md](spec-qa.md).
2. Use Node.js `>=20.9.0`. The current app stack will not fully verify on
   Node 18.
3. Commit or consciously carry the prior job-readiness cleanup already present
   in the worktree. Do not mix unrelated cleanup into Sprint 10 tasks.
4. Re-read:
   - `docs/_meta/agent-charter.md`
   - `docs/_references/README.md`
   - `docs/_specs/sprint-10-ui-polish-pass/spec.md`
   - `docs/_specs/sprint-10-ui-polish-pass/spec-qa.md`
5. Reference grounding:
   - `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.tsx`
   - `docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts`
   - `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatMessageViewport.tsx`
6. If Context7 is available in the implementation session, verify current
   React 19 hook behavior and Playwright click/viewport APIs before writing
   code. If Context7 is unavailable, record that in `impl-qa.md`; no new
   library dependency is introduced in this sprint.

Baseline verification before Task 1:

```bash
npm run typecheck
npm run lint
npm run test
npm run eval:golden
npm run test:e2e
npm run build
```

If a baseline command fails for reasons outside Sprint 10 scope, stop and
surface it before implementing.

---

## UI Polish Rubric

Sprint 10 should follow a restrained product-UI interpretation of Adam Wathan
and Steve Schoger's Refactoring UI principles:

- Establish hierarchy with size, weight, proximity, and whitespace before
  adding color.
- Group related controls tightly and separate unrelated regions more clearly.
- Use subtle borders, background contrast, and hover states to show
  clickability without adding decorative chrome.
- Make disabled, loading, success, error, and undo states visually distinct at
  a glance.
- Keep dense cockpit rows scannable with aligned columns, truncation, and
  predictable action placement.
- Keep mobile layouts usable through wrapping, stacking, or horizontal overflow
  where dense operational data cannot shrink cleanly.
- Prefer fewer, clearer visual decisions over broad restyling.

These are manual-review principles, not screenshot-test requirements.

---

## Task List

| # | Task | Files | Type |
|---|---|---|---|
| 1 | Composer auto-resize tests | `src/components/chat/ChatComposer.test.tsx` | Create |
| 2 | Composer auto-resize implementation | `src/components/chat/ChatComposer.tsx` | Modify |
| 3 | Transcript scroll-pinning tests | `src/components/chat/ChatTranscript.test.tsx` | Create |
| 4 | Transcript scroll-pinning implementation | `src/components/chat/ChatTranscript.tsx` | Modify |
| 5 | ToolCard loading-skeleton tests | `src/components/chat/ToolCard.test.tsx` | Create |
| 6 | ToolCard loading-skeleton implementation | `src/components/chat/ToolCard.tsx` | Modify |
| 7 | Focus and hover affordance pass | Chat + cockpit component files listed in Task 7 | Modify |
| 8 | Cockpit clickability E2E fails without force | `tests/e2e/cockpit-dashboard.spec.ts` | Modify test first |
| 9 | Cockpit responsive clickability fix | `src/components/cockpit/*Panel.tsx`, `CockpitDashboard.tsx` | Modify |
| 10 | Typography and spacing pass | Existing chat/cockpit components only | Modify |
| 11 | Final verification and implementation QA | `docs/_specs/sprint-10-ui-polish-pass/impl-qa.md` | Create |

Tasks 1, 3, 5, and 8 are TDD gates: write or amend tests first, confirm they
fail for the intended reason, then implement the matching production change.

---

## Task 1 - Composer Auto-Resize Tests

**Goal:** Lock the composer sizing contract before changing DOM behavior.

**Create:** `src/components/chat/ChatComposer.test.tsx`

Required tests:

1. Renders a textarea labelled `Type a message` and a send button named
   `Send message`.
2. Enter submits once when unlocked and non-empty.
3. Shift+Enter does not submit.
4. Empty input and locked state do not submit.
5. When textarea `scrollHeight` is below `192`, changing text sets inline
   height to that `scrollHeight` and `overflowY` to `hidden`.
6. When textarea `scrollHeight` is above `192`, changing text caps inline
   height at `192px` and sets `overflowY` to `auto`.
7. After successful submit, the textarea value clears and height returns to
   the one-row minimum.

Test mechanics:

- Use React Testing Library and Vitest.
- Define `scrollHeight` on the textarea with `Object.defineProperty`.
- Do not assert long Tailwind class strings.

Expected first run:

```bash
npm run test -- src/components/chat/ChatComposer.test.tsx
```

The new auto-size tests should fail before Task 2.

---

## Task 2 - Composer Auto-Resize Implementation

**Goal:** Implement the contract from Task 1 without moving composer state out
of `ChatComposer`.

**Modify:** `src/components/chat/ChatComposer.tsx`

Required implementation:

- Add a textarea ref owned by `ChatComposer`.
- Add local constants:
  - `MIN_TEXTAREA_HEIGHT = 38`
  - `MAX_TEXTAREA_HEIGHT = 192`
- On text changes and after submit:
  - set `style.height = '0px'`;
  - compute `nextHeight = Math.max(Math.min(scrollHeight, 192), 38)`;
  - set `style.height` to the computed pixel value, for example
    `` `${nextHeight}px` ``;
  - set `style.overflowY = scrollHeight > 192 ? 'auto' : 'hidden'`.
- Preserve existing submit semantics and placeholder.
- Keep `resize-none`; do not expose manual resize handles.

Verification:

```bash
npm run test -- src/components/chat/ChatComposer.test.tsx src/app/page.test.tsx
npm run typecheck
npm run lint
```

---

## Task 3 - Transcript Scroll-Pinning Tests

**Goal:** Specify the pinned-scroll behavior before touching transcript logic.

**Create:** `src/components/chat/ChatTranscript.test.tsx`

Required tests:

1. When the transcript is pinned to bottom, rerendering with new content calls
   `scrollTo` with `top` equal to `scrollHeight`.
2. When the user scrolls away from the bottom, rerendering streamed content
   does not call `scrollTo`.
3. When message count increases, the transcript resets to pinned and scrolls
   to bottom.
4. Empty state still renders suggested prompt controls through
   `ChatEmptyState`.

Implementation allowance for tests:

- Add `data-testid="chat-transcript-scroll"` to the scroll container in
  `ChatTranscript`.
- Use `Object.defineProperty` to set `scrollTop`, `scrollHeight`, and
  `clientHeight` on the scroll element.
- Mock or spy on the element's `scrollTo`.

Expected first run:

```bash
npm run test -- src/components/chat/ChatTranscript.test.tsx
```

At least the message-count/content-update distinction should fail before Task 4.

---

## Task 4 - Transcript Scroll-Pinning Implementation

**Goal:** Preserve useful auto-scroll while respecting a user who scrolled up.

**Modify:** `src/components/chat/ChatTranscript.tsx`

Required implementation:

- Keep pin state local to `ChatTranscript`.
- Track previous `messages.length` in a ref.
- If `messages.length` changes, set `pinnedToBottom.current = true` before
  the scroll effect runs.
- Content updates inside an existing latest message must only scroll when
  `pinnedToBottom.current` is already true.
- Preserve existing empty-state rendering and `onSelectPrompt`.
- Add the `data-testid` named in Task 3.

Do not add a scroll-to-bottom floating CTA in Sprint 10.

Verification:

```bash
npm run test -- src/components/chat/ChatTranscript.test.tsx src/app/page.test.tsx
npm run typecheck
npm run lint
```

---

## Task 5 - ToolCard Loading-Skeleton Tests

**Goal:** Lock visible pending-tool behavior before adding markup.

**Create:** `src/components/chat/ToolCard.test.tsx`

Required tests:

1. Pending invocation (`result === undefined`, `error === undefined`) renders
   the existing `Running...` status and a loading body with accessible text
   `Tool is running`.
2. Success invocation renders `Done` and does not render the loading body.
3. Error invocation renders `Error` and does not render the loading body.
4. Mutating success with `audit_id` and `compensating_available` renders
   `Undo`.
5. Expanded state still shows Input and Result sections for completed calls.

Mock `useRollback` from `@/lib/audit/use-rollback` so tests do not call the
network.

Expected first run:

```bash
npm run test -- src/components/chat/ToolCard.test.tsx
```

The loading-body test should fail before Task 6.

---

## Task 6 - ToolCard Loading-Skeleton Implementation

**Goal:** Make pending tool execution visually distinct without changing the
tool invocation data model.

**Modify:** `src/components/chat/ToolCard.tsx`

Required implementation:

- Derive `isPending = !hasResult && !hasError`.
- Render a compact loading body below the header when `isPending`.
- Loading body:
  - has `role="status"` and accessible name or text `Tool is running`;
  - includes 2-3 neutral skeleton lines;
  - is not hidden behind expansion.
- Keep the existing expanded Input/Result behavior for completed calls.
- Preserve Undo/Rolling back/Rolled back/Retry undo behavior.

Verification:

```bash
npm run test -- src/components/chat/ToolCard.test.tsx src/components/chat/ChatMessage.test.tsx
npm run typecheck
npm run lint
```

---

## Task 7 - Focus And Hover Affordance Pass

**Goal:** Make existing controls visibly keyboard-operable and consistently
interactive without creating a design system.

**Modify these controls only:**

- `src/components/chat/ChatComposer.tsx`
  - send button
  - composer frame focus-within treatment
- `src/components/chat/ChatEmptyState.tsx`
  - four suggestion buttons
- `src/components/chat/ChatUI.tsx`
  - New conversation button
- `src/components/chat/ToolCard.tsx`
  - expand/collapse button
  - Undo button
  - Retry undo button
- `src/components/cockpit/RefreshButton.tsx`
- `src/components/cockpit/AuditFeedPanel.tsx`
  - Undo button
  - Retry button
- `src/app/page.tsx` and `src/app/cockpit/page.tsx`
  - top-level navigation links

Required styling convention:

- Use `focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-indigo-200 focus-visible:ring-offset-2` or the closest
  existing local variant.
- Disabled controls keep visible opacity and do not gain hover-only emphasis.
- Hover states remain restrained: light background, modest text color shift,
  no scale animation except where already present.

Testing:

- Update existing tests only where accessible names or roles change.
- Do not create tests that assert full class strings.

Verification:

```bash
npm run test -- src/app/page.test.tsx src/components/chat/*.test.tsx src/components/cockpit/*.test.tsx
npm run typecheck
npm run lint
```

---

## Task 8 - Cockpit Clickability E2E Fails Without Force

**Goal:** Turn the known pointer-intercept workaround into a failing test.

**Modify first:** `tests/e2e/cockpit-dashboard.spec.ts`

Required test changes:

- Remove the comment that justifies `force: true`.
- Replace `await undo.click({ force: true });` with `await undo.click();`.
- Add a mobile-width smoke path:
  - set viewport to `{ width: 390, height: 844 }`;
  - visit `/cockpit`;
  - assert panel headings remain visible;
  - use the same seeded/executed audit row path as the default viewport test;
  - assert an Undo button can be scrolled into view and clicked normally.

Expected first run:

```bash
npm run test:e2e -- tests/e2e/cockpit-dashboard.spec.ts
```

This may fail before Task 9 if the pointer-intercept defect reproduces.

---

## Task 9 - Cockpit Responsive Clickability Fix

**Goal:** Keep cockpit rows usable at default and mobile widths.

**Modify:**

- `src/components/cockpit/CockpitDashboard.tsx`
- `src/components/cockpit/AuditFeedPanel.tsx`
- `src/components/cockpit/SchedulePanel.tsx`
- `src/components/cockpit/ApprovalsPanel.tsx`
- `src/components/cockpit/SpendPanel.tsx`
- `src/components/cockpit/EvalHealthPanel.tsx` if spacing needs alignment

Required implementation:

- Add `min-w-0` to cockpit grid columns where needed.
- Add `overflow-hidden` to panel sections that contain dense rows.
- Wrap dense row lists in an `overflow-x-auto` container, or convert rows to
  responsive stacked layouts. Choose one pattern and apply it consistently to
  Audit, Schedule, and Approvals.
- If preserving column grids, give rows a `min-w-[...]` so text truncation does
  not collapse action buttons.
- Ensure the Audit Undo/Retry action cell remains clickable after
  `scrollIntoViewIfNeeded()`.

Do not add filters, search, new panel state, or new data queries.

Verification:

```bash
npm run test -- src/components/cockpit/*.test.tsx
npm run test:e2e -- tests/e2e/cockpit-dashboard.spec.ts
npm run typecheck
npm run lint
```

---

## Task 10 - Typography And Spacing Pass

**Goal:** Make chat and cockpit read as one operator workspace without
changing behavior.

**Allowed files:**

- Existing `src/app/page.tsx`
- Existing `src/app/cockpit/page.tsx`
- Existing `src/app/cockpit/layout.tsx`
- Existing `src/components/chat/*.tsx`
- Existing `src/components/cockpit/*.tsx`

Required adjustments:

- Align compact headings to `text-sm font-semibold` inside panels and tool
  surfaces.
- Keep hero-scale text out of compact panels.
- Keep card radius at `rounded-lg` or smaller.
- Avoid nested cards.
- Keep the existing light neutral palette; no decorative gradients or large
  marketing sections.
- Ensure long text in buttons and dense rows truncates or wraps without
  overlap.
- Use the UI polish rubric above for manual review: hierarchy through spacing
  and type first, restrained contrast second, and predictable action placement
  throughout.

Testing:

- Existing component tests should continue to pass.
- Manual review covers aesthetic correctness.

Verification:

```bash
npm run test -- src/app/page.test.tsx src/components/chat/*.test.tsx src/components/cockpit/*.test.tsx
npm run typecheck
npm run lint
```

---

## Task 11 - Final Verification And Impl QA

**Goal:** Close the sprint with evidence.

Run full verification under Node.js `>=20.9.0`:

```bash
npm run typecheck
npm run lint
npm run test
npm run eval:golden
npm run test:e2e
npm run build
```

Manual review:

1. `/` as Creator:
   - multi-line composer grows and caps at 192px;
   - Enter and Shift+Enter behave correctly;
   - streamed response auto-scroll respects user scroll intent.
2. `/` as Editor/Admin:
   - a pending tool call shows loading structure;
   - completed tool calls still show result, Undo, and rollback states.
3. `/cockpit`:
   - default viewport Undo click works normally;
   - mobile viewport does not overlap action controls;
   - keyboard focus is visible on navigation, refresh, and undo controls.

Create `docs/_specs/sprint-10-ui-polish-pass/impl-qa.md` with:

- verification command results;
- manual review notes;
- any deviations from this sprint plan;
- confirmation that `docs/_references/` and `docs/_meta/agent-charter.md`
  were not modified.

---

## Expected Test Additions

Estimated net additions:

- `ChatComposer.test.tsx`: 7 tests
- `ChatTranscript.test.tsx`: 4 tests
- `ToolCard.test.tsx`: 5 tests
- `cockpit-dashboard.spec.ts`: 1 new mobile/default clickability path

Total expected additions: about 16 Vitest tests and 1 Playwright scenario.
Exact count may vary if existing tests are expanded instead of duplicated.

---

## Commit Shape

Recommended commit after implementation and impl QA:

```text
feat(s10): polish chat and cockpit interactions

- Add composer auto-resize with TDD coverage
- Clarify transcript scroll pinning behavior
- Add ToolCard pending loading skeleton
- Improve focus/hover affordances across chat and cockpit controls
- Fix cockpit E2E Undo clickability without force-click
- Add Sprint 10 implementation QA
```
