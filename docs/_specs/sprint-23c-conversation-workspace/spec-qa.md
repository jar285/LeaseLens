# Sprint 23c — Spec QA Checklist

Use during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Names three concrete weaknesses (empty hero, intro markdown, generic composer), each grounded with file:line references.
- [ ] Cites handoff §13, §15, §18 as sources of the redesign direction.
- [ ] Explicitly lists what is NOT changing (streaming wire format, scan flow, classifier, synthetic-summary suppression, disclaimer bold).

## Invariants
- [ ] All 12 cross-sprint invariants are present.
- [ ] Sprint-23c-specific invariants (13–16) cover: scan-narrative contract, FOLLOW_UP_PROMPTS chip rendering, composer keystroke contract, streaming wire format.
- [ ] Synthetic scan-summary suppression invariant is explicit (this sprint touches the transcript renderer).

## Design system
- [ ] No new tokens added; only consumes 23a additions.
- [ ] Each component-refactor row names: path, phase, what changes — no rename, no signature change (except new `UploadedLeaseCard` file).
- [ ] `UploadedLeaseCard` props described (filename, pageCount, clauseCount, prompts, onSelectPrompt).
- [ ] State-coverage matrix in §3c reflects all five center-pane states.

## Acceptance criteria
- [ ] AC #2 covers all four action chips dispatching.
- [ ] AC #5 explicitly tests synthetic-summary suppression preservation.
- [ ] AC #6 explicitly verifies disclaimer bold (load-bearing).
- [ ] AC #7 covers Tenant vs Reviewer/Admin role-gated rendering.
- [ ] AC #9 covers reduced motion.

## Out of scope
- [ ] Excludes legal-pipeline changes.
- [ ] Excludes actual slash-command behavior (visual hint only).
- [ ] Excludes re-introducing the paperclip removed in 23a.
- [ ] Excludes 23b/23d surfaces.

## Sign-off
- [ ] Reviewer name + date.
