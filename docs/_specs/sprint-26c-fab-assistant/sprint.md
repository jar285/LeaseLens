# Sprint 26c — Execution Log

## Phase 1 — `AssistantFabContext`
- [x] Red test `src/components/chat/AssistantFabContext.test.tsx` committed.
- [x] Green implementation `src/components/chat/AssistantFabContext.tsx` committed.
- [x] Vitest 7/7 pass — initial state, openMenu, openWith (with + without selection), openDrawer, close, throws-without-provider.

## Phase 2 — `ChatComposer.initialText` + `ChatUI.initialComposerText`
- [x] Red tests added to `ChatComposer.test.tsx`.
- [x] Green implementation: `ChatComposer` gains `initialText` (seeds state, re-syncs on value change); `ChatUI` gains `initialComposerText` (forwarded unchanged).
- [x] Vitest 14/14 in ChatComposer pass.

## Phase 3 — `AssistantFab.client` + dynamic wrapper
- [x] Red test `src/components/chat/AssistantFab.client.test.tsx` committed.
- [x] Green implementation `src/components/chat/AssistantFab.client.tsx` committed.
- [x] Dynamic wrapper `src/components/chat/AssistantFab.tsx` (next/dynamic, ssr:false, loading placeholder).
- [x] Vitest 8/8 pass — closed/menu/drawer state transitions, aria semantics, Escape close, disabled chip when no active clause.

## Phase 4 — Card / row action wiring
- [x] Red tests for RedFlagReport's new Explain + Draft email buttons committed.
- [x] Red test for ClausesList's Explain icon button committed.
- [x] Green implementation: `CardActions` subcomponent in RedFlagReport; sibling icon button in ClausesList.
- [x] `explainPromptFor`, `draftEmailPromptFor`, `explainPromptForClause` prompt templates exported for testability.
- [x] Vitest 22/22 in RedFlagReport + 10/10 in ClausesList pass.

## Phase 5 — `ParserResultsShell` / `ParserLandingShell` rewire
- [x] `ParserResultsShell` wraps subtree in `AssistantFabProvider`, deletes the temporary chat slot, mounts the real `<AssistantFab />`.
- [x] `ParserLandingShell` wraps in `AssistantFabProvider`, replaces stub with real FAB.
- [x] `LeaseLensWorkspaceShell` (legacy) wrapped in `AssistantFabProvider` so existing tests / direct mounts still work pending its Sprint 26d deletion.
- [x] `AssistantFab.stub.tsx` + its colocated test deleted.
- [x] Component tests updated to expect `assistant-fab` (not `assistant-fab-stub`).

## Phase 6 — Integration test
- [x] `src/components/chat/AssistantFab.integration.test.tsx` — 2/2 pass. Verifies openWith seeds the composer + Enter submits the prompt to `/api/chat`; close returns FAB to closed state and a fresh open re-prefills.

## Phase 7 — Playwright
- [x] New `tests/e2e/fab-assistant.spec.ts` — 4/4 pass.
- [x] New `tests/e2e/helpers/open-assistant-fab.ts` shared helper.
- [x] Existing specs updated to open the FAB drawer before driving the composer:
  - `chat-tool-use.spec.ts`
  - `stream-control.spec.ts` T7
  - `three-pane-shell.spec.ts` T1, T3, T4 (preflight + T2 don't touch the composer)
  - `role-flows.spec.ts` T15
- [x] Selector renames: `assistant-fab-stub` → `assistant-fab` across the three specs that asserted on it.
- [x] `parser-results.spec.ts` re-targeted: the temporary chat slot's testid is asserted absent.
- [x] One discovered flake: dynamic-loaded FAB starts as a disabled loading placeholder before hydration. `parser-landing.spec.ts` now waits for the pill to be `toBeEnabled()` before focusing.

## Verification
- [x] `npm run typecheck` green.
- [x] `npm run lint` — Sprint 26c files clean after auto-format pass.
- [x] `npm test` — 980/980 green (118 test files; +1 file / +2 tests from baseline net, accounting for the deleted stub test).
- [x] `npx playwright test` — 29/29 green (+4 new FAB specs).
