# Sprint 23f — Implementation QA

Filled during implementation. Empty scaffold below.

## Phase 0 — Pre-flight

- [ ] `git status` clean apart from `handoff.md` and pre-existing `package*.json`.
- [ ] Baseline `npm test` → 799/799 green.
- [ ] Baseline `npm run lint` → 0 errors.
- [ ] Baseline `npm run build` succeeds.

## Phase 1 — NegotiationEmailCard component + clipboard

**TDD red-green:**

- [ ] RED: 6 tests added (testid + content, severity-with, severity-without, copy-writes, copied-feedback, clipboard-disabled-fallback); failing.
- [ ] GREEN: new component file; mock-clipboard tests pass.

## Phase 2 — ChatMessage routing

**TDD red-green:**

- [ ] RED: 3 tests added (Tenant-routes-card, Reviewer-routes-toolcard, no-prior-grading-fallback); failing.
- [ ] GREEN: ToolInvocationsBlock branch added with severity/label resolver helper.
- [ ] Existing role-gated rendering tests (ScanTimeline branch) still pass.

## Phase 3 — Entry animation

**TDD red-green:**

- [ ] RED: 2 tests added (motion-on, motion-off); failing.
- [ ] GREEN: motion.div wrapper added; useReducedMotion branch returns plain div.

## Acceptance walk

- [ ] AC #1 component renders subject + body
- [ ] AC #2 severity badge present when given
- [ ] AC #3 severity badge absent when omitted
- [ ] AC #4 Copy writes body to clipboard
- [ ] AC #5 Copied feedback shown briefly
- [ ] AC #6 disabled when no clipboard API
- [ ] AC #7 Tenant routes to email card
- [ ] AC #8 Reviewer routes to ToolCard
- [ ] AC #9 test sweep ≥ 810

## Manual smoke

- [ ] Real scan flow renders N email cards (one per high-severity clause).
- [ ] Copy button works against real clipboard.
- [ ] Reviewer mode shows inline ToolCards.
- [ ] Reduced motion suppresses animation.
- [ ] Dark mode + keyboard accessibility OK.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 101 | | |
| Total tests | 799 | | |
| Lint errors | 0 | | |
| Build | green | | |

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23f.0 | (pending) | docs(s23f): sprint-23f negotiation-email-card specs and QA scaffolds |
| s23f.1 | (pending) | feat(s23f.1): NegotiationEmailCard component + clipboard interaction |
| s23f.2 | (pending) | feat(s23f.2): ChatMessage routes Tenant draft_negotiation_email to email card |
| s23f.3 | (pending) | refactor(s23f.3): NegotiationEmailCard entry fade-in (matches UploadedLeaseCard) |
| s23f.4 | (pending) | docs(s23f): record implementation audit |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
