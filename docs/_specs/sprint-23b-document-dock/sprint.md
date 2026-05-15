# Sprint 23b — Document Dock — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 5. TDD-driven where the change is testable in jsdom (className/markup assertions); visual-only changes verified by smoke walk.

---

## Phase 0 — Pre-flight

1. `git status` shows working tree clean apart from `handoff.md` (still untracked) and any pre-existing modifications. No 23a leftovers.
2. Baseline: `npm test` (expect 753/753) + `npm run lint` (0 errors) + `npm run build`.
3. Re-read [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx), [src/components/lease/LeaseUploadDropzone.tsx](../../../src/components/lease/LeaseUploadDropzone.tsx), [src/components/lease/PdfReadingControls.tsx](../../../src/components/lease/PdfReadingControls.tsx) end-to-end before editing.

## Phase 1 — Repackage `LeaseUploadDropzone` as document tray

**Files touched:** [src/components/lease/LeaseUploadDropzone.tsx](../../../src/components/lease/LeaseUploadDropzone.tsx), [src/components/lease/LeaseUploadDropzone.test.tsx](../../../src/components/lease/LeaseUploadDropzone.test.tsx).

**TDD:**
1. RED — add a test asserting the idle state hints render as a **single** line (one `<p>` inside the hints region), not three. Add a test asserting the icon wrapper uses `h-12 w-12` (was `h-14 w-14`). Run; expect 2 new failures.
2. GREEN — collapse the three hint lines into one `<p>` with `·`-separator. Drop icon dimensions to `h-12 w-12`. Tighten outer padding from `p-8` to `p-6`; tighten gap from `gap-4` to `gap-3`. Run; tests green. Existing dropzone state tests should all still pass.
3. REFACTOR — verify the `data-status` attribute still toggles correctly per state. Run the full `LeaseUploadDropzone.test.tsx` suite.

**Verification:** Tests green; `npm run lint` clean. Smoke check: open `/`, confirm the dropzone reads tighter (visual judgment, not test).

## Phase 2 — `compact` mode for `PdfReadingControls`

**Files touched:** [src/components/lease/PdfReadingControls.tsx](../../../src/components/lease/PdfReadingControls.tsx) (new test file: [src/components/lease/PdfReadingControls.test.tsx](../../../src/components/lease/PdfReadingControls.test.tsx) already exists — extend it).

**TDD:**
1. RED — add tests:
   - When rendered with `compact={true}`, the visible "Fit width" text is hidden (`screen.queryByText('Fit width')` returns null but the button is still present via `aria-label`).
   - When `compact={true}`, the page indicator text matches `/Page \d+$/` (no "/ Total" suffix).
   - When `compact={false}` (default), the existing behavior (visible label + full indicator) holds.
2. GREEN — add `compact?: boolean` to `PdfReadingControlsProps`. Inside the component, condition the visible text on `!compact`. Update the page indicator to render `Page {currentPage ?? '—'}` when `compact={true}`, full form otherwise.
3. REFACTOR — ensure the focus mode caller in [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) doesn't pass `compact` (default false → existing behavior preserved). Inline-mode caller (from Phase 2) passes `compact={true}`.

**Verification:** New tests + existing tests pass. Smoke: zoom +/− and fit-width work in both modes.

## Phase 3 — Two-row dock header in `PdfViewer.client.tsx`

**Files touched:** [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx), [src/components/lease/PdfViewer.test.tsx](../../../src/components/lease/PdfViewer.test.tsx).

**Depends on:** Phase 2 (the `compact` prop must exist before inline mode consumes it).

**TDD:**
1. RED — add a test that renders the viewer with a known `filename`, `pageCount`, `clauseCount` and asserts:
   - The filename appears in row 1 (`data-testid="pdf-viewer-header-row1"`).
   - The page/clause meta appears in row 2 (`data-testid="pdf-viewer-header-row2"`).
   - Row 2 has the `bg-surface-sunken` utility class.
   - The expand button is in row 2.
   - The parsed/failed pill is in row 1 (next to the filename).
2. GREEN — split the existing `<header>` into two stacked rows. Move metadata + reading controls + expand into row 2. Apply `bg-surface-sunken` to row 2's element. Apply the new `data-testid`s. Thread `PdfReadingControls` into inline mode with `compact={true}` (which lands in Phase 2).
3. REFACTOR — ensure the sticky-callout still pins to the top of the scroll area (the callout is OUTSIDE the header). Smoke: scroll the inline pane while a clause is active; callout pins at the top of the scroll region as before.

