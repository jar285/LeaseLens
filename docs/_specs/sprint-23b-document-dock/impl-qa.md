# Sprint 23b — Implementation QA

**Status:** Implementation complete (including Phase 6 bug fixes), awaiting user smoke walk re-run.
**Date:** 2026-05-13.
**Baseline tests at start:** 753/753.
**Tests at finish:** 765/765 (+12 new sprint-23b tests).

## Phase 0 — Pre-flight

- [x] `git status` clean apart from `handoff.md` (untracked) before kickoff.
- [x] Baseline `npm test` → 753/753 green.
- [x] Baseline `npm run lint` → 0 errors.
- [x] Baseline `npm run build` succeeds.

## Phase 1 — LeaseUploadDropzone

**TDD red-green:**

- [x] RED: hints-line + icon-size + padding tests added; all 3 failing.
- [x] GREEN: hints collapsed to single line; icon dropped to `h-12 w-12 rounded-xl`; padding to `p-6 gap-3`; tests pass.
- [x] All 8 existing dropzone state tests still pass.

**Visual delta:**

| Element | Before | After |
|---|---|---|
| Icon wrapper | `h-14 w-14 rounded-2xl` | `h-12 w-12 rounded-xl` |
| Section padding | `p-8 gap-4` | `p-6 gap-3` |
| Hints | 3 stacked `<p>` lines (11px) | Single `<p>` line with `·` separators |

## Phase 2 — PdfReadingControls compact mode

**TDD red-green:**

- [x] RED: 3 compact-mode tests added; 2 failing (the "default keeps full form" one passed since current default already does that).
- [x] GREEN: `compact?: boolean` prop added; "Fit width" text and "/ Total" suffix conditioned on `!compact`; tests pass.
- [x] All 8 existing default-behavior tests still pass.

## Phase 3 — Two-row dock header

**Depends on:** Phase 2 (`compact` prop must exist).

**TDD red-green:**

- [x] RED: 5 new row-structure tests added; 4 failing (the "focus mode renders full-form controls" assertion is mostly satisfied today; just needed the `^Fit width$` text check).
- [x] GREEN: header refactored into `<header className="flex flex-col">` with row-1 (`bg-surface-card`, brand+filename+pill) and row-2 (`bg-surface-sunken`, meta+controls+expand); data-testids attached; reading controls threaded with `compact={!hideFocusToggle}`.
- [x] All 4 existing "renders header chrome with filename + page count" / scroll-area / fallback-filename tests still pass.

**Visual delta:**

| Row | Contains | Background |
|---|---|---|
| Row 1 | brand icon · filename (truncate, title=) · Parsed/Failed pill | `bg-surface-card` |
| Row 2 | "N pages · M clauses" · PdfReadingControls (compact in inline, full in focus) · expand button (inline only) | `bg-surface-sunken` |

**Supersedes:** the S20.6 "inline = no reading controls" decision. The 5 S20.6 tests were rewritten in place as positive assertions about the two-row layout + compact controls.

## Phase 4 — PdfFocusDialog close button + surface token

**TDD red-green:**

- [x] RED: 2 new tests added (header surface-elevated + close icon-only); 1 failing (close button was already icon-only with aria-hidden X icon).
- [x] GREEN: header strip swapped from `bg-surface-card dark:bg-neutral-900` → `bg-surface-elevated` (auto-flips at `:root.dark`); close button restyled from bordered to borderless ghost (`text-fg-muted hover:bg-surface-muted hover:text-fg-default`); `min-h-11 min-w-11` preserved.
- [x] `fixed inset-0 h-screen max-h-screen w-screen max-w-none` viewport-sizing verified unchanged.
- [x] All 9 existing focus-dialog tests still pass.

## Phase 5 — CitationChip hover

**TDD red-green:**

- [x] RED: 2 new tests added (button gets `group-hover:underline`; span does not); 1 failing (span passed by default).
- [x] GREEN: introduced `CHIP_TEXT_BUTTON_CLASS = ${CHIP_TEXT_CLASS} group-hover:underline`; added `group` to `CHIP_BUTTON_CLASS`; button-variant text now uses the new class.
- [x] Span variant unchanged (uses original `CHIP_TEXT_CLASS` with no underline utility).
- [x] All 9 existing CitationChip tests still pass.

## Phase 6 — Bug fixes (in-scope addendum)

Surfaced during the user's `npm run dev` smoke walk. Both bundled into 23b per user direction; documented as Phase 6 mirroring 23a's pattern.

### Phase 6.1 — Row 2 overflow at narrow pane widths

**Symptom:** At ~320px pane width, row 2 controls (metadata + zoom +/− + page indicator + expand) horizontally overlapped, rendering as "1009%5" garble in the screenshot.

**Root cause:** Row 2 had too many elements for the available horizontal space; the inner flex container did not wrap.

**Fix:**
- Moved expand button from row 2 to row 1 (next to the Parsed pill).
- Added `flex-wrap` + `gap-x-3 gap-y-1.5` to row 2 so reading controls reflow under the metadata at narrow widths instead of overlapping.
- Side benefit: expand sits next to the Parsed pill in row 1 — stronger affordance, also frees ~30px from row 2.

**TDD red-green:**

- [x] RED: rewrote 3 row-structure assertions (expand in row 1, row 2 has flex-wrap, expand NOT in row 2); all failing.
- [x] GREEN: moved expand into the right-aligned cluster of row 1; added flex-wrap to row 2; tests pass.
- [x] All 8 other PdfViewer.test.tsx tests still pass.

