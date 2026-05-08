# Sprint 15 — Sprint Plan

**Status:** Draft, awaiting human QA per charter §7 step 4.
**Date:** 2026-05-08.
**Implements:** [`spec.md`](spec.md).

---

## 1. Overview

Sprint 15 ships in **10 phases**. Each phase compiles, lints, type-checks, and tests green before the next begins. The sprint is dependency-ordered: token foundation → header surface → centre-pane (empty / composer / transcript / ToolCard) → left-pane (dropzone) → right-pane (RedFlagReport) → dark-mode coverage sweep → a11y verification.

| Phase | Subject | Files | Est. |
|---|---|---|---|
| 1 | Token foundation: `@theme` block + `next/font` (Geist + Source Serif 4) | globals.css, layout.tsx | 60 min |
| 2 | Header polish + RoleSwitcher animated pill | RoleSwitcher.tsx, WorkspaceHeader.tsx, page.tsx | 60 min |
| 3 | Empty state: serif H1, sparkle loop, staggered cards | ChatEmptyState.tsx | 45 min |
| 4 | Composer + AttachButton: focus crossfade, send spring, parse progress ring | ChatComposer.tsx, AttachButton.tsx | 60 min |
| 5 | ChatMessage per-token fade + Transcript rhythm + Indicator recolour | ChatMessage.tsx, ChatTranscript.tsx, TypingIndicator.tsx | 60 min |
| 6 | ToolCard hairline + 2px hover lift + semantic-token badges | ToolCard.tsx | 30 min |
| 7 | LeaseUploadDropzone dragover refinement + copy swap + icon pulse | LeaseUploadDropzone.tsx | 45 min |
| 8 | RedFlagReport slide-in items + header pulse + token severity bars | RedFlagReport.tsx, CitationChip.tsx | 60 min |
| 9 | Dark-mode coverage pass — every component touched in 2–8 grows `dark:*` variants | all of the above + page.tsx | 90 min |
| 10 | A11y + reduced-motion verification, Lighthouse, test housekeeping | * | 60 min |

Total: ~9 hours, sized to one focused day. No parallelisation — each phase depends on the token system from Phase 1 and is small enough that serial execution beats coordination.

---

## 2. Per-phase detail

### Phase 1 — Token foundation

**Files:** [src/app/globals.css](../../../src/app/globals.css), [src/app/layout.tsx](../../../src/app/layout.tsx)

