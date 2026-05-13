# Sprint 23c — Implementation QA

Filled during implementation. Empty scaffold below.

## Phase 0 — Pre-flight

- [ ] `git status` clean apart from `handoff.md` and `docs/_specs/sprint-23c-*`.
- [ ] Baseline `npm test` → 765/765 green.
- [ ] Baseline `npm run lint` → 0 errors.
- [ ] Baseline `npm run build` succeeds.

## Phase 1 — ChatEmptyState compact card

**TDD red-green:**

- [ ] RED: badge size + H1 size + description spacing + card padding tests added; all failing.
- [ ] GREEN: sizes reduced per spec §3b; tests pass.
- [ ] All existing empty-state tests still pass.

**Visual delta:**

| Element | Before | After |
|---|---|---|
| Brand badge | `h-14 w-14` | `h-12 w-12` |
| H1 size | `text-3xl sm:text-4xl` | `text-2xl sm:text-3xl` |
| Description | `max-w-md mb-10` | `max-w-sm mb-8` |
| Starter cards padding | `p-4` | `p-3.5` |

## Phase 2 — UploadedLeaseCard + transcript routing

**TDD red-green:**

- [ ] RED: 5 UploadedLeaseCard tests + 1 ChatTranscript route test added; all failing.
- [ ] GREEN: new file created, route applied; tests pass.
- [ ] Synthetic intro renders exactly once (verified via DOM count).

## Phase 3 — Composer command-bar polish

**TDD red-green:**

- [ ] RED: min-height + placeholder + kbd visibility tests added; failing.
- [ ] GREEN: min-h-[44px] applied; placeholder updated; kbd element added; tests pass.
- [ ] Existing Enter/Shift+Enter/lock tests still pass.

## Phase 4 — ScanTimeline + ActivityDrawer polish

**No TDD red-green (visual-only).**

- [ ] Existing ScanTimeline + ActivityDrawer tests still pass post-change.

## Acceptance walk

- [ ] AC #1 compact empty state
- [ ] AC #2 uploaded lease card with chips
- [ ] AC #3 composer command-bar
- [ ] AC #4 scan timeline polish
- [ ] AC #5 synthetic-summary suppression preserved
- [ ] AC #6 disclaimer bold preserved
- [ ] AC #7 role-gated rendering preserved
- [ ] AC #8 test sweep (≥ 778)
- [ ] AC #9 reduced motion
- [ ] AC #10 dark mode
- [ ] AC #11 keyboard

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 99 | | |
| Total tests | 765 | | |
| Lint errors | 0 | | |
| Build | green | | |

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23c.0 | (pending) | docs(s23c): sprint-23c conversation-workspace specs and QA scaffolds |
| s23c.1 | (pending) | refactor(s23c.1): tighten ChatEmptyState to compact premium card |
| s23c.2 | (pending) | feat(s23c.2): UploadedLeaseCard component + transcript routing |
| s23c.3 | (pending) | refactor(s23c.3): command-bar polish for ChatComposer |
| s23c.4 | (pending) | refactor(s23c.4): visual polish for ScanTimeline and ActivityDrawer |
| s23c.5 | (pending) | docs(s23c): record implementation audit in impl-qa.md |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
