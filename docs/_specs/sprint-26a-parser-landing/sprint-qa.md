# Sprint 26a — Sprint QA (Post-merge)

Filled after merge to `main`. Validates acceptance criteria from `spec.md` §6.

## Acceptance criteria validation

- [ ] `/` with no rehydrated active lease renders `ParserLandingShell`. No `ChatComposer` in the DOM.
- [ ] Hero headline preserved: "Find what to negotiate, before you sign."
- [ ] Hero dropzone is the visual focus (≥ 50% of fold height on 1024px viewport).
- [ ] Uploading a PDF transitions to the existing three-pane shell.
- [ ] `AssistantFab.stub` visible, keyboard-reachable, `aria-label="Open assistant"`.
- [ ] All new components colocated with passing `*.test.tsx` files.
- [ ] `tests/e2e/parser-landing.spec.ts` passes in CI.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` all green in CI.
- [ ] Test count post-sprint ≥ pre-sprint baseline.

## Evidence

- Screenshot of `/` post-merge: _attached_
- Lighthouse report: _attached_
- axe-core report: _attached_

## Follow-ups for next sprint (26b)

- _list anything from this sprint's `impl-qa.md` that should be picked up_
