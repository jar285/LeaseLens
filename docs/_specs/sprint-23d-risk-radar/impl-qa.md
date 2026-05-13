# Sprint 23d — Implementation QA

Filled during implementation. Empty scaffold below.

## Phase 0 — Pre-flight

- [ ] `git status` clean apart from `handoff.md` and `docs/_specs/sprint-23d-*`.
- [ ] Baseline `npm test` → 780/780 green.
- [ ] Baseline `npm run lint` → 0 errors.
- [ ] Baseline `npm run build` succeeds.

## Phase 1 — SeverityBadge primitive

**TDD red-green:**

- [ ] RED: tests added (icon per severity, label per severity, pill colour, size variant); all failing (file doesn't exist).
- [ ] GREEN: new file created; tests pass.

## Phase 2 — RedFlagReport consumes SeverityBadge

**TDD red-green:**

- [ ] RED: badge-in-card + badge-in-summary tests added; failing.
- [ ] GREEN: inline pill replaced with `<SeverityBadge>`; summary row dot-text replaced with sm-badge; tests pass.
- [ ] Severity-sort preserved (HIGH first); AnimatePresence enter/exit preserved.

## Phase 3 — RedFlagSkeletonCard mirrors new hierarchy

**No TDD red-green (visual mirror only).**

- [ ] Icon-placeholder added.
- [ ] Existing skeleton-card tests still pass.

## Phase 4 — Empty-state example preview card

**TDD red-green:**

- [ ] RED: preview-testid + example-eyebrow tests added; failing.
- [ ] GREEN: mock card added inside empty branch above the existing bulleted list; tests pass.

## Phase 5 — RedFlagsPaneHeader polish

**No TDD red-green (visual-only).**

- [ ] Existing pane-header tests still pass.

## Acceptance walk

- [ ] AC #1 SeverityBadge primitive renders correctly for each severity
- [ ] AC #2 cards use SeverityBadge
- [ ] AC #3 summary row uses SeverityBadge
- [ ] AC #4 empty-state preview card
- [ ] AC #5 skeleton card aligned with new hierarchy
- [ ] AC #6 severity not color-alone (grayscale emulation)
- [ ] AC #7 severity-sort preserved
- [ ] AC #8 jump-to-page preserved
- [ ] AC #9 test sweep (≥ 790)
- [ ] AC #10 reduced motion
- [ ] AC #11 dark mode
- [ ] AC #12 keyboard

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 100 | | |
| Total tests | 780 | | |
| Lint errors | 0 | | |
| Build | green | | |

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23d.0 | (pending) | docs(s23d): sprint-23d risk-radar specs and QA scaffolds |
| s23d.1 | (pending) | feat(s23d.1): SeverityBadge primitive (text + icon + colour) |
| s23d.2 | (pending) | refactor(s23d.2): RedFlagReport consumes SeverityBadge |
| s23d.3 | (pending) | refactor(s23d.3): RedFlagSkeletonCard mirrors new hierarchy |
| s23d.4 | (pending) | feat(s23d.4): example preview card in empty state |
| s23d.5 | (pending) | refactor(s23d.5): RedFlagsPaneHeader polish |
| s23d.6 | (pending) | docs(s23d): record implementation audit |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
