# Spec - Sprint 10: UI Polish Pass

**Sprint:** 10
**Status:** QA-revised
**Date:** 2026-05-01 (drafted), 2026-05-01 (spec-QA fixes applied)
**Author:** Codex

---

## 1. Problem Statement

Sprints 1 through 9 delivered the core product: chat, RAG, tool use, RBAC,
mutating actions, rollback, eval reporting, and the operator cockpit. The
application now demonstrates the right technical surface for AI Product
Engineer and applied AI roles, but several interaction details still feel
rough during repeated reviewer use:

- The composer stays at one visible row until the browser scrolls inside the
  textarea, which makes multi-line prompts feel cramped.
- Focus and hover states are inconsistent across chat, tool cards, cockpit
  panels, and refresh/undo controls.
- Pending tool calls show a status pill but no body-level loading structure,
  so tool use can look like a stalled card.
- The transcript auto-scroll behavior works for basic streaming but needs a
  clearer contract: stay pinned when the user is at the bottom, and do not
  steal scroll when the user has intentionally moved up.
- The cockpit E2E currently force-clicks Undo because the two-column layout can
  let the right column intercept pointer events after scroll-into-view at
  narrower widths. That is a real polish defect, not a test quirk.
- Typography and spacing are close, but the chat and cockpit do not yet feel
  like one polished operator workspace.

Sprint 10 is the final local product polish pass before deployment. It does
not add product capabilities. It improves the existing surfaces so a reviewer
can understand the system quickly, use it without friction, and trust the
state transitions they see.

---

## 2. Goals

1. **Composer auto-resize.** The chat composer grows with multi-line input up
   to 192px, then scrolls internally. Submit behavior remains unchanged:
   Enter submits, Shift+Enter inserts a newline, empty/locked states do not
   submit.
2. **Keyboard-visible focus states.** Primary interactive controls across chat
   and cockpit have visible focus states that match the existing restrained
   visual language.
3. **Hover affordances.** Buttons and expandable rows communicate
   interactivity consistently without introducing a new design system.
4. **ToolCard loading skeleton.** Pending tool calls render a compact loading
   body while the tool result is absent. The existing Running/Done/Error,
   Undo, Rolled back, and Retry undo states remain unchanged.
5. **Scroll-to-bottom contract.** The transcript remains pinned to the latest
   message while the user is already at the bottom; if the user scrolls up, new
   streamed chunks do not yank them back down.
6. **Typography and spacing pass.** Chat and cockpit spacing, text scale,
   density, and panel rhythm are made consistent enough for a professional
   portfolio review.
7. **Cockpit clickability.** Cockpit rows and panels stay usable at default
   Playwright, mobile, and desktop widths. E2E Undo clicks must not need
   `{ force: true }`.
8. **No visual-regression tooling.** Tests cover behavior and state. Final
   visual approval is manual review, per the charter.

---

## 3. Non-Goals

- No new AI features, tools, RBAC policies, database tables, API routes, or
  server actions.
- No marketing landing page, hero section, proof-point cards, pricing page, or
  portfolio-style case study page.
- No full design system, token package, Storybook, Chromatic, Percy, or
  screenshot regression infrastructure.
- No real-time cockpit refresh, polling, SSE, notifications, or charts.
- No scroll-to-bottom floating CTA. Sprint 10 clarifies and tests pinning
  behavior; it does not add a new chat control unless human QA requests it.
- No changes to the single-source tool registry invariant.
- No edits to `docs/_references/` or `docs/_meta/agent-charter.md`.

---

## 4. Invariants

- The prompt-visible tool manifest and executable tools still come from the
  same RBAC-filtered registry. Sprint 10 must not touch tool registration,
  prompt construction, or runtime authorization except for tests that prove
  existing behavior still works.
- Existing user workflows remain intact: chat submit, streaming, tool cards,
  Undo, role switching, and cockpit refresh.
- UI changes stay local to existing chat/cockpit components and shared hooks
  where reuse is already present. No speculative abstractions.
- Tests assert behavior that can fail. Pure color, spacing, and aesthetic
  judgment are reviewed manually.
- No component should require a parent to know about DOM measurement details.
  The composer owns its own sizing behavior.

---

## 5. Architecture

### 5.1 Chat composer

`ChatComposer` remains a controlled client component. It owns the textarea
value, submit guards, keyboard handling, and auto-sizing behavior. The sizing
contract is:

- Empty composer renders at one-row height.
- Multi-line content increases visible height until 192px.
- Content beyond 192px scrolls inside the textarea.
- Clearing or submitting returns the textarea to the initial height.

The implementation stays inside `ChatComposer`; do not move composer state up
to `ChatUI`. Tests may define textarea `scrollHeight` directly in the test
environment to prove height and overflow changes; production code must still
derive height from the textarea DOM node.

### 5.2 Transcript scrolling

`ChatTranscript` owns scroll pinning. Sprint 10 clarifies the existing
behavior with tests:

- When pinned to the bottom, new messages and streamed chunks scroll to the
  bottom.
