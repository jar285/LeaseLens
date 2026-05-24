# Sprint 26a — Spec QA

Spec review checklist. Resolved before implementation begins.

## Clarity

- [x] Problem statement names the user-visible change (chat-first → parser-first landing).
- [x] Invariants enumerated and carried verbatim from the parent plan.
- [x] Audit lists every current consumer of components being changed.
- [x] Design includes a visual ASCII diagram + a per-component change table.
- [x] Phases are ordered red-test-before-implementation.

## Contracts

- [x] No new external dependencies introduced.
- [x] No route/API/schema changes.
- [x] Public component surface for unchanged components is preserved (`LeaseUploadDropzone`, `LeaseLensWorkspaceShell`, `ChatStreamContext` unchanged).
- [x] `ChatStreamProvider` continues to wrap any surface that needs `useChatStream()`. `ParserLandingShell` is responsible for wrapping its own subtree because the post-upload `LeaseLensWorkspaceShell` wraps its own.

## Risks identified

- **Risk**: The Playwright e2e helper `upload-sample-lease.ts` is introduced in this sprint and reused by 26b/c/d. If it has a bug, all four sprints are blocked.
  - **Mitigation**: Helper is exercised once in Sprint 26a's spec; if it works there it works downstream. Keep it intentionally tiny — one function, one assertion that upload completed.
- **Risk**: The router shell renders different children based on `initialActiveLease`. SSR/CSR mismatch is possible if the prop value differs between server render and client hydrate.
  - **Mitigation**: `initialActiveLease` is server-rendered in `src/app/page.tsx` from the DB; it's a stable prop for the lifetime of the page render. The router decision happens at first render and does not depend on client state.
- **Risk**: `ChatEmptyState` still exists; if someone accidentally re-mounts it on the landing path the regression returns silently.
  - **Mitigation**: `ParserLandingShell.test.tsx` asserts the chat composer's `data-testid` is absent. Playwright spec asserts the same on the real homepage.

## Open questions

(none)

## Resolved

(filled as questions come up and get answered during implementation)