1. Replace the current `@layer base { ... }` block with the full `@theme` block from [spec §3a](spec.md#3a-tokens-the-theme-block). Keep `font-smoothing` and the `html, body { height: 100% }` rules in `@layer base`.
2. Replace the body's hard-coded `background-color: #f8f9fa` and `color: #1a1a2e` with `background: var(--color-surface-base); color: var(--color-fg-default); font-family: var(--font-sans); font-feature-settings: "ss01", "cv11";`.
3. Add the `@media (prefers-color-scheme: dark)` block that flips the surface aliases.
4. Widen `color-scheme: light` to `color-scheme: light dark`.
5. In [layout.tsx](../../../src/app/layout.tsx), import `Geist`, `Geist_Mono`, and `Source_Serif_4` from `next/font/google` with `variable` declarations. Apply the variables on `<html>`.
6. Add a `.tabular` utility either in `@layer utilities` or as `font-variant-numeric: tabular-nums` on a token-derived class.

**Verification:** `npm run typecheck` green. `npm run build` succeeds. Visit `/` — should look near-identical to today (no component reads tokens yet; only base body changes).

**Test impact:** none — no component logic changes.

### Phase 2 — Header polish + RoleSwitcher animated pill

**Files:** [src/components/auth/RoleSwitcher.tsx](../../../src/components/auth/RoleSwitcher.tsx), [src/components/cockpit/WorkspaceHeader.tsx](../../../src/components/cockpit/WorkspaceHeader.tsx), [src/app/page.tsx](../../../src/app/page.tsx)

1. `RoleSwitcher.tsx`: wrap the active button's content with a `motion.div` that has `layoutId="role-pill"` and absolute-positioned styling so it slides between roles. Use the existing `useReducedMotion` pattern; in the reduced branch render a plain background.
2. `WorkspaceHeader.tsx`: swap remaining `gray-*` to neutral tokens; add `tabular` class to any visible numeric (workspace count, etc.).
3. `page.tsx`: tighten header padding from `py-3.5` to `py-3`. Swap the indigo `bg-indigo-600` ScrollText icon background to `bg-accent-600`.

**Verification:** click between Tenant/Reviewer/Admin — pill slides between positions. RoleSwitcher's `data-active` attribute still toggles correctly (test asserts this).

**Test impact:** [RoleSwitcher.test.tsx](../../../src/components/auth/RoleSwitcher.test.tsx) asserts `data-active` and accessible name; should pass unchanged. Check that `motion.div` doesn't break the test's DOM query.

### Phase 3 — Empty state

**Files:** [src/components/chat/ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx)

1. Heading: keep `<h2>` semantics (global `<header>` owns h1) but visually elevate via `font-serif text-4xl tracking-tight`. Copy stays `{workspaceName}`.
2. Sparkle icon: wrap in `motion.div` with `animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}`, `transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}`. Reduced-motion: render plain icon container.
3. Starter cards: parent `motion.div` with `transition={{ staggerChildren: 0.06 }}`; child `motion.button` with `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.024 * 5 }}` (~120ms total per card). Hover via `whileHover={{ x: 0 }}` on the parent and a `motion.span` icon child that animates `x: 2` on hover.

**Verification:** hot-reload `/`, watch first-paint stagger; pause sparkle via DevTools to confirm scale range is 1.00–1.04 only.

**Test impact:** [ChatEmptyState.test.tsx](../../../src/components/chat/ChatEmptyState.test.tsx) asserts copy + click handlers — should pass unchanged.

### Phase 4 — Composer + AttachButton

**Files:** [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx), [src/components/chat/AttachButton.tsx](../../../src/components/chat/AttachButton.tsx)

1. Composer container: replace the abrupt `focus-within:border-indigo-300` with a CSS-driven crossfade — set `transition: border-color var(--motion-120) var(--ease-out-soft)` and toggle the border colour via `:focus-within` selector.
2. Send button: convert to `motion.button` with `whileHover={{ scale: 1.05 }}`, `whileTap={{ scale: 0.97 }}`, soft spring `{ stiffness: 500, damping: 25 }`. Disabled state retains `opacity-35` and skips motion via `motion.button`'s built-in disabled handling (whileHover/whileTap don't fire on disabled).
3. Add hidden hint `<span className="sr-only" id="composer-hint">Shift plus Enter inserts a new line</span>`. Add `aria-describedby="composer-hint"` on the textarea.
4. AttachButton: when `disabled === true` (parent passes during a parse), render `Loader2` from `lucide-react` with `animate-spin` at 50% opacity instead of just dimming the paperclip.

**Verification:** focus the textarea, watch border crossfade. Hover send, watch spring. Tab to textarea with screen reader on, hear "Shift plus Enter inserts a new line".

**Test impact:** [ChatComposer.test.tsx](../../../src/components/chat/ChatComposer.test.tsx) asserts keyboard handling and disabled state. The textarea now has `aria-describedby` — that may add a `getByRole('textbox')` accessible-description assertion if we extend the test. Existing tests pass unchanged.

### Phase 5 — ChatMessage per-token fade + Transcript rhythm + Indicator

**Files:** [src/components/chat/ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx), [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx), [src/components/chat/TypingIndicator.tsx](../../../src/components/chat/TypingIndicator.tsx)

