# Sprint 23e — Spec QA Checklist

Use during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Reproduces the user's bug step-by-step with the specific symptoms (re-scan on turn 2, "I don't have a record" on turn 3).
- [ ] Names both root causes (context window too small, system prompt pushes tool re-invocation).
- [ ] Cites the exact constant (`MAX_MESSAGES = 20`) and exact prompt line that contributes.

## Invariants
- [ ] All 12 cross-sprint invariants are present.
- [ ] Sprint-23e-specific invariants (13–18) cover: no API-shape change, no DB schema change, no tool contract change, `MAX_CHARS` stays, orphan-drop logic preserved, re-scan carve-out.

## Design system
- [ ] No new tokens, no component changes.
- [ ] State coverage matrix (§3c) covers first-turn / follow-up / explicit re-scan / new lease.

## Acceptance criteria
- [ ] AC #2 specifies the exact survival assertion (15 tool_result blocks survive).
- [ ] AC #4 explicitly tests the re-scan carve-out language.
- [ ] AC #5 has the test-count target (≥ 792).
- [ ] Manual AC includes both the original bug-reproducer (turn 3) AND the regression-check (turn 4) AND the re-scan carve-out (turn 5).

## Out of scope
- [ ] Excludes visual changes.
- [ ] Excludes Anthropic API request-shape changes (route layer untouched).
- [ ] Excludes DB schema changes.
- [ ] Excludes summary-window compaction (future work).

## Sign-off
- [ ] Reviewer name + date.
