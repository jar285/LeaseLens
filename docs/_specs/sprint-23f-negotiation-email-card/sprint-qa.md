# Sprint 23f — Sprint QA Checklist

Use during human review of `sprint.md` before implementation begins.

## Phase ordering
- [ ] Phase 0 (pre-flight) requires baseline tests pass before any edit.
- [ ] Phase 1 (component + clipboard) ships before Phase 2 (routing) so the routing can consume a working component.
- [ ] Phase 3 (animation) is additive to Phase 1; runs after routing is verified to avoid masking routing bugs with animation timing.
- [ ] Phase 4 explicitly HALTS for user smoke walk before any commit.

## File map
- [ ] No `src/app/api/**` files modified (no API-shape change).
- [ ] No `src/lib/tools/**` files modified (tool contract preserved).
- [ ] No DB schema or migration files modified.
- [ ] Test files listed separately from source files.
- [ ] NEW files marked NEW.

## Verification
- [ ] Phase 1 mocks `navigator.clipboard.writeText` (no real side-effects in jsdom).
- [ ] Phase 2 verifies the role gate flips behavior between Tenant and Reviewer in the same test render.
- [ ] Phase 3 verifies both motion-on and motion-off branches.
- [ ] Test impact section gives a net delta (~+11 tests, no removals).

## Risk
- [ ] Phase 2 routing risks breaking existing ChatMessage role tests — explicit cross-check step in the GREEN phase.
- [ ] Clipboard feature detection — when `navigator.clipboard` is missing, the button must be disabled (test covers this).
- [ ] Severity lookup edge case — when the matching grade_clause_severity is NOT in toolEvents, the card must render without crashing.

## Sign-off
- [ ] Reviewer name + date.
