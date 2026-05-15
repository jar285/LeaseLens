# Sprint 23a — UI Foundation (Shell Boundaries, Token Closure, Motion Audit)

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Parent handoff:** [handoff.md](../../../handoff.md) §3, §8, §21.

---

## 1. Problem

`feature/ui` is the visual-redesign branch on top of the Sprint 22 working tree. Before the surface-level redesigns in 23b (document dock), 23c (conversation workspace), and 23d (risk radar) can land cleanly, the shell-level substrate needs three small, mechanical fixes that the per-surface sprints would otherwise have to keep rediscovering:

1. **Token closure.** The Sprint 15 `@theme` block in [src/app/globals.css](../../../src/app/globals.css) covers color, typography, radius, shadow, motion duration, and motion easing — but it does **not** cover z-index, pane gutter spacing, dialog backdrop, or surface elevation (elevated card vs sunken inset). The result is scattered inline values in components: `z-10` for the sticky active-clause callout in [PdfViewer.client.tsx](../../../src/components/lease/PdfViewer.client.tsx), `z-40` for toasts in [ChatStreamContext.tsx](../../../src/components/chat/ChatStreamContext.tsx), inline `bg-black/40` backdrops in [PdfFocusDialog.tsx](../../../src/components/lease/PdfFocusDialog.tsx), and ad-hoc `bg-white/80` glass surfaces. 23b–d will need consistent versions of all four; better to add the tokens once than to keep duplicating them.

2. **Shell composition boundaries.** [LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx) currently mixes lease-lifecycle orchestration (the `activeLease` state machine, blob URL management, lease-context push) with three-pane layout assignment (left = upload-or-viewer, center = chat, right = red flags) and tool-event fan-out. The center-pane swap logic in particular blocks 23c from cleanly redesigning the empty-vs-uploaded state transitions without touching shell-level state. A thin extraction — `AppShell` (top-level frame), `TopBar` (header), `WorkspacePanes` (the three-pane region) — would let 23b/c/d each take their own pane without re-orchestrating the others. The handoff's suggested component direction in §8 nods at this; we are only doing what the surface redesign actually needs, not chasing the full taxonomy.

3. **Motion budget audit.** The Sprint 15 motion tokens (`--duration-90 … --duration-350`, `--ease-out-soft`, `--ease-in-out-soft`) are the canonical set. The redesign in 23b/c/d must not introduce new durations or easings. Today, the codebase is mostly compliant, but there are stray `transition-all duration-200` callsites that bypass the token names and a handful of motion-library spring configs that drift in stiffness. A short audit + sweep in this sprint prevents the surface sprints from each "fixing" their own corner.

This sprint is intentionally small and low-visual. It is the substrate; it ships no new visible surfaces. Its value is that 23b/c/d become shorter, more focused, and less likely to bikeshed shared concerns.

---

## 2. Invariants

These hold for this sprint and are propagated into every 23-series spec verbatim.

