# Implementation QA - Sprint 10: UI Polish Pass

**Sprint:** 10
**Reviewing:** Sprint 10 implementation
**Date:** 2026-05-01
**Reviewer:** Codex
**Status:** Pass with notes.

---

## Summary

Sprint 10 is implemented. The chat composer now auto-resizes to a 192px cap,
the transcript distinguishes pinned streaming updates from user-scrolled
state, pending ToolCards show a compact loading body, focus/hover affordances
are more consistent, and cockpit dense rows are contained so Undo remains
clickable at default and mobile widths.

The implementation stayed within existing chat/cockpit surfaces. It did not
change AI behavior, tool registration, RBAC policy, database schema, API route
surface, deployment, or `docs/_references/`.

---

## What Changed

- Added `src/components/chat/ChatComposer.test.tsx`.
- Added `src/components/chat/ChatTranscript.test.tsx`.
- Added `src/components/chat/ToolCard.test.tsx`.
- Implemented composer DOM-owned auto-sizing in `ChatComposer`.
- Implemented transcript scroll pinning with message-count reset in
  `ChatTranscript`.
- Added a pending ToolCard loading body with accessible status text.
- Added focus-visible and restrained hover states to planned chat and cockpit
  controls.
- Added cockpit responsive containment with `min-w-0`, `overflow-hidden`, and
  horizontal overflow for dense operational rows.
- Updated cockpit E2E to remove the forced Undo click and add mobile-width
  clickability coverage.
- Tightened Playwright setup so `npm run test:e2e` starts the dev server with
  deterministic E2E mock behavior.

---

## TDD Evidence

Initial Sprint 10 chat tests failed before implementation:

```text
ChatComposer.test.tsx: 3 auto-size/reset failures
ChatTranscript.test.tsx: 3 scroll-pinning/testid failures
ToolCard.test.tsx: 1 pending-loading failure
```

After implementation:

```text
src/components/chat/ChatComposer.test.tsx
src/components/chat/ChatTranscript.test.tsx
src/components/chat/ToolCard.test.tsx
src/app/page.test.tsx
src/components/chat/ChatMessage.test.tsx

5 files passed, 28 tests passed
```

---

## Verification

The local shell default is Node `v18.14.0`, so commands requiring the app stack
were run through a temporary Node 20 runtime:

```bash
npm exec --yes --package=node@20 -- <command>
```

The temporary runtime reported Node `v20.20.2`.

Final verification results:

```text
npm run typecheck
PASS

npm run lint
PASS - Checked 107 files. No fixes applied.

npm exec --yes --package=node@20 -- npm run test
PASS - 41 test files, 185 tests.

npm exec --yes --package=node@20 -- npm run eval:golden
PASS - Golden eval: 5/5 passed, 17.0/20.0 points.

npm exec --yes --package=node@20 -- npm run test:e2e
PASS - 3 Playwright tests.

npm exec --yes --package=node@20 -- npm run build
PASS

git diff --check
PASS
```

Build warning noted but not introduced by Sprint 10:

```text
The "middleware" file convention is deprecated. Please use "proxy" instead.
```

---

## Manual Review Notes

No separate human visual pass was performed in this agent session. Agent-side
smoke coverage was exercised through Playwright:

- `/` chat ToolCard flow starts from a fresh conversation and verifies Undo.
- `/cockpit` default viewport verifies panel visibility and normal Undo click.
- `/cockpit` mobile viewport verifies panel visibility and normal Undo click.

Human visual review is still recommended for the final subjective polish pass:
composer growth feel, row density, hover/focus look, and mobile scrolling
comfort.

---

## Deviations

Two verification-related adjustments went beyond the narrow file list in the
original sprint plan:

1. `tests/e2e/chat-tool-use.spec.ts` now starts from a fresh conversation when
   stale local conversation history exists. This prevents old persisted
   messages from masking the ToolCard flow.
2. `playwright.config.ts` now starts the web server with
   `CONTENTOPS_E2E_MOCK=1` in the command itself. The config already intended
   deterministic mock mode, but the plain `npm run test:e2e` path could still
   hit non-deterministic model behavior before this change.

The cockpit E2E now seeds its audit row directly in SQLite. This keeps cockpit
clickability tests focused on cockpit layout and rollback controls rather than
chat/model behavior.

---

## Protected Paths

Confirmed with `git diff -- docs/_references docs/_meta/agent-charter.md`:

- `docs/_references/` was not modified.
- `docs/_meta/agent-charter.md` was not modified.

Reference patterns were adapted with citations in source comments:

- `docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.tsx`
- `docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts`

---

## Context7 Note

No Context7 MCP tool was available in this session. The implementation used
existing local APIs and verified behavior through TypeScript, Vitest,
Playwright, eval, and build commands.

---

## Outcome

Sprint 10 implementation is QA-clean from the agent side and ready for human
review.
