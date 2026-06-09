# Sprint 23b — Document Dock (Left Pane Redesign)

> **STATUS: SHELVED** — Designed on the `feature/ui` branch and never merged. The parser-first pivot in Sprint 26 (`ParserResultsShell` is the live left-pane PDF column) superseded the Document Dock direction. Kept here as historical design exploration; do not implement.

**Status:** Shelved (not merged; superseded by Sprint 26).
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Parent handoff:** [handoff.md](../../../handoff.md) §12, §21.
**Predecessor:** [sprint-23a-ui-foundation/spec.md](../sprint-23a-ui-foundation/spec.md) (ships the foundation tokens this sprint consumes).

---

## 1. Problem

The left pane today is a working PDF container, but it reads as a "file viewer with chrome" rather than a "document dock" — a professional surface that makes the lease feel active, named, parsed, and connected to the conversation in the center pane.

Three concrete weaknesses, surfaced by the handoff §12 walkthrough:

1. **Hierarchy in the post-upload header is flat.** The single-row chrome at [PdfViewer.client.tsx:271-347](../../../src/components/lease/PdfViewer.client.tsx#L271-L347) squeezes the brand icon, filename, page count, clause count, expand button, and parsed-status pill into one strip. At ~280-320px pane width the filename gets truncated immediately and the metadata reads as a single comma-separated run. The two-row dock-header pattern (filename as primary on row 1; metadata + actions on row 2) would let the filename breathe and put metadata in its own visual register.

2. **Pre-upload state is a giant hero.** [LeaseUploadDropzone.tsx:194-303](../../../src/components/lease/LeaseUploadDropzone.tsx) renders a `h-14 w-14` icon, a 15px bold headline, a 12px subtext, a "Choose a file" pill, and a stack of three 11px hint lines — all centered with generous spacing inside a rounded 8px-padded section. It works, but it reads as a landing-page upload hero, not a calm document tray. Handoff §12 calls for "the upload area should not feel like a giant empty placeholder. It should feel like a clean document tray." The fix is to repackage: smaller icon, tighter headline+sub stack, hints reduced to a single footnote line, "Choose a file" still primary but smaller.

3. **Reading controls only reachable in Focus mode.** [PdfViewer.client.tsx:316-336](../../../src/components/lease/PdfViewer.client.tsx#L316-L336) hides `PdfReadingControls` in inline mode because the pane is too narrow — the comment from S20.6 explains the layout collision. The result is that zoom and page-indicator are only accessible after clicking expand. For most tenants the inline mode is the primary reading surface, so the zoom / fit-width / page-indicator should be reachable there too — just smaller. The plan: an inline `PdfReadingControls` variant that drops the visible "Fit width" label, narrows the page indicator, and accepts a tighter `compact` mode without re-architecting the props.

This sprint introduces no behavioral changes to upload, parsing, classification, or scan. It does not touch the right-pane red-flag UI (23d) or the center-pane chat (23c). It does not add new clause-highlight anchoring (handoff §20). All visual layer.

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen — paths, exported names, props signatures unchanged unless the redesign explicitly requires a new prop, and even then no renames.
2. No new runtime dependencies.
3. `useReducedMotion()` gate is non-negotiable — animation skipped entirely, not slowed.
4. Severity is communicated by text + icon/shape + layout, never by color alone.
5. Disclaimer renders bold at the end of grading messages.
6. Synthetic scan-summary suppression preserved.
7. **PDF focus dialog `fixed inset-0 h-screen w-screen` preserved** (handoff §21 failed-attempt #1 — this sprint touches the dialog and must not regress sizing).
8. Verbatim citation validation in `grade_clause_severity` not weakened.
9. Role-gated progressive disclosure preserved.
10. Test count never decreases (modulo deliberately-removed tests; 23b expects no removals).
11. No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.
12. WCAG AA contrast in both color schemes; visible focus states; minimum 44×44 touch targets; respect `prefers-reduced-motion`.

Sprint-23b-specific invariants:

13. **Lease upload contract unchanged.** Form POST to `/api/leases`, `multipart/form-data` body, `UploadResult` response shape, the `Status` state machine (`idle` → `dragover` → `uploading` → `success | error`) — all preserved. Only the rendered chrome changes.
14. **Scroll chain preserved.** [PdfViewer.client.tsx:354-358](../../../src/components/lease/PdfViewer.client.tsx#L354-L358) — `flex-1 min-h-0 overflow-y-auto overscroll-contain` on the inner scroll area. Don't reintroduce `h-full` anywhere in the descendant tree (the failed-attempt fix lives here).
15. **`PdfFocusDialog` viewport sizing preserved** — `fixed inset-0 h-screen max-h-screen w-screen max-w-none` stays.
16. **Active-clause sticky callout preserved.** The callout in [PdfViewer.client.tsx:363-378](../../../src/components/lease/PdfViewer.client.tsx#L363-L378) reads from `useChatStream().activeClauseId` and the most-recent `grade_clause_severity` event. The redesign may tighten its visual but must not change which event drives it.
17. **`scrollToPage` imperative handle preserved.** [PdfViewer.client.tsx:172-181](../../../src/components/lease/PdfViewer.client.tsx#L172-L181) — RedFlagReport's page-jump button calls this through `useChatStream().pdfViewerRef`. Don't break the contract.

---

## 3. Design system

### 3a. Token consumers from sprint-23a

Sprint-23b is the first consumer of the surface-elevation tokens that 23a added to the `@theme` block:

| Token | Surface | Usage in 23b |
|---|---|---|
| `--color-surface-elevated` | Hover state on the document-dock header (when the header itself is interactive, e.g. a click target for "rename lease" later) | Subtle hover lift on the dock header strip |
| `--color-surface-sunken` | The reading-controls strip inside the dock (row 2 of the two-row header) | Visually separates the controls from the filename row |
| `bg-backdrop` | Already consumed by `PdfFocusDialog` in 23a — preserved |

No new tokens are added in 23b. If a real gap surfaces during implementation, the gap goes back to 23a's spec for a follow-up commit; 23b only consumes.

### 3b. Component refactor scope

Every component below keeps its file path, exported name, and props signature. Internal rendering changes only. New props are additive and default to current behavior.

| Component | Path | Phase | What changes |
|---|---|---|---|
| `LeaseUploadDropzone` | [src/components/lease/LeaseUploadDropzone.tsx](../../../src/components/lease/LeaseUploadDropzone.tsx) | 1 | Smaller icon (h-12 from h-14), tighter headline/sub stack, hints collapse to a single footnote, document-tray rounded outer (rounded-xl from rounded-2xl), reduced overall vertical rhythm. State machine + upload behavior unchanged. |
| `PdfViewer.client.tsx` (header) | [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx) | 2 | Header chrome: split into two rows. Row 1 = brand-icon + filename (truncate at 1 line, full filename in `title=`) + parsed/failed pill. Row 2 = page count · clause count · `PdfReadingControls` (compact mode) on the left, expand button on the right. `bg-surface-sunken` on row 2 to visually separate. Sticky active-clause callout retains current behavior; tightened visual. |
| `PdfReadingControls` | [src/components/lease/PdfReadingControls.tsx](../../../src/components/lease/PdfReadingControls.tsx) | 3 | New optional `compact?: boolean` prop. When `compact={true}`, the "Fit width" text label is hidden (icon only) and the page indicator drops to `Page N` (no "/ Total"). When false (default), preserves current rendering. Used by inline mode (Phase 2) and unchanged in Focus mode. |
| `PdfFocusDialog` | [src/components/lease/PdfFocusDialog.tsx](../../../src/components/lease/PdfFocusDialog.tsx) | 4 | Close button: replace the bordered `<button>` with a tighter icon-only button (still ≥44×44 touch target via `min-h-11 min-w-11`). Header strip gets `bg-surface-elevated`. No sizing change. |
| `CitationChip` | [src/components/lease/CitationChip.tsx](../../../src/components/lease/CitationChip.tsx) | 5 | Hover state when used as a button: stronger affordance (the existing `hover:bg-accent-50/60` stays subtle; we add an underline-on-hover for the citation text, and tighten the focus ring offset to match other dock buttons). Inline-span variant unchanged. |

### 3c. State coverage matrix

For each pre-upload / post-upload state, the redesign must preserve the existing data-status hook + statusMsg copy. The visual ledger:

| State | Icon | Headline | Subtext | Affordance |
|---|---|---|---|---|
| `idle` | FileUp, h-12, fg-subtle | "Drop your NJ residential lease" (14px, semibold) | "or click to browse" (11px, muted) | "Choose a file" pill, 32px tall |
| `dragover` | FileUp, accent, single-pulse | "Drop to scan" | "Release to start parsing" | (hidden) |
| `uploading` | Loader2 spin | "Parsing your lease…" | filename (11px, muted) | (hidden) |
| `error` | AlertTriangle, danger | "Upload failed" | statusMsg | "Try another file" pill |
| `success` | CheckCircle2, success | "Lease ready" | "N pages · M clauses" | (hidden) |

Hints in idle state collapse from three lines to one: "PDF up to 10 MB · text-layer required · informational analysis only" — same content, single line.

### 3d. Acceptance walk per phase

Phase deliverables roll up into the §4 acceptance criteria. Per-phase definitions of done live in [sprint.md](./sprint.md).

---

## 4. Acceptance criteria

Manual walk via `npm run dev` at `http://localhost:3000/`, sample lease loaded.

1. **AC #1 — Pre-upload tray.** Left pane shows the redesigned dropzone: 12px (h-12) icon, single-row headline, single-line footnote. At 280px pane width, no horizontal overflow. At 480px pane width, the content remains centered and balanced (not stretched).
2. **AC #2 — Drag-over.** Drag a PDF over the pane. Border still flips dashed → solid accent; copy still swaps to "Drop to scan"; icon still pulses once (350ms `ease-out-soft`, gated on `useReducedMotion`).
3. **AC #3 — Uploading & success.** Upload sample lease. Spinner spins; "Parsing your lease…" appears; on success the headline reads "Lease ready", subtext reads "2 pages · 15 clauses".
4. **AC #4 — Two-row dock header.** Post-upload, left pane shows: row 1 = brand icon + filename + Parsed pill; row 2 = "2 pages · 15 clauses" + inline `PdfReadingControls` (compact) on the left, expand button on the right. Row 2 has `bg-surface-sunken`. At 280px pane width, filename truncates with ellipsis; metadata stays legible.
5. **AC #5 — Inline reading controls.** In inline (non-focus) mode, the zoom −/+ buttons, fit-width toggle (icon only), and `Page N` indicator are visible and functional. Clicking zoom +/− works; fit-width toggle's pressed state shows accent. Page indicator updates as the user scrolls.
6. **AC #6 — Focus mode parity.** Click expand. Focus dialog opens at viewport size (`h-screen w-screen`). Backdrop renders via `bg-backdrop` token (preserved from 23a). Close button is icon-only, ≥44×44 touch target, hover state visible. Esc closes. Scroll inside the dialog works correctly (no `h-full` regression).
7. **AC #7 — Sticky active-clause callout.** Run standard scan. While a red-flag card is selected (active), the inline pane shows the sticky callout pinned at the top of the scroll area with "{Clause label} · §{N+1} · page {P}". Callout still appears in Focus mode.
8. **AC #8 — Citation chip click.** A red-flag card's citation chip, when used as a button, has a visible hover (underline + accent bg). Click jumps to the relevant PDF page.
9. **AC #9 — Test sweep.** `npm test` ≥ 753/753 pass; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.
10. **AC #10 — Reduced motion.** DevTools → `prefers-reduced-motion: reduce`. Walk the same flow. Dropzone icon pulse, dropzone state transitions, sticky-callout backdrop blur all behave statically (no slow animation).
11. **AC #11 — Dark mode.** Toggle dark. Two-row header still legible; row 2 sunken still visibly separated; expand button hover still readable; citation chip underline still visible against accent.
12. **AC #12 — Keyboard.** Tab through the dock: Choose-a-file → expand → zoom-out → zoom-in → fit-width → page indicator (skipped, aria-live only). Focus ring visible on each. Esc closes the focus dialog when open.

---

## 4b. Phase 6 — Bug fixes surfaced during smoke walk (in-scope addendum)

Two bugs surfaced when the user smoke-walked the post-Phase-5 implementation. Both fold naturally into 23b's scope:

### Bug 6.1 — Row 2 overflow at narrow pane widths (caused by 23b)

At the default ~280-320px inline pane width, row 2 contained: metadata ("2 pages · 15 clauses") + `PdfReadingControls` (compact: zoom-out / 100% / zoom-in / fit-width / "Page N") + expand button. The horizontal space wasn't enough — controls overlapped the metadata (visible as "1009%5" garble in the screenshot).

**Fix:** Move the expand button from row 2 to row 1 (next to the Parsed pill) and add `flex-wrap` to row 2 so at very narrow widths the reading controls reflow under the metadata instead of overlapping. Side benefit: expand sits next to the Parsed pill in row 1, giving it a stronger, more prominent affordance.

### Bug 6.2 — Drag-drop upload broken (pre-existing latent bug)

Drag-dropping a PDF onto the dropzone produced `ResponseException: Unexpected server response (0) while retrieving PDF "blob:placeholder"`. Root cause traced to [src/components/lease/LeaseLensWorkspaceShell.tsx:175-181](../../../src/components/lease/LeaseLensWorkspaceShell.tsx#L175-L181) — `UploadColumn` recovered the File via `document.querySelector('[data-testid="lease-upload-input"]').files[0]`. That only works for click-to-upload (which populates the `<input>.files`). The drag path calls `LeaseUploadDropzone.handleFile(file)` directly and never assigns to the input → `file` is undefined → `pdfUrl = 'blob:placeholder'` → `react-pdf` fails.

**Fix:** Change `LeaseUploadDropzone.onUploaded` signature from `(result: UploadResult) => void` to `(result: UploadResult, file: File) => void`. The dropzone has the File reference in `handleFile` regardless of which path delivered it (click or drop). The shell's `UploadColumn` wrapper drops the brittle DOM-sniff and forwards the File directly. `LeaseLensWorkspaceShell.handleUploaded` makes `file` a required arg (not `file?: File`) and drops the `'blob:placeholder'` fallback.

This is technically a pre-existing bug, not a 23b regression — but since the dropzone is being refactored anyway and the fix is one-line in two files, fold it in.

### Test impact

- 3 new layout tests in `PdfViewer.test.tsx` (expand-in-row-1, row-2 has flex-wrap, expand NOT in row 2) — replace the prior row-2 expand assertion.
- 2 new file-passthrough tests in `LeaseUploadDropzone.test.tsx` (click path passes File; drag path passes File).
- Tests at finish: 765/765 (763 → +2 net; the row-test conversion is net-zero).

---

## 5. Out of scope

- New legal grading rules / corpus / classifier changes.
- Real PDF text anchoring (clause-highlight in the PDF body).
- Lease-comparison mode, time-shifted-law view, negotiation playback.
- A "rename lease" affordance (the header chrome is **not** interactive in 23b — `bg-surface-elevated` hover is reserved for that future state).
- Re-architecting `PdfReadingControls` away from prop-driven state.
- Replacing `react-pdf` or its worker pattern.
- Adding mobile-responsive treatment for the dock (three-pane shell is desktop-optimised per handoff; the dropzone already adapts).
- Center pane (chat) and right pane (red flags) — 23c and 23d respectively.

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged.
- **§6 simplicity:** the redesign reuses existing props (`PdfReadingControls.compact?` is a single additive flag) and existing tokens (only consumes 23a additions). No new state, no new context.
- **§7 spec-first:** this spec ships before any code edits.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** if `react-pdf` API usage changes (it shouldn't), verify against current docs.

---

## 7. Cross-references

- Parent handoff: [handoff.md](../../../handoff.md) §6 (visual direction to preserve), §12 (left pane direction), §20 (out-of-scope items), §21 (known technical notes — `h-screen` dialog sizing).
- Predecessor: [sprint-23a-ui-foundation/spec.md](../sprint-23a-ui-foundation/spec.md).
- Design-system source: [design-system/MASTER.md](../../../design-system/MASTER.md).
- Token implementation source: [src/app/globals.css](../../../src/app/globals.css).
- Downstream: [sprint-23c-conversation-workspace/spec.md](../sprint-23c-conversation-workspace/spec.md), [sprint-23d-risk-radar/spec.md](../sprint-23d-risk-radar/spec.md).

---

**End of spec.**
