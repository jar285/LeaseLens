# Spec QA - Sprint 10: UI Polish Pass

**Sprint:** 10
**Reviewing:** [spec.md](spec.md)
**Date:** 2026-05-01 (initial review), 2026-05-01 (fixes applied + re-verification)
**Reviewer:** Codex
**Status:** All findings resolved. Spec is QA-clean.

---

## Summary

The initial Sprint 10 spec was directionally correct and aligned with the
charter: it limited the sprint to UI polish, preserved the single-registry
tool invariant, required TDD for behavior, and rejected visual-regression
tooling. Review against the current codebase and the read-only Studio Ordo
reference surfaced four issues:

- one HIGH issue: the spec did not name the current cockpit E2E force-click /
  pointer-intercept defect;
- two MEDIUM issues: scroll behavior was under-specified, and focus/hover
  completion criteria were too vague;
- one LOW issue: the spec did not record which reference patterns are allowed
  to be borrowed.

All four were resolved as edits to [spec.md](spec.md). No finding required a
stack change, a charter amendment, or any edit to `docs/_references/` or
`docs/_meta/agent-charter.md`.

---

## Reference Material Reviewed

- `docs/_references/README.md` — confirmed the reference tree is read-only,
  not a dependency, not a scope expander, and must be cited when patterns are
  borrowed.
- `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.tsx` —
  reviewed textarea auto-sizing mechanics: set height from `scrollHeight`,
  cap at a maximum, and toggle `overflowY`.
- `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.test.tsx` —
  reviewed behavior-focused composer tests.
- `docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts` and
  `src/frameworks/ui/ChatMessageViewport.tsx` — reviewed pinned-to-bottom
  scroll state, reset on message-count changes, and respect for scrolled-up
  users.
- `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatMessageViewport.test.tsx`
  — reviewed the reference approach of testing scroll state through behavior
  and mocked hooks rather than screenshot assertions.

---

## HIGH - Resolved

### H1 - Cockpit pointer-intercept defect missing from Sprint 10 scope

**Status:** RESOLVED

**Problem.** The current cockpit E2E contains a forced Undo click:
`await undo.click({ force: true })`. The test comment says the SpendPanel can
intercept pointer events during `scrollIntoViewIfNeeded()` at narrower widths.
The original Sprint 10 spec vaguely mentioned responsive polish but did not
name this known defect. An implementer could complete the sprint while leaving
the forced click in place.

**Fix applied.**

- Spec §1 now names the force-click / pointer-intercept issue as a product
  polish defect.
- Spec §2 adds "Cockpit clickability" as a goal.
- Spec §5.4 requires the E2E Undo click to work without `{ force: true }` and
  lists acceptable local fixes: panel overflow, responsive row stacking, or
  cockpit grid sizing.
- Spec §6 requires updating the cockpit E2E so it fails before the layout fix.
- Spec §7 acceptance now requires normal Playwright click behavior.
- Spec §8 manual review includes clicking Undo without forced pointer bypasses.

---

## MEDIUM - Resolved

### M1 - Transcript scroll contract needed message-count vs streamed-content rules

**Status:** RESOLVED

**Problem.** The original spec said the transcript should stay pinned at the
bottom unless the user scrolls up, but did not specify how new messages differ
from streamed content updates. The current `ChatTranscript` re-runs its scroll
effect when the `messages` array changes, and `ChatUI` creates a new array for
each streamed chunk. The reference implementation makes an important
distinction: message-count changes can reset the pin; content-length changes
inside an existing message respect the current user pin state.

**Fix applied.**

- Spec §5.2 now states that message-count changes may reset the pin to bottom,
  while content-length changes inside the latest assistant message must honor
  the current pin state.
- Spec §5.5 records the reference pattern from Ordo's `useChatScroll` and
  `ChatMessageViewport`.
- Spec §3 explicitly excludes adding Ordo's scroll-to-bottom CTA unless human
  QA asks for it.

### M2 - Focus and hover completion criteria were too broad

**Status:** RESOLVED

**Problem.** "Primary interactive controls" and "hover affordances" were broad
enough that an implementer would have to decide what counts as complete. That
would violate the charter's decision-complete sprint-planning goal once this
spec becomes the basis for `sprint.md`.

**Fix applied.**

- Spec §6 now says focus/hover tests should assert keyboard focusability and
  accessible names where behavior is testable.
- Spec §6 also forbids tests that merely snapshot long class strings.
- Spec §5.4 narrows cockpit polish to existing panels and controls, not new
  data views or state models.

The sprint plan should enumerate the exact control set: composer textarea/send,
empty-state suggestion buttons, New conversation, ToolCard expand/Undo/Retry,
cockpit Refresh/Undo, and top-level navigation links.

---

## LOW - Resolved

### L1 - Reference borrowing boundaries were not recorded

**Status:** RESOLVED

**Problem.** The user explicitly asked that Sprint 10 look at the references
folder. `docs/_references/README.md` allows borrowing patterns only with
citation and forbids mirroring Ordo's broader surface area. The draft spec did
not record which reference patterns were useful and which were out of scope.

**Fix applied.**

- Spec §5.5 records the only allowed Ordo patterns for Sprint 10:
  textarea auto-sizing mechanics and scroll-pinning vocabulary.
- Spec §5.5 explicitly rejects Ordo's file attachment, mention system, scroll
  CTA, CSS-variable design system, and full viewport shell.

---

## Re-verification

After applying the fixes, the spec was re-read against:

1. **Charter §6 Clean Code / SOLID.** The spec keeps responsibilities local:
   composer sizing in `ChatComposer`, scroll pinning in `ChatTranscript`,
   tool status rendering in `ToolCard`, and refresh affordances in cockpit
   panels. No speculative shared abstraction is required.
2. **Charter §7 delivery loop.** Sprint 10 is still at Step 2. The next
   artifact is `sprint.md` only after human confirmation.
3. **Charter §9 stop-the-line.** No issue requires a stack change, a new
   library, a prior-sprint artifact edit, or a registry-invariant exception.
4. **Charter §12 artifact style.** The spec stays declarative and avoids
   marketing scope.
5. **Reference rules.** `docs/_references/` was read but not modified or
   imported.
6. **Current codebase.** The spec now accounts for current `ChatComposer`,
   `ChatTranscript`, `ToolCard`, cockpit panel components, and the known
   `tests/e2e/cockpit-dashboard.spec.ts` forced-click workaround.

**Outcome:** Sprint 10 spec is QA-clean and ready for human review. After
human confirmation, the next artifact is
`docs/_specs/sprint-10-ui-polish-pass/sprint.md`.
