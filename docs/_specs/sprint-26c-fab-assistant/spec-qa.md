# Sprint 26c — Spec QA

## Clarity
- [x] Problem names the user-visible change (chat moves from inline card to FAB).
- [x] Invariants carry verbatim from prior sub-sprints.
- [x] Audit lists every component being modified and every spec needing updates.
- [x] FAB state machine + drawer dimensions documented.
- [x] Quick-action chip prompts sourced from existing `follow-up-prompts.ts`.

## Contracts
- [x] No tool / route / schema changes.
- [x] `ChatUI` and `ChatComposer` gain a single optional prop each — additive, non-breaking.
- [x] Dynamic import for the FAB client keeps the homepage's first-paint bundle small.

## Risks identified
- **Risk**: dynamic-imported FAB can be brittle in tests if not mocked. Vitest unit tests will import the client module directly (`AssistantFab.client`) to bypass `next/dynamic`. Playwright sees the real dynamic-loaded component.
- **Risk**: focus trap in a `<dialog>` element relies on the browser's default. Need to verify Playwright's `keyboard.press('Escape')` triggers `close`; if `<dialog>` proves flaky we'll fall back to a manual focus-trap.
- **Risk**: `ChatStreamContext.activeClauseId` clears on a 4s timer (set by RedFlagReport's `jumpToClausePage`). If the FAB drawer opens AFTER the timer fires, "Explain this clause" disables. Resolution: `openWith` carries `clauseId` in its own payload, so the FAB drawer reads the context-frozen clauseId, not the live `activeClauseId`.
- **Risk**: `RedFlagReport` is large and dense. Adding two new buttons inside each card without disrupting current motion/layout requires careful placement. Plan: place under the "Recommended action" section in the expanded card, as a small button row.

## Open questions
(none)
