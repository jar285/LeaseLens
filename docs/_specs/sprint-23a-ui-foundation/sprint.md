# Sprint 23a — UI Foundation — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 4. No phase ships visual change to the three panes.

---

## Phase 0 — Pre-flight (no code edits)

1. Confirm working tree state: `git status` shows only `handoff.md` modified (or already committed) and `docs/_specs/sprint-23{a,b,c,d}-*/` added. No uncommitted source edits.
2. Run baseline: `npm test && npm run typecheck && npm run lint`. Record test count (expect ≥ 777). All three must pass before Phase 1.
3. Re-read [src/app/globals.css](../../../src/app/globals.css) and [src/components/lease/LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx) end-to-end.

## Phase 1 — Token audit + additions

**Files touched:** [src/app/globals.css](../../../src/app/globals.css) only.

1. Append the z-index scale tokens (`--z-base` … `--z-dialog`) to the `@theme` block. Verify Tailwind autocomplete picks them up.
2. Append the surface elevation aliases (`--color-surface-elevated`, `--color-surface-sunken`) and their `:root.dark` companions.
3. Append the backdrop tokens (`--color-backdrop`, `--color-backdrop-strong`) and `:root.dark` companions.
4. Decide pane-gutter spacing strategy: if `--spacing-*` already covers it (Tailwind default scale), document and skip. If not, add three explicit `--space-pane-*` tokens.
5. Smoke test: `npm run dev`, open `/`, inspect any element using `bg-surface-card` in DevTools — confirm the variable resolves. Toggle dark mode, confirm flip.

**Verification:** `npm run build` succeeds; visible diff is `globals.css` only.

## Phase 2 — Inline-value sweep

**Files touched:** scattered `*.tsx` callsites identified by `grep -rn 'z-10\|z-40\|bg-black/40\|bg-white/8' src/`.

1. Sticky callout in [src/components/lease/PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx): inline `z-10` → `z-raised`.
2. Toast layer in [src/components/chat/ChatStreamContext.tsx](../../../src/components/chat/ChatStreamContext.tsx) (or wherever the toast renderer lives): inline `z-40` → `z-toast`.
3. Backdrop in [src/components/lease/PdfFocusDialog.tsx](../../../src/components/lease/PdfFocusDialog.tsx): inline `bg-black/40` → `bg-backdrop`.
4. Glass surfaces (audit `bg-white/80` and similar): replace with `bg-surface-elevated` or `bg-surface-card` as appropriate — do NOT introduce a new "glass" token; LeaseLens is hairline-and-flat, not glass-morphic.
5. Update affected component snapshot tests if any encode the old class names; otherwise tests should pass unchanged (utilities resolve to the same computed style).

**Verification:** `grep` returns zero hits after sweep. `npm test && npm run typecheck && npm run lint`.

## Phase 3 — Shell composition audit + extraction (gated)

**Files touched (if extraction proceeds):** [src/components/lease/LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx), [src/app/page.tsx](../../../src/app/page.tsx), new `src/components/layout/WorkspacePanes.tsx` (+ test), possibly new `src/components/layout/TopBar.tsx` (+ test).

