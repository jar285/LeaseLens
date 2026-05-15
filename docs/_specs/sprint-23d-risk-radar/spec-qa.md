# Sprint 23d — Spec QA Checklist

Use during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Names three concrete weaknesses (no icon for severity, static empty state, flat summary row).
- [ ] Cites handoff §14 (right pane direction) and §19 (severity not color-alone).
- [ ] Explicitly lists what is NOT changing (scan pipeline, grading logic, severity tiers, `scrollToPage`).

## Invariants
- [ ] All 12 cross-sprint invariants are present.
- [ ] Sprint-23d-specific invariants (13–17) cover: severity-sort, scrollToPage flow, AnimatePresence, ActiveRing, grading.ts exports.
- [ ] §4 "severity not color-alone" invariant is called out as load-bearing.

## Design system
- [ ] No new tokens; SeverityBadge consumes existing semantic + accent tokens.
- [ ] grading.ts stays JSX-free; icon mapping lives in SeverityBadge.tsx.
- [ ] State coverage matrix in §3d reflects idle / scanning-extracting / scanning-grading / complete.
- [ ] Component-refactor rows name path + phase + change scope.

## Acceptance criteria
- [ ] AC #6 explicitly mentions grayscale-emulation as the colour-blindness check.
- [ ] AC #7 covers severity-sort preservation.
- [ ] AC #8 covers jump-to-page preservation.
- [ ] AC #10 covers reduced motion across pulse + slide-in + ring-fade.
- [ ] AC #12 covers keyboard focus order.

## Out of scope
- [ ] Excludes confidence indicator (data doesn't support).
- [ ] Excludes header rename to "Risk Radar".
- [ ] Excludes 23a/b/c surfaces.

## Sign-off
- [ ] Reviewer name + date.
