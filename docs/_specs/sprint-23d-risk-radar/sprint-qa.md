# Sprint 23d — Sprint QA Checklist

Use during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests pass before any edit.
- [ ] Phase 1 (SeverityBadge) creates the new primitive before Phase 2 consumes it.
- [ ] Phase 2 (RedFlagReport consumer) depends on Phase 1.
- [ ] Phase 3 (skeleton) is independent — no TDD red-green (visual mirror only).
- [ ] Phase 4 (empty-state preview) depends on Phase 1 (SeverityBadge used in mock card).
- [ ] Phase 5 (header polish) is visual-only.
- [ ] Phase 6 (smoke + commit) explicitly HALTS for user smoke walk before any commit.

## File map
- [ ] Every modified file appears in the file map with phase + change type.
- [ ] No file belongs to a 23a/b/c surface (no globals.css, no PdfViewer, no ChatComposer).
- [ ] NEW files marked NEW.

## Verification
- [ ] Each phase has TDD red→green→refactor (or "visual-only, no TDD" for Phase 3 + Phase 5).
- [ ] Test impact section gives a net delta (~+10 tests, no removals).
- [ ] Commit sequence is granular per phase.

## Risk
- [ ] Phase 2 consumer swap risks breaking existing card tests that match the old pill markup — checked, the existing tests target `data-testid` and severity attributes, not class names.
- [ ] Phase 4 example preview risks adding visual noise to the empty state — example renders at lower opacity with explicit "Example" eyebrow.
- [ ] No risk to severity-sort: only the badge rendering changes, not the sort.

## Sign-off
- [ ] Reviewer name + date.
