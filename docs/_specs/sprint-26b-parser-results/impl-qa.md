# Sprint 26b — Implementation QA

## Test count
- **Pre-sprint baseline** (2026-05-17, immediately after Sprint 26a): **113 test files / 942 tests passing**.
- **Post-sprint** (2026-05-17, end of Phase 6): **116 test files / 961 tests passing**.
- **Delta**: +3 files (`ClausesList.test.tsx`, `ParserResultsShell.test.tsx`, `ParserResultsShell.integration.test.tsx`), +19 tests. Test count strictly increased.

Playwright (E2E):
- **Pre-sprint**: 21 specs passing.
- **Post-sprint**: 25 specs passing — `parser-results.spec.ts` × 4 new + 21 existing. `npx playwright test` green end-to-end.

## Red-green cadence verification

| Phase | Red commit | Green commit |
|---|---|---|
| 2 — `ClausesList` | `ClausesList.test.tsx` (Write) | `ClausesList.tsx` (Write) |
| 3 — `ParserResultsShell` | `ParserResultsShell.test.tsx` (Write) | `ParserResultsShell.tsx` (Write) |
| 4 — Integration | `ParserResultsShell.integration.test.tsx` (Write) | covered by Phase 3 implementation |
| 5 — Router wiring | `WorkspaceRouterShell.test.tsx` updated to expect `parser-results-shell` | `WorkspaceRouterShell.tsx` imports + uses `ParserResultsShell` |
| 6 — Playwright | `tests/e2e/parser-results.spec.ts` would fail red without the implementation; existing specs failed against the new shell until selectors updated | covered by Phases 3-5 implementation + selector updates |

## Deviations from spec

1. **`onReplace` is an upward callback, not just a local reset.** Spec §4d described Replace as calling `resetConversation()` only. That left users stuck in Mode B with an empty PDF pane. Final design: the shell calls both `resetConversation()` (local context) AND `onReplace?.()` (parent signal). The router shell clears its `liveActiveLease` so the page returns to Mode A. Spec carries this revised semantics; `ParserResultsShell.test.tsx` and `WorkspaceRouterShell.test.tsx` both pin the contract.

2. **Reattach UX changed.** The legacy three-pane shell rendered an inline dropzone inside the reattach pane (`left-pane-reattach` testid). The new shell shows a hint card ("We lost the cached file. Use Replace to re-upload it.") and routes recovery through the Replace button. The old testid is gone; T4 in `three-pane-shell.spec.ts` adapted to the new copy + Replace-button assertion. Listed here so 26d's cleanup knows the legacy testid is unreachable.

3. **`overflow-hidden` removed from `ResultsRedFlagsSection`.** Initial implementation wrapped the red-flag section in `overflow-hidden`. Playwright's `scrollIntoView` on `red-flag-card-toggle` then flailed (the click point ended up under adjacent section headers in alternating retries). Removed the inner clipping — only `results-stack` owns scroll. No visual change; T11/T6/T18 immediately passed.

4. **Updated 5 e2e specs** (3 originally planned, 2 surfaced during full Playwright pass):
   - `tests/e2e/three-pane-shell.spec.ts` — preflight + T1/T2/T3/T4 re-targeted to new testids.
   - `tests/e2e/parser-landing.spec.ts` — Mode A → Mode B assertion updated.
   - `tests/e2e/red-flag-interactions.spec.ts` — green after the overflow-hidden fix (no spec edit needed).
   - `tests/e2e/role-flows.spec.ts` T15 — green after the overflow fix (no spec edit needed).
   - The `upload-sample-lease` helper now waits for either testid during the transition.

## Follow-ups / leftovers

- **Sprint 26c**: remove the temporary chat slot inside `ParserResultsShell` and wire the real FAB. Tests that depend on `results-chat-slot` for chat reachability should target the FAB drawer instead.
- **Sprint 26d**:
  - Rename `tests/e2e/three-pane-shell.spec.ts` → `tests/e2e/results-shell.spec.ts` and collapse the `parser-results-shell` / `shell-root` fallback in `upload-sample-lease`.
  - Delete `LeaseLensWorkspaceShell.tsx` (no remaining callers after Sprint 26c).
  - Add a mobile layout for `ParserResultsShell` (the current `lg:flex-row` collapses to vertical stack at narrow widths but the proportions need tuning, and the FAB needs safe-area inset).
- **`min-h-105` substitution**: biome flagged `min-h-[420px]` and we switched to `min-h-105`. If the chat slot ever needs a different exact pixel height, revisit.
- **`pb-24` on `results-stack`** — currently 96px of bottom padding reserves space for the FAB. Sprint 26c's real FAB may want a different reservation; revisit at that time.

## Bundle delta
- Pre/post `npm run build` baselines not captured in this sprint (carried over from 26a's deferral). 26d will run the build once at start and end for a single combined report.

## Lighthouse spot-check
Deferred to Sprint 26d.

## CI commands run
- `npm run typecheck` — green.
- `npm run lint` — Sprint 26b files clean.
- `npm test` — 961/961 green.
- `npx playwright test` — 25/25 green.
- `npm run build` — not run (deferred to 26d).
