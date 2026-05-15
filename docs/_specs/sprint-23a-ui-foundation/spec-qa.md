# Sprint 23a — Spec QA Checklist

Use this list during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Problem section names the three concrete substrate issues: token closure, shell composition, motion budget audit.
- [ ] Token-closure problem cites at least one inline-value callsite that motivates each new token category.
- [ ] Shell composition problem explains why an extraction unblocks 23b/c/d, not just "code cleanliness".
- [ ] Motion budget problem is grounded — it references Sprint 15 tokens as the canonical set rather than proposing new ones.

## Invariants
- [ ] All 12 cross-sprint invariants are present verbatim.
- [ ] Public component surface freeze is explicit (paths, exports, props).
- [ ] `useReducedMotion()` gate is described as non-negotiable.
- [ ] Synthetic scan-summary suppression invariant references the actual logic location.
- [ ] PDF focus dialog sizing invariant cites the failed-attempt history.

## Design system
- [ ] New tokens are additive only — no existing token values change.
- [ ] Each new token category lists both the light values and the `:root.dark` companions where they differ.
- [ ] Pane-gutter spacing decision is described as "audit first, decide" — not pre-committed.
- [ ] Shell extractions are described as gated by the audit, not assumed.
- [ ] Motion sweep is mechanical, not creative.

## Acceptance criteria
- [ ] Each AC is concretely verifiable (DevTools inspection, smoke walk, `grep` returning zero, etc.).
- [ ] AC for dark mode flip covers the new tokens.
- [ ] AC for reduced motion is independent of AC for the token sweep.
- [ ] No AC depends on a 23b/c/d deliverable.

## Out of scope
- [ ] List excludes any visible-pane change.
- [ ] List excludes new dependencies.
- [ ] List excludes the manual ThemeToggle refactor (handoff §6 preserves it).

## Cross-references
- [ ] References to handoff §3, §6, §8, §21 are present and accurate.
- [ ] Downstream sprint links point to existing spec.md files.

## Sign-off
- [ ] Reviewer name + date when approved.
