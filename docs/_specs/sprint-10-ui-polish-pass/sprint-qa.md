# Sprint QA - Sprint 10: UI Polish Pass

**Sprint:** 10
**Reviewing:** [sprint.md](sprint.md)
**Date:** 2026-05-01
**Reviewer:** Codex
**Status:** All findings resolved. Sprint plan is QA-clean.

---

## Summary

The Sprint 10 plan is aligned with the accepted spec and the charter delivery
loop. It keeps implementation scoped to existing chat and cockpit surfaces,
requires TDD for behavior changes, preserves the single-registry tool
invariant by avoiding AI/tooling changes, and ends with implementation QA.

QA found four issues:

- one MEDIUM issue: the focus/hover task modified chat controls but its
  verification command omitted chat component tests;
- one MEDIUM issue: the visual polish pass referenced manual review but did
  not define a concrete UI-quality rubric;
- one MEDIUM issue: the mobile cockpit E2E wording allowed an Undo click to be
  skipped if an executed row was absent;
- one LOW issue: a nested template-literal example in the composer task was
  hard to read in Markdown.

All four were resolved in [sprint.md](sprint.md). No finding required a stack
change, a new dependency, a charter amendment, or edits to
`docs/_references/`.

---

## Reference Material Reviewed

- `docs/_meta/agent-charter.md` - confirmed the current step is sprint-plan
  QA, not implementation.
- `docs/_references/README.md` - confirmed references are read-only and do
  not expand sprint scope.
- [spec.md](spec.md) - confirmed Sprint 10 scope is UI polish only.
- [spec-qa.md](spec-qa.md) - confirmed prior spec findings were resolved and
  the sprint plan should enumerate exact controls and clickability coverage.
- Current codebase file layout under `src/components/chat`,
  `src/components/cockpit`, `src/app`, and `tests/e2e` - confirmed the named
  files and existing tests exist.
- `package.json` scripts - confirmed the sprint plan uses existing commands:
  `typecheck`, `lint`, `test`, `eval:golden`, `test:e2e`, and `build`.

---

## MEDIUM - Resolved

### M1 - Focus/hover verification omitted chat component tests

**Status:** RESOLVED

**Problem.** Task 7 modifies `ChatComposer`, `ChatEmptyState`, `ChatUI`, and
`ToolCard`, but the verification command only listed `src/app/page.test.tsx`
and cockpit component tests. This could let a chat accessibility or role-name
regression slip through during the focus/hover pass.

**Fix applied.** Task 7 verification now includes:

```bash
npm run test -- src/app/page.test.tsx src/components/chat/*.test.tsx src/components/cockpit/*.test.tsx
```

### M2 - Visual polish needed a concrete manual-review rubric

**Status:** RESOLVED

**Problem.** The spec intentionally rejects screenshot regression tooling, so
manual review carries the visual-quality burden. The sprint plan said manual
review would cover aesthetics, but did not define what "polished" means for
this operational UI. That left too much room for subjective restyling during
implementation.

**Fix applied.** Added a UI polish rubric to [sprint.md](sprint.md), grounded
in restrained Adam Wathan / Steve Schoger product-UI principles:

- hierarchy through type, spacing, proximity, and weight before color;
- clear grouping and separation;
- subtle affordances rather than decorative chrome;
- distinct disabled, loading, success, error, and undo states;
- scannable dense rows with predictable action placement;
- mobile usability through wrapping, stacking, or horizontal overflow;
- fewer, clearer visual decisions over broad restyling.

Task 10 now points manual review back to that rubric.

### M3 - Mobile cockpit E2E wording could skip the Undo proof

**Status:** RESOLVED

**Problem.** Task 8 originally said the mobile smoke path should click Undo
"if an executed row is present." The default E2E already creates an executed
row before visiting the cockpit, so the mobile path should use that same
precondition. Leaving the row optional would weaken the test and could hide
the known pointer-intercept defect.

**Fix applied.** Task 8 now requires the mobile path to use the same
seeded/executed audit row path as the default viewport test and click Undo
normally after `scrollIntoViewIfNeeded()`.

---

## LOW - Resolved

### L1 - Composer implementation example had Markdown ambiguity

**Status:** RESOLVED

**Problem.** Task 2 described the computed height assignment with nested
backticks around a template literal. The intended implementation was clear
enough to infer, but the rendered Markdown was awkward and easy to misread.

**Fix applied.** Task 2 now says to set `style.height` to the computed pixel
value, for example `` `${nextHeight}px` ``.

---

## Re-verification

After applying the fixes, the sprint plan was re-read against:

1. **Spec goals.** The plan covers composer auto-resize, focus states, hover
   affordances, ToolCard loading structure, transcript scroll pinning, cockpit
   clickability, typography/spacing, and final manual review.
2. **Spec non-goals.** The plan does not add AI behavior, tools, RBAC changes,
   deployment work, visual-regression infrastructure, or new data queries.
3. **Charter delivery loop.** The plan remains at Step 4: sprint-plan QA. It
   does not start implementation.
4. **TDD discipline.** Composer, transcript, ToolCard, and cockpit
   clickability changes all begin with failing tests or failing E2E coverage.
5. **Clean Code / SOLID.** Responsibilities stay local:
   `ChatComposer` owns sizing, `ChatTranscript` owns scroll pinning,
   `ToolCard` owns tool status rendering, and cockpit panels own their
   responsive affordances.
6. **UI polish principles.** The plan now includes a review rubric that favors
   hierarchy, grouping, contrast, affordance, scannability, and responsive
   behavior without expanding into a new design system.
7. **Verification commands.** Commands map to existing `package.json` scripts.
   Full verification still requires Node.js `>=20.9.0`.
8. **Protected docs.** `docs/_references/` and
   `docs/_meta/agent-charter.md` were reviewed but not modified.

**Outcome:** Sprint 10 sprint plan is QA-clean and ready for human review.
After human confirmation, the next step is Sprint 10 implementation.
