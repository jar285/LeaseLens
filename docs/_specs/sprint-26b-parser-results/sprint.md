# Sprint 26b — Execution Log

## Phase 1 — Audit
- [x] Consumers of `LeaseLensWorkspaceShell` and the post-upload surfaces mapped in `spec.md` §3.
- [x] Pre-sprint test count baseline captured in `impl-qa.md` (113 files / 942 tests).

## Phase 2 — `ClausesList`
- [x] Red test `src/components/lease/ClausesList.test.tsx` lands; vitest reports import-resolution failure (file absent).
- [x] Green implementation `src/components/lease/ClausesList.tsx` lands.
- [x] Vitest 8/8 pass — covers empty state, extract→render, grading decoration, latest-wins, fallback-from-gradings, click→scrollToPage, button semantics, sort order.

## Phase 3 — `ParserResultsShell`
- [x] Red test `src/components/lease/ParserResultsShell.test.tsx` lands.
- [x] Green implementation `src/components/lease/ParserResultsShell.tsx` lands.
- [x] Vitest 7/7 pass — covers root render, header strip, Replace button, PDF pane state, results stack order, FAB stub, ChatUI prop forwarding.

## Phase 4 — Integration test
- [x] `ParserResultsShell.integration.test.tsx` committed and green (3/3): rehydrated tool events populate both surfaces; clause-row click + red-flag citation chip share the same scrollToPage flow; ungraded clauses appear only in ClausesList.

## Phase 5 — Wire `WorkspaceRouterShell`
- [x] Router post-upload branch now routes to `ParserResultsShell`. `WorkspaceRouterShell.test.tsx` updated (6/6); includes a new test that verifies Replace → return-to-Mode-A.
- [x] `WorkspaceRouterShell` `onReplace` handler clears `liveActiveLease`.

## Phase 6 — Playwright e2e
- [x] Shared helper `tests/e2e/helpers/upload-sample-lease.ts` updated to wait for either `parser-results-shell` (new) or `shell-root` (legacy fallback).
- [x] New spec `tests/e2e/parser-results.spec.ts` (4 tests): post-upload renders Mode B; header strip carries filename + metadata; Replace returns to Mode A; uploading after Replace restores Mode B.
- [x] Existing specs updated:
  - `tests/e2e/three-pane-shell.spec.ts` — preflight + T1/T2/T3/T4 re-targeted to `parser-results-shell` / `results-pdf-pane` selectors. T4's reattach assertion adjusted to the new "lost-cache hint + Replace" UX (the legacy `left-pane-reattach` testid is gone).
  - `tests/e2e/parser-landing.spec.ts` — post-upload assertion uses `parser-results-shell` instead of `shell-root`.
- [x] Mid-execution regression: 4 specs (T11 red-flag-interactions, T6, T18, T15 role-flows) failed because `overflow-hidden` on the inner red-flags section confused Playwright's scrollIntoView during card-toggle clicks. Removed `overflow-hidden` from `ResultsRedFlagsSection` — outer `results-stack` already owns the scroll container. All 4 then passed.

## Verification
- [x] `npm run typecheck` — green.
- [x] `npm run lint` — Sprint 26b files clean (existing repo-wide warnings unchanged).
- [x] `npm test` — 961/961 green (116 files; +3 files / +19 tests from baseline).
- [x] `npx playwright test` — 25/25 green (+4 new parser-results specs).

## Design refinements noted during implementation
1. **`onReplace` is an upward signal, not a local-only reset.** Spec §4d initially described Replace as `resetConversation()` only; that left the user stuck on Mode B with an empty PDF pane. Final shape: shell calls `resetConversation()` for local context AND `onReplace?.()` for the router shell, which clears `liveActiveLease` and returns the page to Mode A.
2. **Reattach UX changed.** Legacy three-pane shell rendered `left-pane-reattach` with an inline dropzone. New shell shows a hint + the Replace button as the recovery affordance. Spec text adjusted; T4 e2e re-targeted.
3. **Layout `overflow-hidden` matters for Playwright.** Inner section wrappers with `overflow-hidden` plus motion entry animations caused `scrollIntoView` flakiness on red-flag card toggles. Lesson for 26c/d: scroll container responsibility belongs to ONE element only (the stack), never to nested sections.