- When the user scrolls away from the bottom, new streamed chunks do not
  override that choice.
- Starting a new conversation resets the transcript normally through existing
  `ChatUI` state.
- Message-count changes may reset the pin to bottom; content-length changes
  inside the latest assistant message must honor the current pin state.

If testability requires a tiny helper for bottom detection, keep it local to
the chat transcript module unless another current component uses it.

### 5.3 Tool cards

`ToolCard` gets a loading body for pending tool execution. The card still uses
the existing `ToolInvocation` shape:

- Pending: no `result`, no `error`.
- Success: `result` present and no `error`.
- Failure: `error` present.
- Mutating success: `audit_id` and `compensating_available` drive Undo.

The loading skeleton is present only in the pending state and disappears as
soon as result or error metadata arrives.

### 5.4 Cockpit polish

Cockpit panels keep their existing data flow and manual refresh behavior.
Sprint 10 may adjust classes, spacing, responsive wrapping, button affordances,
and empty states in existing panel components. It must not add new cockpit
queries, filters, charts, or state models.

The cockpit E2E should remove the existing `force: true` Undo click workaround.
If the audit feed remains grid-based, it must avoid overlap with the right
column at default and mobile widths. Acceptable fixes include panel-local
horizontal overflow, responsive row stacking, or grid sizing changes in
`CockpitDashboard`.

### 5.5 Reference patterns

Sprint 10 may borrow only narrow interaction patterns from Studio Ordo:

- `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.tsx` for
  textarea auto-sizing mechanics: set height from `scrollHeight`, cap at a
  maximum, and toggle `overflowY`.
- `docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts` and
  `src/frameworks/ui/ChatMessageViewport.tsx` for scroll pinning vocabulary:
  pinned-to-bottom state, reset on message-count changes, and respect for a
  user who has scrolled away.

Do not copy Ordo's file attachment, mention, scroll CTA, CSS-variable design
system, or full viewport shell. Those are outside Sprint 10 scope.

---

## 6. TDD And Clean Code Requirements

- Write failing tests before implementation for behavior changes:
  composer auto-resize, ToolCard loading skeleton, and transcript scroll
  pinning.
- Update the cockpit E2E so Undo is clicked normally, without `force: true`.
  That test should fail before the responsive/pointer-intercept fix.
- Update existing RTL tests when markup changes affect accessible names or
  role queries.
- For focus/hover polish, tests may assert that named controls remain
  keyboard-focusable and expose expected accessible names. Do not write tests
  that only snapshot long class strings.
- Keep each component responsible for one interaction concern:
  composer sizing in `ChatComposer`, scroll pinning in `ChatTranscript`, tool
  status rendering in `ToolCard`, panel refresh affordances in cockpit panel
  components.
- Prefer small local helpers over shared abstractions unless at least two
  production components use the same behavior.
- Do not add comments for obvious styling changes. Add comments only where DOM
  measurement or test-environment behavior would otherwise be unclear.

---

## 7. Acceptance Criteria

1. A reviewer can type a multi-line prompt and see the composer grow up to
   192px, then scroll internally.
2. Pressing Enter submits; pressing Shift+Enter creates a new line; submitting
   clears the composer and restores initial height.
3. Keyboard users can tab through chat and cockpit controls and see where
   focus is.
4. A pending tool call shows visible loading structure inside the ToolCard
   before the result arrives.
5. ToolCard success, error, Undo, rolled-back, and retry states still behave as
   before Sprint 10.
6. Streaming messages keep the transcript pinned only when the user is already
   at the bottom.
7. Cockpit Undo works through a normal Playwright click at default viewport
   size; no `force: true` workaround remains.
8. Chat and cockpit read as one coherent operator workspace under manual
   review on desktop and mobile widths.
9. No new data, AI, auth, deployment, or analytics behavior is introduced.

---

## 8. Verification Commands

Run under Node.js 20.9.0 or newer.

```bash
npm run typecheck
npm run lint
npm run test
npm run eval:golden
npm run test:e2e
npm run build
```

Manual review:

1. Open `/` as Creator, submit a multi-line prompt, and verify composer sizing,
   streaming, and scroll behavior.
2. Switch to Editor/Admin, trigger a tool call, and verify pending, success,
   and Undo states.
3. Open `/cockpit`, tab through refresh/undo controls, click Undo without
   forced pointer bypasses, and review spacing at desktop and mobile widths.

---

## 9. Open Questions

1. **Should empty-state suggestion buttons submit immediately or prefill the
   composer?** Current behavior submits immediately. Sprint 10 may polish the
   visual treatment but should not change this behavior unless human QA asks
   for prefill.
2. **How should the cockpit audit feed avoid narrow-width overlap?** Default:
   choose the smallest local fix during implementation: horizontal overflow for
   dense rows if preserving columns is clearer, or responsive row stacking if
   it improves readability. Do not add filters or alternate data views.
3. **Should visual polish include screenshots in the repo?** Default: no. The
   charter rejects visual-regression tooling, and screenshots are not needed
   for local verification.
