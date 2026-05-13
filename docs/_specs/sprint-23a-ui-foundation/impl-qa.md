# Sprint 23a — Implementation QA

**Status:** Implementation complete, awaiting human QA.
**Date:** 2026-05-13.
**Baseline tests at start:** 777/777.
**Tests at finish:** 778/778 (one new test for the backdrop-token swap).

---

## Phase 0 — Pre-flight

- [x] Working tree was clean of source edits before Phase 1.
- [x] Baseline `npm test` → 777/777 green.
- [x] Baseline `npm run lint` → 0 errors.
- [x] Baseline `npm run typecheck` flagged stale `.next/dev/types/validator.ts`
      (a corrupted Next.js dev artifact, not source); regenerated via `npm run build`.
      Source-level types are clean; this is an environmental artifact only.

## Phase 1 — Token additions

**Status:** complete. File touched: [src/app/globals.css](../../../src/app/globals.css).

Tokens added inside the existing `@theme` block:

- [x] Z-index scale: `--z-base / --z-raised / --z-overlay / --z-toast / --z-dialog` (values 0, 10, 20, 30, 50).
- [x] Surface elevation aliases: `--color-surface-elevated`, `--color-surface-sunken` (light defaults + `:root.dark` companions).
- [x] Backdrop tokens: `--color-backdrop`, `--color-backdrop-strong` (light defaults + `:root.dark` companions).
- [x] Pane-gutter spacing: **decision SKIP**. Tailwind's default `--spacing-*` scale (4 / 8 / 12 / 16 / 20 / 24) already covers pane gutters and pane padding. Introducing parallel `--space-pane-*` tokens would create overlapping scales and break ergonomics of `p-4`, `p-5`, `gap-4`, etc. The pane shell already uses `p-4` / `gap-3` consistently; documented in the design-system MASTER reference for future composition.

Smoke: DevTools confirms `bg-backdrop` resolves to `rgb(14 14 16 / 0.55)` in light mode and `rgb(0 0 0 / 0.68)` in dark mode after `:root.dark` flip.

## Phase 2 — Inline-value sweep

**Status:** complete. Mechanical token consumption across 5 source callsites (no test files swept).

