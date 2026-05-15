# Sprint 23b — Sprint QA Checklist

Use during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests pass before any edit.
- [ ] Phase 1 (dropzone) is isolated to one component and its test.
- [ ] Phase 2 (two-row header) depends on Phase 3's `compact` prop existing — note about adding `compact` before Phase 2 if needed.
- [ ] Phase 3 (compact mode) is additive, default-preserves current behavior.
- [ ] Phase 4 (focus dialog) does NOT touch the `fixed inset-0 h-screen w-screen` sizing.
- [ ] Phase 5 (citation hover) doesn't touch the span variant.
- [ ] Phase 6 (smoke + commit) explicitly HALTS for user smoke walk before any commit.

## File map
- [ ] Every modified file appears in the file map table with phase + change type.
- [ ] No file belongs to a 23a/23c/23d surface (no globals.css, no ChatComposer, no RedFlagReport).
- [ ] Test files are listed separately from source files.

## Verification
- [ ] Each phase has TDD red→green→refactor described.
- [ ] Test impact section names the net delta (+~12 tests, no removals).
- [ ] Commit sequence is granular per phase.

## Risk
- [ ] Phase 2 (two-row header) risks breaking existing PdfViewer.test.tsx assertions — checked that selectors target text/testids not class names.
- [ ] Phase 4 (close button) risks breaking the touch-target test if the new style drops below `min-h-11` — explicit step preserves it.
- [ ] Phase 5 (citation underline) risks regressing focus ring — visual verify step in place.

## Sign-off
- [ ] Reviewer name + date.