1. ChatMessage: keep existing 250ms y-slide entry. Add per-token fade only when `isStreaming === true` and `role === 'assistant'`. Use a `useRef<number>(0)` to track last-seen content length; on each render, the substring from `lastSeen.current` to `content.length` is the delta. Render delta as a `motion.span` with `initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.05 }}`. After settle (when `isStreaming` flips false), render content as plain text.
2. ChatTranscript: tighten `py-6` to `py-5` on the scroll container. No structural change.
3. TypingIndicator: recolour dots from `bg-indigo-400` to `bg-accent-400`. No new component, no new motion library.

**Verification:** send a question, watch tokens fade in. Confirm settled text doesn't re-animate on subsequent renders.

**Test impact:** [ChatMessage.test.tsx](../../../src/components/chat/ChatMessage.test.tsx) and [ChatTranscript.test.tsx](../../../src/components/chat/ChatTranscript.test.tsx) assert content text — should pass unchanged. The streaming-fade is purely visual over existing `content` state.

### Phase 6 — ToolCard

**Files:** [src/components/chat/ToolCard.tsx](../../../src/components/chat/ToolCard.tsx)

1. Replace `shadow-sm` on root with `shadow-hairline` (token).
2. Wrap root in `motion.div` with `whileHover={{ y: -2 }}`, `transition={{ duration: 0.15, ease: 'easeOut' }}`. Reduced-motion: skip.
3. Status badges: token swap — green-100/600 → success-100/600, gray-100/600 → neutral-100/600, red-100/700 → danger-100/600.
4. Header: `text-indigo-500` icon → `text-accent-500`.

**Verification:** hover any tool card — 2px lift. Severity badges look right.

**Test impact:** [ToolCard.test.tsx](../../../src/components/chat/ToolCard.test.tsx) checks status text + Undo button — should pass unchanged.

### Phase 7 — LeaseUploadDropzone

**Files:** [src/components/lease/LeaseUploadDropzone.tsx](../../../src/components/lease/LeaseUploadDropzone.tsx)

1. Drop the `border-dashed` on dragover state — replace with solid accent border. Idle stays dashed.
2. Copy on dragover: change "Drop the PDF to upload" → "Drop to scan." (one assertion churn flagged below.)
3. Icon: on `isDragOver === true`, wrap in `motion.div` with `animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 0.4 }}` triggered on the dragover transition (use `key={isDragOver}` to re-mount). Reduced-motion: plain icon.
4. Token sweep: idle/uploading/error/success colour states swap to neutral + accent + semantic tokens.

**Verification:** drag a PDF over the left pane — solid accent border, "Drop to scan", icon pulses once.

**Test impact:** [LeaseUploadDropzone.test.tsx](../../../src/components/lease/LeaseUploadDropzone.test.tsx) — one assertion change for the copy. Keep the assertion, swap the expected string.

### Phase 8 — RedFlagReport + CitationChip

**Files:** [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx), [src/components/lease/CitationChip.tsx](../../../src/components/lease/CitationChip.tsx)

1. Wrap each grading card in `motion.li` with `initial={{ opacity: 0, x: 8 }}`, `animate={{ opacity: 1, x: 0 }}`, `exit={{ opacity: 0, x: -8 }}`, `transition={{ type: 'spring', stiffness: 300, damping: 30 }}`. Wrap the list in `<AnimatePresence>` for exit animations on lease swap.
2. Track previous count via `useRef<number>(0)`; when count increases, trigger a `motion.span` opacity pulse `[1, 0.7, 1]` over 350ms on the "RED FLAGS" header label and count.
3. Severity bars: hard-coded `bg-red-500` etc. → semantic tokens (`bg-danger-600`, `bg-warning-600`, `bg-info-600`, `bg-success-600`).
4. CitationChip: token-recolour the inline pill (currentColor sourced from severity row).

**Verification:** run a standard scan — items slide in from right, header pulses on each. Inspect severity bar colours under DevTools.

**Test impact:** [RedFlagReport.test.tsx](../../../src/components/lease/RedFlagReport.test.tsx) and [CitationChip.test.tsx](../../../src/components/lease/CitationChip.test.tsx) assert text + click — should pass unchanged.