**Verification:** New row-test passes; existing `PdfViewer.test.tsx` assertions for filename/page-count/clause-count/parsed-pill still pass (their selectors target text content + data-testids, which we preserve).

## Phase 4 — `PdfFocusDialog` close-button polish + header surface token

**Files touched:** [src/components/lease/PdfFocusDialog.tsx](../../../src/components/lease/PdfFocusDialog.tsx), [src/components/lease/PdfFocusDialog.test.tsx](../../../src/components/lease/PdfFocusDialog.test.tsx).

**TDD:**
1. RED — extend the existing close-button test to assert:
   - Close button is icon-only (no visible text label, but `aria-label` still set).
   - Close button has `min-h-11 min-w-11` (touch-target floor — already asserted).
   - The header strip has `bg-surface-elevated`.
2. GREEN — drop the existing bordered styling on the close button in favor of an icon-only ghost button with `min-h-11 min-w-11`, visible hover state, focus ring. Replace the header strip's `bg-surface-card` + per-class `dark:` with `bg-surface-elevated` (auto-flips at `:root.dark`).
3. REFACTOR — verify the `fixed inset-0 h-screen w-screen` sizing on `<dialog>` is unchanged. Run the full test file.

**Verification:** Tests pass. Smoke: open focus mode; close button is bigger / more visually obvious; Esc still closes.

## Phase 5 — `CitationChip` hover affordance polish

**Files touched:** [src/components/lease/CitationChip.tsx](../../../src/components/lease/CitationChip.tsx), [src/components/lease/CitationChip.test.tsx](../../../src/components/lease/CitationChip.test.tsx).

**TDD:**
1. RED — extend the existing test to assert: when used as a button (with `onClick`), the chip has `hover:underline` on the citation text span (the existing `hover:bg-accent-50/60` stays). Span variant unchanged.
2. GREEN — add `group-hover:underline` (or similar Tailwind utility) on the citation text span inside the button variant. Wire `group` on the button itself.
3. REFACTOR — visually verify the focus ring stays consistent with other dock buttons.

**Verification:** Tests pass. Smoke: hover a citation chip in the right pane (rendered by `RedFlagReport`); see underline appear.

## Phase 6 — Full smoke + commit sequence

1. `npm test && npm run typecheck && npm run lint && npm run build` — all green.
2. Manual smoke walk per spec §4 AC #1–12.
3. Update `impl-qa.md` with per-phase change ledger, test deltas, and commit-log placeholders.
4. **HALT for user smoke walk via `npm run dev`** before any implementation commit.
5. After user approval, commit in the following sequence (NOT pushed):

```txt
refactor(s23b.1): tighten LeaseUploadDropzone to document-tray hierarchy
refactor(s23b.2): compact mode for PdfReadingControls (consumer in s23b.3)
refactor(s23b.3): two-row dock header in PdfViewer (consumes compact)
refactor(s23b.4): icon-only close button + surface-elevated header in focus dialog
refactor(s23b.5): underline-on-hover affordance for CitationChip button
docs(s23b): record implementation audit in impl-qa.md
```

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/components/lease/LeaseUploadDropzone.tsx` | Hierarchy refactor (icon size, padding, hints collapse) |
| 1 | `src/components/lease/LeaseUploadDropzone.test.tsx` | New assertions (single hints line, icon size) |
| 2 | `src/components/lease/PdfViewer.client.tsx` | Two-row header split |
| 2 | `src/components/lease/PdfViewer.test.tsx` | New row-structure tests |
| 3 | `src/components/lease/PdfReadingControls.tsx` | Additive `compact?` prop |
| 3 | `src/components/lease/PdfReadingControls.test.tsx` | New compact-mode tests |
| 4 | `src/components/lease/PdfFocusDialog.tsx` | Close button + header surface refactor |
| 4 | `src/components/lease/PdfFocusDialog.test.tsx` | Assertions for icon-only close + surface-elevated header |
| 5 | `src/components/lease/CitationChip.tsx` | Underline-on-hover for button variant |
| 5 | `src/components/lease/CitationChip.test.tsx` | New hover-affordance test |
| 6 | `docs/_specs/sprint-23b-document-dock/impl-qa.md` | Implementation audit |

## Test impact

- Expected to grow: +1 hints-line test, +1 icon-size test (Phase 1); +5 row-structure tests (Phase 2); +3 compact-mode tests (Phase 3); +2 close-button + surface-elevated tests (Phase 4); +1 underline-hover test (Phase 5). Net ~+12 tests, no removals.
- After sprint-23b: expected total ≥ 765 (baseline 753 + 12).
- No deletion or skipping of existing tests.