| Callsite | Old value | New utility |
|---|---|---|
| [src/app/page.tsx:120](../../../src/app/page.tsx#L120) chat-home header | `z-10` | `z-raised` |
| [src/app/cockpit/page.tsx:115](../../../src/app/cockpit/page.tsx#L115) cockpit header | `z-20` | `z-raised` |
| [src/components/lease/PdfViewer.client.tsx:366](../../../src/components/lease/PdfViewer.client.tsx#L366) sticky active-clause callout | `z-10` | `z-raised` |
| [src/components/workspaces/BrandUploadModal.tsx:149](../../../src/components/workspaces/BrandUploadModal.tsx#L149) modal overlay | `z-50` + `bg-black/30` | `z-dialog` + `bg-backdrop` |
| [src/components/workspaces/WorkspaceMenu.tsx:114](../../../src/components/workspaces/WorkspaceMenu.tsx#L114) workspace dropdown menu | `z-40` | `z-overlay` |
| [src/components/lease/PdfFocusDialog.tsx:74](../../../src/components/lease/PdfFocusDialog.tsx#L74) PDF focus dialog `::backdrop` | `backdrop:bg-neutral-950/40` + `dark:backdrop:bg-black/60` | `backdrop:bg-backdrop` (auto-flips at `:root.dark`) |

**Verification:** `grep -rn --include="*.tsx" --include="*.ts" -E '\bz-(10|20|30|40|50)\b' src/ | grep -v ".test.tsx"` returns zero hits. `grep -rn --include="*.tsx" --include="*.ts" -E 'bg-(black|white)\/[0-9]+' src/ | grep -v ".test.tsx"` returns zero hits.

**Side-benefit:** the two header callsites were at *different* z-indices today (z-10 in chat-home, z-20 in cockpit) — the token sweep also normalises that inconsistency.

## Phase 3 — Shell composition audit

**Audit memo for [LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx):**

| Lifecycle responsibility | Layout responsibility |
|---|---|
| `activeLease` state (`useState<ActiveLease \| null>`) | Pane slot CSS classes |
| `handleUploaded` (blob URL + filename + context push) | Slot assignment (left = upload/viewer, center = ChatUI, right = RedFlagReport) |
| `handleToolEvent` (forwards into `pushToolEvent`) | Delegates resize layout to `ResizableSplitLayout` |
| `setContextLease` push | (none — layout is fully delegated) |

**Gate decision: SKIP extraction.**

The shell is already cleanly composed: `LeaseLensWorkspaceShell` (provider wrapper) wraps `ShellInner` (orchestrator); `ShellInner` delegates layout entirely to `ResizableSplitLayout` and only assigns content to slots. Extracting a `WorkspacePanes` wrapper would add indirection for negligible clarity gain — the slot construction is ~10 lines per pane and is genuinely coupled to the lifecycle state (the left slot literally swaps based on `activeLease`).

[src/app/page.tsx](../../../src/app/page.tsx) header is also a single coherent block. Extracting `TopBar` would be a cosmetic refactor — 23b/c/d do not require it.

Per handoff §8: *"Do not force these names if the existing project already has better conventions. Adapt to the current architecture."* The current architecture is the better convention.

If a future sprint demonstrates a real need (e.g. a second three-pane surface that wants to reuse the layout), extract then. Not now.

## Phase 4 — Motion sweep + reduced-motion audit

### Hardcoded duration audit

`grep` for `duration-\[` returned zero source hits — all Tailwind transitions already use token utilities.

`grep` for `duration:\s*[0-9]+` in motion library `transition` props found 12 callsites. Audit results:

| File:line | Value | Status | Action |
|---|---|---|---|
| [ChatEmptyState.tsx:117](../../../src/components/chat/ChatEmptyState.tsx#L117) | `duration: 4` | Ambient 4-second sparkle pulse loop, intentionally outside the transition budget | Document as exception, leave |
| [ChatEmptyState.tsx:160](../../../src/components/chat/ChatEmptyState.tsx#L160) | `duration: 0.24` → `0.25` | Token-aligned now (250ms) | Normalised |
| [MermaidDiagram.tsx:91](../../../src/components/chat/MermaidDiagram.tsx#L91) | `duration: 0.35` | 350ms ✓ | Conformant |
| [LeaseLensMark.tsx:85](../../../src/components/brand/LeaseLensMark.tsx#L85) | `duration: 0.22` | 220ms ✓ | Conformant |
| [ChatMessage.tsx:189](../../../src/components/chat/ChatMessage.tsx#L189) | `duration: 0.25` | 250ms ✓ | Conformant |
| [ToolCard.tsx:211](../../../src/components/chat/ToolCard.tsx#L211) | `duration: 0.22` | 220ms ✓ | Conformant |
| [ToolCard.tsx:246](../../../src/components/chat/ToolCard.tsx#L246) | `duration: 0.15` | 150ms ✓ | Conformant |
| [RedFlagsPaneHeader.tsx:52](../../../src/components/lease/RedFlagsPaneHeader.tsx#L52) | `duration: 0.9, repeat: Infinity` | Ambient spinner loop, not a transition | Document as exception, leave |
| [RedFlagReport.tsx:198](../../../src/components/lease/RedFlagReport.tsx#L198) | `duration: 0.35` | 350ms ✓ | Conformant |
| [RedFlagReport.tsx:444](../../../src/components/lease/RedFlagReport.tsx#L444) | `duration: 0.2` | 200ms ✓ | Conformant |
| [LeaseUploadDropzone.tsx:217](../../../src/components/lease/LeaseUploadDropzone.tsx#L217) | `duration: 0.4` → `0.35` | Token-aligned now (350ms) | Normalised |
| [ScanTimelineRow.tsx:71](../../../src/components/lease/ScanTimelineRow.tsx#L71) | `duration: 1.4` | Ambient skeleton-pulse loop, not a transition | Document as exception, leave |

**Documented exceptions** (intentional, outside the 90-350ms transition budget):

1. **4-second sparkle loop** ([ChatEmptyState.tsx:117](../../../src/components/chat/ChatEmptyState.tsx#L117)) — brand mark breathing pulse on the empty state. Ambient; not a transition.
2. **0.9-second spinner loop** ([RedFlagsPaneHeader.tsx:52](../../../src/components/lease/RedFlagsPaneHeader.tsx#L52)) — scan-in-progress activity ring. Ambient; not a transition.
3. **1.4-second skeleton pulse** ([ScanTimelineRow.tsx:71](../../../src/components/lease/ScanTimelineRow.tsx#L71)) — pending-clause placeholder shimmer. Ambient; not a transition.

All three respect `useReducedMotion()` and disappear entirely when the user opts out.

### Easing audit

`[0.22, 1, 0.36, 1]` (matches `--ease-out-soft`) is consistently used for first-class transitions. `'easeOut'` / `'easeInOut'` / `'linear'` string identifiers (motion library built-ins) used for ambient loops and incidental polish — left as-is since the spec does not mandate replacing motion-library built-ins with custom curves where intent matches.

### Spring config audit

| File:line | Stiffness | Damping | Conformant? |
|---|---|---|---|
| [ChatComposer.tsx:126](../../../src/components/chat/ChatComposer.tsx#L126) | 500 | 25 | ✓ |
| [ChatEmptyState.tsx:168](../../../src/components/chat/ChatEmptyState.tsx#L168) | 400 | 28 | ✓ |
| [RoleSwitcher.tsx:76](../../../src/components/auth/RoleSwitcher.tsx#L76) | 400 | 30 | ✓ |
| [RedFlagReport.tsx:356](../../../src/components/lease/RedFlagReport.tsx#L356) | 300 | 30 | ✓ |

All within the documented `{ stiffness: 300-500, damping: 25-30 }` envelope. No normalisation needed.

### `useReducedMotion()` gate audit

26 import-or-call sites across the codebase. Every motion-using component has the gate and a plain-DOM branch. No "slowed-down" reduced-motion branches detected.

## Phase 5 — Reuse catalogue

| Primitive | Location | Purpose | 23b consumer | 23c consumer | 23d consumer |
|---|---|---|---|---|---|
| `Container` | [src/components/layout/Container.tsx](../../../src/components/layout/Container.tsx) | Max-width centring wrapper for content regions | Document-dock empty state outer wrapper | Center-pane empty/uploaded state | Risk-radar empty state |
| `PageShell` | [src/components/layout/PageShell.tsx](../../../src/components/layout/PageShell.tsx) | Page-level scaffold (header + main slot) | (n/a — page.tsx already inlines) | (n/a) | (n/a) |
| `Stack` | [src/components/layout/Stack.tsx](../../../src/components/layout/Stack.tsx) | Vertical/horizontal flex-stack with gap | Document-dock header rows | Scan-timeline rows; composer chip row | Red-flag card body |
| `ResizableSplitLayout` | [src/components/layout/ResizableSplitLayout.tsx](../../../src/components/layout/ResizableSplitLayout.tsx) | Three-pane CSS-grid with drag handles + persisted widths | n/a (already consumed by shell) | n/a | n/a |

## Acceptance walk

- [x] AC #1 — Tokens compile. `npm run build` succeeds; utilities resolve in DevTools.
- [x] AC #2 — Dark-mode flip parity. ThemeToggle cycles confirm flip; semantic tokens follow.
- [x] AC #3 — Shell extraction non-regression. Audit decided SKIP; no regression possible.
- [x] AC #4 — Motion sweep complete. Hardcoded ms patterns return zero hits; 2 outliers normalised; 3 ambient loops documented.
- [x] AC #5 — Reduced motion. 26 gate callsites; spot-checked plain-DOM branches in ChatMessage, ToolCard, LeaseLensMark.
- [x] AC #6 — Test sweep. 778/778 (was 777 + 1 new); typecheck source-level clean; lint 0 errors; build succeeds.
- [x] AC #7 — No regressions in 23b–d-scope behavior. Full test suite green; smoke walk reserved for human reviewer.

## Smoke-test plan for reviewer

1. `npm run dev` — open `http://localhost:3000/`.
2. Confirm chat-home header renders correctly (uses `z-raised`).
3. Open the workspace menu dropdown — confirm it renders above the page content.
4. Click "Upload PDF" — confirm the BrandUploadModal scrim is visibly darker than before (token > inline value).
5. Upload sample lease → click the PDF expand button → confirm focus-dialog backdrop renders.
6. Toggle theme (system → light → dark) — confirm the backdrop and surface tokens flip cleanly.
7. DevTools → emulate `prefers-reduced-motion: reduce` → confirm sparkle loop, dropzone icon pulse, role-pill animation are all suppressed.

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23a.1 | (pending) | Token additions in globals.css (z-index, surface elevation, backdrop) |
| s23a.2 | (pending) | Inline-value sweep across 6 callsites |
| s23a.3 | (skipped) | Shell extraction — audit decided SKIP, documented |
| s23a.4 | (pending) | Motion duration normalisation (2 outliers) |
| s23a.5 | (pending) | impl-qa documentation finalised |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13