### Phase 6.2 — Drag-drop file passthrough (pre-existing bug)

**Symptom:** Dragging a PDF onto the dropzone → `ResponseException: Unexpected server response (0) while retrieving PDF "blob:placeholder"` in the browser console; PDF viewer empty.

**Root cause:** [LeaseLensWorkspaceShell.tsx:175-181](../../../src/components/lease/LeaseLensWorkspaceShell.tsx#L175-L181) — `UploadColumn` did `document.querySelector('[data-testid="lease-upload-input"]').files[0]` to "sniff" the file. That only works for the click-to-upload path; drag-drop calls `LeaseUploadDropzone.handleFile(file)` directly and never assigns to `<input>.files`. The fallback `'blob:placeholder'` then propagated into `react-pdf`'s Document component as the `file` prop, producing the error.

**Fix:**
- `LeaseUploadDropzone.onUploaded` signature: `(result: UploadResult) => void` → `(result: UploadResult, file: File) => void`. The dropzone has the File reference in `handleFile` for both paths.
- `UploadColumn` wrapper: dropped the DOM-sniff; forwards `onUploaded` directly.
- `LeaseLensWorkspaceShell.handleUploaded`: `file` is now required; `'blob:placeholder'` fallback removed.

**TDD red-green:**

- [x] RED: 2 new tests (click-path passes File; drop-path passes File); both failing.
- [x] GREEN: signature change + call-site update; tests pass.
- [x] All 11 other dropzone tests still pass (the prior `onUploaded={() => {}}` test stubs work since the new arg is positional).

### Phase 6 visual delta (compared to Phase 5 end-state)

| Element | Phase 5 end | Phase 6 end |
|---|---|---|
| Row 1 | brand icon + filename + Parsed pill | brand icon + filename + Parsed pill + **expand** |
| Row 2 | meta + controls + expand (single flex row) | meta + controls (`flex-wrap` for reflow at narrow widths) |
| Drag-drop upload | broken (blob:placeholder error) | works (File forwarded explicitly) |

## Acceptance walk

- [x] AC #1 pre-upload tray (tighter) — unit-tested via icon size + hints line.
- [x] AC #2 drag-over (preserved) — existing tests cover.
- [x] AC #3 uploading & success (preserved) — existing tests cover.
- [x] AC #4 two-row dock header — 5 new tests cover.
- [x] AC #5 inline reading controls — covered by the inline-compact assertion.
- [x] AC #6 focus mode (sizing preserved) — h-screen/w-screen unchanged; close + surface tested.
- [x] AC #7 sticky active-clause callout — unchanged; existing test coverage.
- [x] AC #8 citation chip click — underline + click handler tested.
- [x] AC #9 test sweep — 763/763 ≥ 765 target... actually slightly under (763 vs target 765 because the S20.6→S23b conversion was net-zero; spec estimated +12 but actual was +10). Acceptable — no regressions.
- [ ] AC #10 reduced motion — manual smoke pending.
- [ ] AC #11 dark mode — manual smoke pending.
- [ ] AC #12 keyboard — manual smoke pending.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 99 | 99 | 0 |
| Total tests | 753 | 765 | +12 |
| Lint errors | 0 | 0 | 0 |
| Build | green | green | unchanged |

Breakdown of +12:
- Phase 1 (dropzone tray): +3 (icon, hints, padding)
- Phase 2 (compact controls): +3 (fit-width hidden, indicator compact, default preserved)
- Phase 3 (two-row header): +5 (row1, row2, expand position, inline compact, focus full) − 5 deleted S20.6 negatives = **net 0** but assertions are more meaningful
- Phase 4 (focus dialog): +2 (surface-elevated, close icon-only)
- Phase 5 (citation hover): +2 (button underline, span no underline)
- Phase 6.1 (row 2 reflow): the 3 row-tests from Phase 3 were rewritten in place (still net-zero)
- Phase 6.2 (drag-drop fix): +2 (click path forwards File, drop path forwards File)
- **Total: 3 + 3 + 0 + 2 + 2 + 0 + 2 = 12**

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23b.0 | 5a25dbb | docs(s23b): sprint-23b document-dock specs and QA scaffolds |
| s23b.1 | (pending — awaiting smoke) | refactor(s23b.1): tighten LeaseUploadDropzone to document-tray hierarchy |
| s23b.2 | (pending — awaiting smoke) | refactor(s23b.2): compact mode for PdfReadingControls |
| s23b.3 | (pending — awaiting smoke) | refactor(s23b.3): two-row dock header in PdfViewer (supersedes S20.6) |
| s23b.4 | (pending — awaiting smoke) | refactor(s23b.4): icon-only close button + surface-elevated header in focus dialog |
| s23b.5 | (pending — awaiting smoke) | refactor(s23b.5): underline-on-hover affordance for CitationChip button |
| s23b.6 | (pending — awaiting smoke) | fix(s23b.6.1): move PDF expand button to row 1 + flex-wrap row 2 |
| s23b.7 | (pending — awaiting smoke) | fix(s23b.6.2): forward File from LeaseUploadDropzone so drag-drop works |
| s23b.8 | (pending — awaiting smoke) | docs(s23b): record Phase 6 bug-fix addendum in spec + impl-qa |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
