# Sprint 23e — Sprint QA Checklist

Use during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests pass before any edit.
- [ ] Phase 1 (window bump) ships before Phase 2 — if only one is shipped, the data-loss bug must be fixed first.
- [ ] Phase 2 (prompt paragraph) is additive — it doesn't replace existing prompt sections.
- [ ] Phase 3 (full sweep) catches any cross-test regression.
- [ ] Phase 4 explicitly HALTS for user smoke walk before any commit.

## File map
- [ ] No `src/components/**` files modified.
- [ ] No `src/app/api/**` files modified.
- [ ] No DB schema or migration files modified.
- [ ] Test files listed separately from source files.

## Verification
- [ ] Phase 1 TDD red asserts ALL 15 tool_result blocks survive (not just "some").
- [ ] Phase 2 TDD red asserts BOTH the reuse instruction AND the re-scan carve-out.
- [ ] Test impact section gives a net delta (+2 tests, no removals).

## Risk
- [ ] Bumping `MAX_MESSAGES` 3× — verified `MAX_CHARS = 40_000` is the real safety net.
- [ ] System-prompt paragraph could under-call tools — verified the re-scan carve-out is explicit in the new copy.
- [ ] Existing alternation tests could fail at the new window size — `MAX_MESSAGES` is a cap, not a floor; smaller test transcripts are unaffected.

## Sign-off
- [ ] Reviewer name + date.
