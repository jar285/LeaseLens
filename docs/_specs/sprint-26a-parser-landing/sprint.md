# Sprint 26a — Execution Log

This file ticks phase-by-phase as work lands. Commit SHAs are referenced where useful (filled when the sprint is squash-merged).

## Phase 1 — Audit

- [x] Consumers of `LeaseLensWorkspaceShell` and `ChatEmptyState` mapped in `spec.md` §3.
- [x] Pre-sprint test count baseline captured in `impl-qa.md` (109 test files / 919 tests).

## Phase 2 — `LeaseHeroDropzone`

- [x] Red test `src/components/lease/LeaseHeroDropzone.test.tsx` lands; vitest reports a failed import (file does not exist).
- [x] Green implementation `src/components/lease/LeaseHeroDropzone.tsx` lands.
- [x] `pnpm test src/components/lease/LeaseHeroDropzone.test.tsx` — 7/7 pass.

## Phase 3 — `ParserLandingShell` (+ `AssistantFab.stub`)

- [x] Red tests committed: `ParserLandingShell.test.tsx`, `AssistantFab.stub.test.tsx`.
- [x] Green implementations committed: `ParserLandingShell.tsx`, `AssistantFab.stub.tsx`.
- [x] Vitest 11/11 pass (7 ParserLandingShell + 4 AssistantFabStub).

## Phase 4 — `WorkspaceRouterShell`

- [x] Red test committed: `WorkspaceRouterShell.test.tsx`.
- [x] Green implementation committed: `WorkspaceRouterShell.tsx`.
- [x] Vitest 5/5 pass (4 routing decisions + 1 in-memory upload lift).

## Phase 5 — Wire into `src/app/page.tsx`

- [x] `<LeaseLensWorkspaceShell>` swapped for `<WorkspaceRouterShell>` in the page entry.
- [x] Existing tests for the post-upload three-pane shell still pass after the swap.

## Phase 6 — `AssistantFab.stub` (covered together with Phase 3)

- [x] See Phase 3.

## Phase 7 — Playwright e2e

- [x] Shared helper landed: `tests/e2e/helpers/upload-sample-lease.ts`.
- [x] New spec landed: `tests/e2e/parser-landing.spec.ts` — 3/3 pass.
- [x] Existing specs updated for the new empty-state behavior:
  - `tests/e2e/three-pane-shell.spec.ts` preflight rewritten to assert Mode A, then upload to land Mode B.
  - `tests/e2e/workspace-onboarding.spec.ts` `home renders ...` updated to assert Mode A.
  - `tests/e2e/chat-tool-use.spec.ts` opens with `uploadSampleLease(page)` before chat.
  - `tests/e2e/stream-control.spec.ts` T7 opens with `uploadSampleLease(page)` before chat.
  - `tests/e2e/role-flows.spec.ts` T14 asserts `parser-landing-shell` after Tenant cockpit redirect.

## Verification

- [x] `npm run typecheck` — green.
- [x] `npm run lint` — Sprint 26a files clean (1 stylistic warning matches the rest of the e2e suite).
- [x] `npm test` — 942/942 green (113 files; +4 files / +23 tests from baseline).
- [x] `npx playwright test` — 21/21 green.
- [ ] `npm run build` — bundle delta to be recorded in impl-qa.md.

## Design refinement noted during implementation

A nuance not in the original spec became necessary while writing tests: Mode A's dropzone upload must transition the user to Mode B in-memory, not via a hard refresh. The DB-driven `initialActiveLease` only becomes non-null after the user sends their first chat message (which is what writes `conversations.active_lease_id`), so a server-driven refresh would leave the user stuck on the landing.

Resolution: `WorkspaceRouterShell` holds local `liveActiveLease` state, seeded by `initialActiveLease`, mutated only on dropzone success. The `setLiveActiveLease` call also fires `getPdfBinaryRepository().put(...)` so cockpit-roundtrip restoration works the same as the legacy in-shell upload path (verified by `three-pane-shell.spec.ts` T3).

Documented inline in `WorkspaceRouterShell.tsx` and `WorkspaceRouterShell.test.tsx`; recorded here for future readers.