### Phase 9 — Dark-mode coverage pass

**Files:** every component touched in Phases 2–8, plus [page.tsx](../../../src/app/page.tsx) (header markup), [LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx) (pane backgrounds + borders).

For each component, sweep className lists and add `dark:` companions:

- `bg-white` → `bg-white dark:bg-neutral-900`
- `bg-gray-50` / `bg-gray-100` → `bg-neutral-50 dark:bg-neutral-900` / `bg-neutral-100 dark:bg-neutral-800`
- `text-gray-400` → `text-neutral-400 dark:text-neutral-500`
- `text-gray-600` / `text-gray-800` / `text-gray-900` → `text-neutral-600 dark:text-neutral-300` / `text-neutral-800 dark:text-neutral-200` / `text-neutral-900 dark:text-neutral-50`
- `border-gray-100` / `border-gray-200` → `border-neutral-100 dark:border-neutral-800` / `border-neutral-200 dark:border-neutral-800`

Accent stays mostly the same hue in dark — token system handles the slight desaturation.

**Verification:** DevTools → Rendering → emulate `prefers-color-scheme: dark`. Walk every chat surface + cockpit panel + dropzone + RedFlagReport. Run Lighthouse a11y in dark mode — expect ≥ 95.

**Test impact:** none — `dark:` variants are CSS-only.

### Phase 10 — A11y verification + reduced-motion + test housekeeping

1. Run an axe-core pass via `@testing-library/jest-dom`'s `toHaveNoAxeViolations()` in 1–2 spot tests (extend `ChatEmptyState.test.tsx`).
2. Walk every new motion site with reduced-motion emulated; confirm DOM has no `motion.*` rendered.
3. `npm run test` — expect 507+ pass (1 churned assertion in dropzone; possibly +1 axe spot test).
4. `npm run typecheck` green; `npm run lint` 0 errors; `npm run build` succeeds.
5. Lighthouse a11y in both colour schemes ≥ 95.

**Test impact:** churned + new axe assertion are the only test deltas.

---

## 3. Commit cadence

One commit per phase. Conventional-commit style matching the repo:

- `feat(s15): Phase 1 — Tailwind v4 @theme tokens + Geist/Source Serif 4`
- `feat(s15): Phase 2 — RoleSwitcher animated pill + header token sweep`
- `feat(s15): Phase 3 — empty state serif H1 + sparkle loop + staggered cards`
- ... (one per phase)
- `feat(s15): Phase 9 — dark-mode coverage across chat/lease/auth surfaces`
- `chore(s15): Phase 10 — a11y verification + reduced-motion sweep + Lighthouse`

---

## 4. Rollback plan

Token system is additive. Reverting a single phase requires `git revert <sha>` of that phase's commit. Phase 1 (tokens + fonts) has no component dependencies, so it's safe to leave in place even if all subsequent phases are reverted — body just renders Geist + Source Serif on a warm-neutral background.

The dark-mode pass (Phase 9) is the most cross-cutting; if a contrast issue appears, the fix is in-place token tuning, not full revert.

---

## 5. Risks

1. **Geist's `font-feature-settings: "ss01", "cv11"` on body may visually regress legal-text reading.** Mitigation: walk the corpus chunk passages and PdfViewer captions in dark + light before declaring Phase 1 done.
2. **`motion`'s `layoutId` + `useReducedMotion` may surprise the test harness.** Mitigation: keep the reduced-motion DOM swap explicit (no `motion.*` in the reduced branch); existing tests already use this pattern in ChatMessage / ToolCard.
3. **Tailwind v4 `@theme` syntax is recent.** Mitigation: Context7 verification before Phase 1 (charter §15a).
4. **`next/font/google` imports add to first-load bundle.** Mitigation: Geist + Source Serif 4 are subset-latin and `display: 'swap'` by default; Lighthouse in Phase 10 will catch any regression.

---

**End of sprint plan.**
