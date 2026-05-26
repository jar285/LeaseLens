# Sprint 26c — Implementation QA

## Test count
- **Pre-sprint baseline** (2026-05-17, immediately after Sprint 26b): **116 test files / 961 tests passing**.
- **Post-sprint** (2026-05-17, end of Phase 7): **118 test files / 980 tests passing**.
- **Delta**: +2 files net (added `AssistantFabContext.test.tsx`, `AssistantFab.client.test.tsx`, `AssistantFab.integration.test.tsx`; deleted `AssistantFab.stub.test.tsx`), +19 tests.

Playwright (E2E):
- **Pre-sprint**: 25 specs passing.
- **Post-sprint**: 29 specs passing — `fab-assistant.spec.ts` × 4 new + 25 existing (5 of which were updated to drive chat through the FAB drawer instead of an in-layout composer).

## Red-green cadence verification

| Phase | Red commit | Green commit |
|---|---|---|
| 1 — `AssistantFabContext` | `AssistantFabContext.test.tsx` (Write) | `AssistantFabContext.tsx` (Write) |
| 2 — Composer prefill | new tests appended to `ChatComposer.test.tsx` | `initialText` prop + `useEffect` re-sync in `ChatComposer.tsx`; `initialComposerText` prop in `ChatUI.tsx` |
| 3 — `AssistantFab.client` | `AssistantFab.client.test.tsx` (Write) | `AssistantFab.client.tsx` + `AssistantFab.tsx` (dynamic wrapper) |
| 4 — Card / row actions | red tests appended to `RedFlagReport.test.tsx` and `ClausesList.test.tsx` | `CardActions` subcomponent in `RedFlagReport.tsx`; sibling Explain button in `ClausesList.tsx`; prompt templates `explainPromptFor`, `draftEmailPromptFor`, `explainPromptForClause` |
| 5 — Shell rewire | shell tests updated to expect `assistant-fab` (not stub) and to assert `results-chat-slot` absent | `ParserResultsShell.tsx`, `ParserLandingShell.tsx`, `LeaseLensWorkspaceShell.tsx` rewired; stub + its test deleted |
| 6 — Integration | `AssistantFab.integration.test.tsx` (Write) | covered by Phases 1-5 implementation |
| 7 — Playwright | `fab-assistant.spec.ts` (Write), updated 5 existing specs | covered by Phases 3-5 implementation |

## Deviations from spec

1. **Dynamic-loaded FAB needs `toBeEnabled()` wait in e2e.** Spec didn't predict this — `next/dynamic`'s loading placeholder is a `disabled` button (so layout doesn't shift), and Playwright's `.focus()` is a no-op on disabled elements. Added an `await expect(fab).toBeEnabled()` step before keyboard interactions. Worth flagging for the Sprint 26d a11y audit.

2. **`useAssistantFab()` throws when called outside the provider** — the legacy `LeaseLensWorkspaceShell` (still in the tree as a fallback) transitively renders `RedFlagReport`, which now consumes `useAssistantFab()`. To keep direct mounts working (incl. existing colocated tests), we wrapped the legacy shell in `AssistantFabProvider` too. The wrapping is harmless (no FAB is rendered by that shell) and lets us defer the legacy shell's deletion to Sprint 26d as planned.

3. **`ClausesList` row layout changed.** The row used to be a single `<button>`; now the `<li>` is a flex container with a row-click button (primary scroll-to-page) AND a sibling `<button data-testid="clauses-list-row-explain">` to avoid nested-button HTML. The existing row tests (`tagName === 'BUTTON'`, `type="button"`) still pass because the row-click button kept its testid; the Explain button is a separate sibling with its own testid.

4. **Existing chat-dependent specs needed updates beyond the planned set.** Spec listed `chat-tool-use`, `stream-control` T7, `three-pane-shell` T1/T3/T4, and `role-flows` T15. The full Playwright pass also revealed `parser-results.spec.ts:21` and `three-pane-shell.spec.ts:53` (preflight) asserted on the now-deleted `results-chat-slot` testid; both updated to assert it absent + the FAB present. The shared `open-assistant-fab.ts` helper now opens the drawer in one line.

## Follow-ups / leftovers

- **Sprint 26d**:
  - Delete `LeaseLensWorkspaceShell.tsx` + its colocated test (no remaining callers after 26c; the page router uses `ParserResultsShell`).
  - Rename `tests/e2e/three-pane-shell.spec.ts` → `tests/e2e/results-shell.spec.ts`. The filename no longer matches the rendered shell.
  - Collapse the `parser-results-shell || shell-root` fallback in `upload-sample-lease.ts` to just `parser-results-shell`.
  - Mobile layout for `ParserResultsShell` + `AssistantFab` (the FAB drawer's 440px width spills on iPhone SE; needs `calc(100vw - 24px)` floor for narrow viewports and a different drawer dimension contract).
  - Lighthouse + axe a11y pass on `/`.
  - Bundle delta measurement: capture pre/post `npm run build` output for `/`. The FAB dynamic-import should keep the landing chunk small; this needs to be measured.

- **Focus management refinement**: the drawer is `tabIndex={-1}` so Escape works at the dialog level, but focus doesn't AUTOMATICALLY move into the composer on open. Worth adding in 26d if real-user testing surfaces it as an issue.

- **Disabled chip UX**: when "Explain this clause" is disabled (no active clauseId), users see a greyed chip with no explanation. 26d could add a `title` / `aria-describedby` hint.

## Bundle delta

Pre/post `npm run build` baselines deferred to Sprint 26d's combined report.

## CI commands run
- `npm run typecheck` — green.
- `npm run lint` — clean for Sprint 26c files after auto-format.
- `npm test` — 980/980 green.
- `npx playwright test` — 29/29 green.
- `npm run build` — not run (deferred to 26d).
