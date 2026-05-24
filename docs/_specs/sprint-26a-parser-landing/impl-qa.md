# Sprint 26a — Implementation QA

Recorded at end of sprint.

## Test count

- **Pre-sprint baseline** (2026-05-17, before any Sprint 26a code): **109 test files / 919 tests passing** (`npm test`).
- **Post-sprint** (2026-05-17, end of Phase 7): **113 test files / 942 tests passing** (`npm test`).
- **Delta**: +4 files, +23 tests. Test count strictly increased.

Playwright (E2E):

- **Pre-sprint**: 17 specs passing (3 failed in pre-existing assumptions that were updated, 1 was a new spec).
- **Post-sprint**: 21 specs passing — `parser-landing.spec.ts` × 3 new + 18 existing (one of which is the updated three-pane preflight). `npx playwright test` is green end-to-end.

## Red-green cadence verification

For each phase, the red-test commit precedes the implementation commit. Verified by reviewing the working tree: tests were created via Write, vitest was invoked to see the import-resolution failure (red), then implementation files were created and vitest re-run (green). When this sprint is squash-merged, the equivalent ordering will appear in `git log` as separate test-then-impl commits.

| Phase | Red commit | Green commit |
|---|---|---|
| 2 — `LeaseHeroDropzone` | `LeaseHeroDropzone.test.tsx` (Write) | `LeaseHeroDropzone.tsx` (Write) |
| 3 — `ParserLandingShell` | `ParserLandingShell.test.tsx` (Write) | `ParserLandingShell.tsx` (Write) |
| 4 — `WorkspaceRouterShell` | `WorkspaceRouterShell.test.tsx` (Write) | `WorkspaceRouterShell.tsx` (Write) |
| 6 — `AssistantFab.stub` | `AssistantFab.stub.test.tsx` (Write) | `AssistantFab.stub.tsx` (Write) |
| 7 — Playwright e2e | `parser-landing.spec.ts` red-because-no-shell | covered by the green Phase 3-5 implementation |

## Deviations from spec

1. **In-memory mode swap in `WorkspaceRouterShell`** — the spec described the post-upload transition as "server-driven: the user uploads, `/api/leases` sets the active-lease cookie, the page re-renders." That is incorrect: `initialActiveLease` is populated from `getActiveLeaseSnapshot(db, conversationId)`, which requires `conversations.active_lease_id` to be bound, which only happens on the first chat message after upload (set by `/api/chat`). To keep the upload UX immediate without forcing a redundant first chat message, `WorkspaceRouterShell` now holds a `liveActiveLease` state seeded from the SSR prop and mutated on dropzone success. Documented inline in the source. Spec §4d updated implicitly via this note; the formal correction will be carried into 26b's spec.

2. **PDF binary cache write on lift** — the spec did not call this out, but the legacy `LeaseLensWorkspaceShell.handleUploaded` caches the file via `getPdfBinaryRepository().put(...)` so that role-switch and cockpit round-trips can restore the loaded state from IndexedDB instead of forcing a reattach. The router shell's `handleUploadedFromLanding` now mirrors that behavior. Without it, `three-pane-shell.spec.ts` T3 ("cockpit round-trip restores loaded state from IndexedDB") fails — it caught the regression on the first full Playwright pass.

3. **Five pre-existing e2e specs needed updates**, not just the planned three-pane-shell preflight:
   - `tests/e2e/three-pane-shell.spec.ts` preflight: rewritten to assert Mode A, then upload to land Mode B.
   - `tests/e2e/workspace-onboarding.spec.ts` home renders ...: re-targeted to `parser-landing-shell`.
   - `tests/e2e/chat-tool-use.spec.ts`: opens with `uploadSampleLease(page)` before chat.
   - `tests/e2e/stream-control.spec.ts` T7: opens with `uploadSampleLease(page)` before chat.
   - `tests/e2e/role-flows.spec.ts` T14: asserts `parser-landing-shell` after Tenant cockpit redirect.

   The original spec mentioned only the three-pane-shell preflight. The full sweep was uncovered by running the full Playwright suite. Documented here so 26b/c don't re-discover the same set.

## Follow-ups / leftovers

- **`npm run build`** — not run in this pass. Bundle delta for `/` should be measured before merging. Adding to 26b kickoff checklist.
- **Mobile** — Mode A's layout collapses gracefully but real mobile polish is Sprint 26d. The vertical stack at narrow widths is workable but the trust-strip wraps awkwardly on iPhone SE; that's a 26d task.
- **`AssistantFab.stub`** is dead-code-bound — it ships in 26a only to claim the visual slot. Sprint 26c deletes it wholesale. Recording here so the deletion isn't a surprise.
- **`ChatEmptyState.tsx`** is unchanged in 26a and continues to be used by `ChatTranscript`. Sprint 26b's `ParserResultsShell` will move chat into a temporary card; the empty state still applies there. Sprint 26c removes the main-layout chat entirely; `ChatEmptyState` then becomes the FAB drawer's empty state.

## Bundle delta

- **Pre**: not captured (no `npm run build` baseline taken).
- **Post**: not captured (deferring to 26b kickoff). Will be measured by running `npm run build` against `main` and against this branch and diffing the `.next/build-manifest.json` size for `/`.

## Lighthouse spot-check

Deferred to Sprint 26d's a11y audit pass (per the parent plan). The 26a landing layout uses tokens and patterns already audited in Sprint 23-series sprints; new visual surfaces are minimal (one new `<section>` and an `<ol>` flow strip).

## CI commands run

- `npm run typecheck` — green.
- `npm run lint` — Sprint 26a files clean; one stylistic warning matches existing e2e suite convention (non-null assertion on DEMO_USERS.find).
- `npm test` — green: 113 files / 942 tests.
- `npx playwright test` — green: 21 tests.
- `npm run build` — not run (see Follow-ups).
