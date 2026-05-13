# Sprint 23c — Sprint QA Checklist

Use during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests pass before any edit.
- [ ] Phase 1 (empty state) is isolated to one component + its test.
- [ ] Phase 2 (UploadedLeaseCard) creates a NEW component before routing the transcript to it.
- [ ] Phase 2 explicitly preserves the existing scan-narrative.ts contract.
- [ ] Phase 3 (composer) is additive — placeholder + kbd added, no behavior change.
- [ ] Phase 4 (timeline polish) is visual-only and has no TDD red-green.
- [ ] Phase 5 (smoke + commit) explicitly HALTS for user smoke walk before any commit.

## File map
- [ ] Every modified file appears in the file map table with phase + change type.
- [ ] No file belongs to a 23a/23b/23d surface (no globals.css, no PdfViewer, no RedFlagReport).
- [ ] Test files are listed separately from source files.
- [ ] NEW files are marked NEW.

## Verification
- [ ] Each phase has TDD red→green→refactor described (or "visual-only, no TDD" for Phase 4).
- [ ] Test impact section names the net delta (~+13 tests, no removals).
- [ ] Commit sequence is granular per phase.

## Risk
- [ ] Phase 2 routing change risks the synthetic intro being double-rendered (both as `UploadedLeaseCard` AND a `ChatMessage`) — explicit step to verify single render.
- [ ] Phase 2 routing risks breaking the existing synthetic intro's `followUpPrompts` chip rendering — preserved via the new card's chip surface.
- [ ] Phase 3 placeholder change risks an existing `placeholder.toMatch(/upload a lease/i)` test — checked and updated.
- [ ] Phase 4 visual-only changes risk no behavior break; existing tests provide the safety net.

## Sign-off
- [ ] Reviewer name + date.