1. Audit `LeaseLensWorkspaceShell` line-by-line. Document in `impl-qa.md` which responsibilities are lifecycle (state, blob URL, context push) vs layout (pane assignment, resize layout). The output is the gate.
2. If lifecycle and layout are tightly coupled (e.g. inline JSX in the same function with conditional pane content): **extract `WorkspacePanes`** as a slot-accepting layout component. The shell keeps lifecycle, passes pre-built pane elements as props. New file + test.
3. If [src/app/page.tsx](../../../src/app/page.tsx) lines 120-157 conflate header structure with theme/role/cockpit-link wiring: **extract `TopBar`**. New file + test.
4. If extraction is not warranted by the audit, document the decision in `impl-qa.md` and skip — no extraction for its own sake.
5. Update [src/components/lease/LeaseLensWorkspaceShell.test.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.test.tsx) to reflect any boundary changes (mostly unchanged — the extracted component is the implementation detail; the shell's public behavior is the same).

**Verification:** Test count ≥ baseline. Smoke walk: upload → scan → red flags → resize panes → reload (widths persisted). No behavior diff vs Phase 0 baseline.

## Phase 4 — Motion sweep + reduced-motion audit

**Files touched:** any `*.tsx` that hits the grep patterns; expected to be small.

1. `grep -rn 'duration-\[' src/` and `grep -rn 'transition.*[0-9]\+ms' src/` — convert hardcoded durations to token utilities (`duration-150`, `duration-220`, etc.).
2. `grep -rn 'useReducedMotion' src/` — for each callsite, verify the reduced-motion branch renders plain DOM (no `motion.*` wrapper with `duration: 0`, no slowed animation). Fix any outliers.
3. Spring config audit: `grep -rn 'stiffness' src/`. Confirm `{ stiffness: 300-500, damping: 25-30 }`. Normalise drift.
4. Add a memo to `impl-qa.md` recording: which files were touched, what was changed, which sites are now compliant.

**Verification:** Reduced-motion smoke test (DevTools emulate `prefers-reduced-motion: reduce`). Walk upload → scan → red flags. No animation fires anywhere. `npm test && npm run typecheck && npm run lint`.

## Phase 5 — Reuse catalogue + commit

**Files touched:** `docs/_specs/sprint-23a-ui-foundation/impl-qa.md`.

1. Write the reuse catalogue: for each component in [src/components/layout/](../../../src/components/layout/) (`Container`, `PageShell`, `Stack`, `ResizableSplitLayout`), record purpose, current call sites, and intended use in 23b/c/d.
2. Final smoke walk: handoff §26 items 4 (document appears), 5 (file/page/clause/parsed), 9 (red flags render), 11 (final summary), 12 (no flash), 13 (composer works), 16 (focus mode scroll).
3. Commit: `refactor(s23a): close UI design-token gaps and audit shell composition`.

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/app/globals.css` | Token additions in `@theme` + `:root.dark` |
| 2 | `src/components/lease/PdfViewer.client.tsx` | Inline-value sweep (z-index) |
| 2 | `src/components/chat/ChatStreamContext.tsx` | Inline-value sweep (z-index) |
| 2 | `src/components/lease/PdfFocusDialog.tsx` | Inline-value sweep (backdrop) |
| 2 | Other callsites identified by grep | Inline-value sweep |
| 3 (gated) | `src/components/lease/LeaseLensWorkspaceShell.tsx` | Composition extraction |
| 3 (gated) | `src/components/layout/WorkspacePanes.tsx` (+ test) | New file |
| 3 (gated) | `src/components/layout/TopBar.tsx` (+ test) | New file |
| 4 | Misc `*.tsx` with hardcoded duration / spring drift | Motion sweep |
| 5 | `docs/_specs/sprint-23a-ui-foundation/impl-qa.md` | Catalogue + audit memos |

## Test impact

- Tests directly modified: [src/components/lease/LeaseLensWorkspaceShell.test.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.test.tsx) (only if extraction proceeds — re-target affected assertions).
- New tests: [src/components/layout/WorkspacePanes.test.tsx](../../../src/components/layout/WorkspacePanes.test.tsx), [src/components/layout/TopBar.test.tsx](../../../src/components/layout/TopBar.test.tsx) — only if Phase 3 extracts.
- No test removals.

## Commit sequence (suggested)

```txt
refactor(s23a.1): add z-index, surface-elevation, and backdrop tokens
refactor(s23a.2): sweep inline z-index and backdrop values to tokens
refactor(s23a.3): extract WorkspacePanes from LeaseLensWorkspaceShell  ← only if audit demands
refactor(s23a.4): sweep hardcoded motion durations to design tokens
refactor(s23a.5): document reuse catalogue for 23b–d
```

Keep each commit focused. Do not bundle unrelated logic changes.
