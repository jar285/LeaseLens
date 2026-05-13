# Sprint 23f — Spec QA Checklist

Use during human review of `spec.md` before sprint kickoff.

## Problem statement
- [ ] Reproduces the user's bug ("10 collapsed tool cards but no visible emails") with concrete symptoms.
- [ ] Names the three problems the s23e.3 prompt fix did NOT solve (no Copy affordance, no severity context, tool-result data wasted).
- [ ] Explicitly positions this sprint as the proper UX, with s23e.3 as the safety net.

## Invariants
- [ ] All 12 cross-sprint invariants are present.
- [ ] Sprint-23f-specific invariants (13–17) cover: s23e.3 stays, no tool contract change, severity lookup from toolEvents, clipboard feature detection, entry animation matches UploadedLeaseCard.
- [ ] Invariant 9 (role-gated rendering) is called out as load-bearing.

## Design system
- [ ] No new tokens; only consumes 23a/23d additions.
- [ ] No new lucide icons (uses existing Copy / Check).
- [ ] Component contract names props + render shape.
- [ ] Routing logic is described in pseudo-code, not just prose.

## Acceptance criteria
- [ ] AC #4 explicitly mocks `navigator.clipboard.writeText` (no real clipboard side-effect in tests).
- [ ] AC #6 covers the disabled-when-no-clipboard fallback.
- [ ] AC #7 / #8 cover both Tenant-routes-card and Reviewer-routes-toolcard paths.

## Out of scope
- [ ] Excludes editing the email body (future "Refine").
- [ ] Excludes sending the email (no SMTP).
- [ ] Excludes changes to the `draft_negotiation_email` tool itself.
- [ ] Excludes audit/rollback UI.

## Sign-off
- [ ] Reviewer name + date.
