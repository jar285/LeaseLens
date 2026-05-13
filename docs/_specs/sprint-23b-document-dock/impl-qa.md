# Sprint 23b — Implementation QA

Filled during implementation. Empty scaffold below.

## Phase 0 — Pre-flight

- [ ] `git status` clean apart from `handoff.md` and `docs/_specs/sprint-23b-*`.
- [ ] Baseline `npm test` → 753/753 green.
- [ ] Baseline `npm run lint` → 0 errors.
- [ ] Baseline `npm run build` succeeds.

## Phase 1 — LeaseUploadDropzone

**TDD red-green:**

- [ ] RED: hints-line test + icon-size test added; both failing.
- [ ] GREEN: hints collapsed to single line; icon dropped to `h-12 w-12`; tests pass.
- [ ] All existing dropzone state tests still pass.

**Visual delta:**

| Element | Before | After |
|---|---|---|
| Icon wrapper | `h-14 w-14 rounded-2xl` | `h-12 w-12 rounded-xl` |
| Section padding | `p-8 gap-4` | `p-6 gap-3` |
| Hints | 3 stacked `<p>` lines (11px) | Single `<p>` line with `·` separators |

## Phase 2 — PdfReadingControls compact mode

**TDD red-green:**

- [ ] RED: 3 compact-mode tests added; all failing.
- [ ] GREEN: `compact?` prop added; rendering conditioned; tests pass.
- [ ] Default-behavior tests (no `compact`) still pass.

## Phase 3 — Two-row dock header

**Depends on:** Phase 2 (`compact` prop must exist).

**TDD red-green:**

- [ ] RED: 5 new row-structure tests added; all failing.
- [ ] GREEN: header split into row-1 / row-2; data-testids attached; surface-sunken applied; tests pass.
- [ ] Existing filename / page-count / parsed-pill tests still pass.

**Visual delta:**

| Row | Contains | Background |
|---|---|---|
| Row 1 | brand icon · filename (truncate) · Parsed/Failed pill | `bg-surface-card` |
| Row 2 | "N pages · M clauses" · PdfReadingControls (compact) · expand button (when inline) | `bg-surface-sunken` |

## Phase 4 — PdfFocusDialog close button + surface token

**TDD red-green:**

- [ ] RED: close-button icon-only + surface-elevated tests added; failing.
- [ ] GREEN: close button restyled; header strip token swapped; tests pass.
- [ ] `fixed inset-0 h-screen w-screen` sizing verified unchanged (regex grep on the file).

## Phase 5 — CitationChip hover

**TDD red-green:**

- [ ] RED: underline-on-hover test for button variant added; failing.
- [ ] GREEN: `group-hover:underline` added; test passes.
- [ ] Span variant unchanged (existing tests preserved).

## Acceptance walk

- [ ] AC #1 pre-upload tray (tighter)
- [ ] AC #2 drag-over (preserved)
- [ ] AC #3 uploading & success (preserved)
- [ ] AC #4 two-row dock header
- [ ] AC #5 inline reading controls
- [ ] AC #6 focus mode (sizing preserved)
- [ ] AC #7 sticky active-clause callout
- [ ] AC #8 citation chip click
- [ ] AC #9 test sweep (≥ 765)
- [ ] AC #10 reduced motion
- [ ] AC #11 dark mode
- [ ] AC #12 keyboard

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 99 | | |
| Total tests | 753 | | |
| Lint errors | 0 | | |
| Build | green | | |

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23b.0 | (pending) | docs(s23b): sprint-23b document-dock specs and QA scaffolds |
| s23b.1 | (pending) | refactor(s23b.1): tighten LeaseUploadDropzone to document-tray hierarchy |
| s23b.2 | (pending) | refactor(s23b.2): compact mode for PdfReadingControls |
| s23b.3 | (pending) | refactor(s23b.3): two-row dock header in PdfViewer (consumes compact) |
| s23b.4 | (pending) | refactor(s23b.4): icon-only close button + surface-elevated header in focus dialog |
| s23b.5 | (pending) | refactor(s23b.5): underline-on-hover affordance for CitationChip button |
| s23b.6 | (pending) | docs(s23b): record implementation audit in impl-qa.md |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