1. **Public component surface is frozen.** Every component named in §3 keeps its current file path, exported name, and props signature. Internal refactors that change rendering are fine; renames are not. This preserves call sites and the existing test count.
2. **No new runtime dependencies.** `motion`, `lucide-react`, `next/font` cover every animation and icon need.
3. **`useReducedMotion()` gate is non-negotiable.** Animation is skipped entirely, not slowed.
4. **Severity is communicated by text + icon/shape + layout, never by color alone** (preserved here; load-bearing in 23d).
5. **Disclaimer renders bold at the end of grading messages** (system-prompt-driven; do not weaken).
6. **Synthetic scan-summary suppression preserved** — `isStreaming` + `modelProducedClosingReply` checks in [ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) stay.
7. **PDF focus dialog `fixed inset-0 h-screen w-screen` preserved** (no `h-full`; see handoff failed-attempt #1).
8. **Verbatim citation validation in `grade_clause_severity` not weakened** (load-bearing in 23d).
9. **Role-gated progressive disclosure preserved** — Tenant / Reviewer / Admin distinctions intact.
10. **Test count never decreases.** Pre-sprint baseline is 777+/777+. Post-sprint expects ≥ 777.
11. **No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.**
12. **WCAG AA contrast in both color schemes; visible focus states; minimum 44×44 touch targets; `prefers-reduced-motion` respected.**

---

## 3. Design system

### 3a. New tokens — additive only

All additions go into the existing `@theme` block in [src/app/globals.css](../../../src/app/globals.css). No existing token values change. The dark-mode flip in `:root.dark` gets companion overrides where the new tokens differ by scheme.

#### Z-index scale

```css
@theme {
  --z-base:    0;
  --z-raised: 10;   /* sticky callouts (active-clause indicator), document-dock header */
  --z-overlay: 20;  /* tooltips, popovers, dropdown menus */
  --z-toast:  30;   /* transient notifications */
  --z-dialog: 50;   /* PdfFocusDialog, modal sheets */
}
```

Tailwind v4 auto-generates `z-base`, `z-raised`, `z-overlay`, `z-toast`, `z-dialog`. Replaces inline `z-10` / `z-40` callsites surveyed in the codebase audit (Phase 2 of the sprint plan).

#### Pane gutter spacing

The three-pane shell uses implicit Tailwind gaps. Surfacing these as named tokens lets 23b/c/d compose consistent spacing without re-deriving values:

```css
@theme {
  --space-pane-gutter:   16px;  /* between resizable panes */
  --space-pane-padding:  20px;  /* inside each pane's content region */
  --space-pane-header:   12px;  /* below pane header chrome */
}
```

Consumed via `gap-[--space-pane-gutter]`, `p-[--space-pane-padding]` arbitrary-value syntax, **or** preferably exposed as Tailwind utilities by mapping into `--spacing-*` keys if a clean numeric scale (4 / 8 / 12 / 16 / 20 / 24) is preserved. Audit existing spacing before finalising — do not introduce overlapping scales.

#### Surface elevation aliases

```css
@theme {
  --color-surface-elevated: #ffffff;     /* document-dock chrome, risk-card hover */
  --color-surface-sunken:   #f4f4f2;     /* inset regions, scan-timeline strip */
}
```

Dark companions in `:root.dark`:

```css
:root.dark {
  --color-surface-elevated: #1f1f21;
  --color-surface-sunken:   #141416;
}
```

Used as `bg-surface-elevated`, `bg-surface-sunken`. The existing `--color-surface-card` (white in light, neutral-900 in dark) remains the default card surface.

#### Backdrop tokens

For dialog overlays and the PDF focus-dialog backdrop:

```css
@theme {
  --color-backdrop:        rgb(14 14 16 / 0.55);   /* light-mode dialog backdrop */
  --color-backdrop-strong: rgb(14 14 16 / 0.72);
}
```

Dark companions:

```css
:root.dark {
  --color-backdrop:        rgb(0 0 0 / 0.68);
  --color-backdrop-strong: rgb(0 0 0 / 0.82);
}
```

Consumed via `bg-backdrop`. Replaces inline `bg-black/40` in [PdfFocusDialog.tsx](../../../src/components/lease/PdfFocusDialog.tsx).

### 3b. Shell composition

The shell extraction is the minimum necessary to unblock 23b/c/d. We do **not** create the full taxonomy from handoff §8 unless the existing structure conflates the concerns.

**Audit first; extract only on demonstrated need.** The Phase 1 deliverable is the audit memo. Likely outcomes:

- **Likely extraction**: a `WorkspacePanes` component that owns the three-pane region (resizable layout + pane content slots), accepting `left`, `center`, `right` props. The current `LeaseLensWorkspaceShell` shrinks to lifecycle orchestration only.
- **Possible extraction**: a `TopBar` if [src/app/page.tsx](../../../src/app/page.tsx) lines 120-157 conflate header layout with theme/role/cockpit-link plumbing.
- **Probably skip**: a new `AppShell` wrapper — the current `<html>` + `<body>` + page composition already covers the frame.

Extractions stay in `src/components/layout/` (reusing the existing folder). No new dependencies, no new context providers, no new state stores. Tests for any extracted boundary live in the same folder; the new tests exercise the layout-only behavior (slot rendering, resize-handle interaction).

### 3c. Motion budget audit

Sweep the codebase for animation values that bypass the token names:

- `transition` / `transitionDuration` props with hardcoded ms values — convert to `--duration-*`.
- `motion` library spring configs — confirm `{ stiffness: 300-500, damping: 25-30 }` consistently. Outliers get normalised.
- CSS `transition` declarations using arbitrary `duration-[200ms]` — convert to `duration-200` (Tailwind utility from the token).
- `useReducedMotion()` gate audit: every animation site has the gate, and the reduced-motion branch renders plain DOM (not just `duration: 0`).

The audit is a sprint deliverable (memo in `impl-qa.md`); the sweep is mechanical replacements with no visual change.

### 3d. Reuse audit

Catalogue existing layout primitives in [src/components/layout/](../../../src/components/layout/) — `Container`, `PageShell`, `Stack`, `ResizableSplitLayout` — and document each one's current usage and intended role in the redesign. 23b/c/d specs reference this catalogue rather than re-discovering it. Output is a section in `impl-qa.md` summarising what each primitive does, where it's used, and which 23-series sprint will compose it.

---

## 4. Acceptance criteria

1. **AC #1 — Tokens compile.** `npm run build` succeeds. New Tailwind utilities (`z-raised`, `z-overlay`, `z-toast`, `z-dialog`, `bg-surface-elevated`, `bg-surface-sunken`, `bg-backdrop`) resolve to the correct CSS variable values when inspected in DevTools on the dev server.
2. **AC #2 — Dark-mode flip parity.** Toggle theme (system → light → dark) via the ThemeToggle. The four new semantic tokens flip cleanly, no FOUC, no contrast regression. Body text remains AA contrast in both schemes.
3. **AC #3 — Shell extraction non-regression.** If a `WorkspacePanes` (or other) boundary was extracted: the three-pane resize, drag, persistence, and tool-event fan-out behave identically to the pre-extraction baseline. Smoke test: upload sample lease → run standard scan → red flags render → resize panes → reload page (persisted widths restored).
4. **AC #4 — Motion sweep complete.** A `grep` for hardcoded ms transition values across `src/**/*.tsx` returns zero results (excluding spring physics, which stay numeric). All animation sites still gate on `useReducedMotion()` with a plain-DOM branch.
5. **AC #5 — Reduced motion.** DevTools → emulate `prefers-reduced-motion: reduce`. Walk upload → scan → red flags. No animation fires. No "slowed-down" animation. Plain DOM throughout.
6. **AC #6 — Test sweep.** `npm test` 777+/777+; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.
7. **AC #7 — No regressions in 23b–d-scope behavior.** PDF upload, scan flow, synthetic-summary suppression, disclaimer-bold rendering, red-flag card rendering, role-gated progressive disclosure all unchanged (smoke walk through handoff §26 acceptance items 4-16).

---

## 4b. Phase 6 — Workspace/brand-picker removal (in-scope addendum)

Surfaced during 23a smoke walk: the top-bar workspace/brand picker (rendered by `WorkspaceMenu` inside `WorkspaceHeader`) was a leftover from the original multi-tenant brand-onboarding feature and rendered a broken-looking popover above the chat-home header. The composer paperclip was wired to a `BrandUploadModal` (NOT lease upload), which is wrong product behavior for LeaseLens.

Since this is shell-level cleanup, it belongs naturally in 23a's substrate scope. Per spec §3b, the shell composition audit decided **SKIP** on extracting `WorkspacePanes` / `TopBar` — but the audit also surfaced this vestigial UI as something the foundation sprint should clean up.

**Scope (component-level deletion; data model + routes preserved):**

- Remove `<WorkspaceHeader>` rendering and `otherBrands` derivation from [src/app/page.tsx](../../../src/app/page.tsx) and [src/app/cockpit/page.tsx](../../../src/app/cockpit/page.tsx).
- Remove `FileDropZone` wrapper, `BrandUploadModal` rendering, `pendingFiles` state, `useRouter`, and `onAttachFiles` prop wiring from [src/components/chat/ChatUI.tsx](../../../src/components/chat/ChatUI.tsx).
- Remove `onAttachFiles` prop + `AttachButton` import from [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx).
- Delete component files: `src/components/cockpit/WorkspaceHeader.tsx`, `src/components/workspaces/WorkspaceMenu{.tsx,.test.tsx}`, `src/components/workspaces/BrandUploadModal{.tsx,.test.tsx}`, `src/components/chat/AttachButton{.tsx,.test.tsx}`, `src/components/chat/FileDropZone{.tsx,.test.tsx}`, `src/components/chat/ChatUI.upload.integration.test.tsx`. Remove the now-empty `src/components/workspaces/` directory.

**Preserved (out of scope):**

- The `Workspace` data model and the workspace-cookie middleware — every conversation still has a `workspace_id` foreign key to the sample workspace; ripping this would be a cross-cutting data refactor.
- The `/api/workspaces/select`, `/api/workspaces/select-sample`, and brand-upload server routes — they no longer have a UI caller but remain available. A future cleanup sprint may delete them once we're confident nothing else hits them.
- The composer paperclip itself is removed for now. Re-wiring a paperclip to **lease** upload (the correct flow) is sprint-23c scope (composer redesign).

**Acceptance:** Top-bar shows only LeaseLens mark + "LeaseLens" wordmark + optional cockpit link + theme/role toggles. No workspace picker. No "ACTIVE BRAND" popover. Composer has no paperclip. Existing lease-upload flow (left-pane dropzone) unchanged. Test count adjusts to 753 (−25 deleted tests; zero surviving tests broken).

---

## 5. Out of scope

- Any visual change to the three pane surfaces themselves (23b/c/d own those).
- New components that aren't shell-extractions: no `AppShell` unless audit demands, no `TopBar` unless audit demands, no `CommandComposer` (23c), no `SeverityBadge` (23d).
- New dependencies (motion, framer-motion, shadcn, cmdk, 21st.dev — all out).
- Corpus / classifier / system-prompt / tool-contract / schema changes.
- Manual dark-mode switcher refactor (the current ThemeToggle stays as-is).
- Replacing `motion` library with anything else.
- Adding spacing scales that overlap with Tailwind's default `--spacing` unless the audit demonstrates a real conflict.

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged. No role-gating logic is touched in this sprint.
- **§6 simplicity:** the token additions are contained in the existing `@theme` block + `:root.dark`. No design-system package, no theme provider, no styled-components layer. The shell extraction is one-component-at-a-time and only if audit demonstrates necessity.
- **§7 spec-first:** this spec ships before any code edits per the workflow.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** Tailwind v4 `@theme` block syntax (custom token keys auto-generating utilities) verified against current Tailwind docs before sprint start.

---

## 7. Cross-references

- Parent handoff: [handoff.md](../../../handoff.md) §3 (technical baseline), §6 (visual direction to preserve), §8 (clean code rules), §21 (known technical notes).
- Prior design-system source: [design-system/MASTER.md](../../../design-system/MASTER.md) — read for the brand-identity context behind any new token decision.
- Implementation source of truth for tokens: [src/app/globals.css](../../../src/app/globals.css). If a token value in this spec conflicts with that file at implementation time, the CSS file wins; this spec is updated to match.
- Downstream sprints: [sprint-23b-document-dock/spec.md](../sprint-23b-document-dock/spec.md), [sprint-23c-conversation-workspace/spec.md](../sprint-23c-conversation-workspace/spec.md), [sprint-23d-risk-radar/spec.md](../sprint-23d-risk-radar/spec.md).

---

**End of spec.**
