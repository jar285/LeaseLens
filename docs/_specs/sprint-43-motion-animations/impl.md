# Sprint 43 — Motion: implementation QA notes

Per-sub-sprint QA notes. Each records what changed, tests added, gate results, QA/QC outcome, and anything deferred.

---

## 43.1 — Foundations + motion tokens (2026-06-07)

**Goal:** one root `MotionProvider` (`<MotionConfig reducedMotion="user">`) consolidating the reduced-motion
contract, and a tokenized motion system extending the existing `presets.ts` — additive, behavior-preserving,
no new dependency.

**What changed**
- **NEW** [src/components/layout/MotionProvider.tsx](../../../src/components/layout/MotionProvider.tsx) — thin
  `<MotionConfig reducedMotion="user">` wrapper. Deliberately minimal; the `{motion}`→`m` + `LazyMotion`
  bundle migration is deferred to its own sprint, at which point `<LazyMotion>` slots in here with no call-site
  changes.
- [src/lib/motion/presets.ts](../../../src/lib/motion/presets.ts) — added tween tokens: `DURATION`
  (`fast 0.15 / base 0.25 / enter 0.4`, seconds; `enter` doubles as the Mode A→B flip ceiling), `EASE`
  (`standard`/`exit` aliasing the existing `EASE_OUT_SOFT`/`EASE_IN_OUT_SOFT` arcs — single source), and
  `STAGGER` (`0.05`, bounded so list entrance never withholds content). The springs already in the file are
  unchanged.
- [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) —
  wrapped the router output in `<MotionProvider>` so one config covers **both** Mode A and Mode B (and the
  future Mode A→B flip). The early-return (`if (!liveActiveLease) return <ParserLandingShell/>`) became a
  single return with a ternary — verified behavior-preserving (same components/props/conditions; the inner
  `AssistantFabProvider → LeaseParserProvider → ChatStreamProvider` order, owned by `ParserResultsShell`,
  is undisturbed).

**Tests added (TDD red→green)**
- **NEW** [src/lib/motion/presets.test.ts](../../../src/lib/motion/presets.test.ts) — token contract: ascending
  duration scale, seconds-not-ms guard, `EASE` aliases the existing arcs, bounded positive `STAGGER`.
- **NEW** [src/components/layout/MotionProvider.test.tsx](../../../src/components/layout/MotionProvider.test.tsx)
  — structural contract: renders children transparently, including under a mocked reduced-motion preference and
  around a `motion` child. Comment honestly scopes what this *can't* prove (transform auto-disable is not
  observable in happy-dom → gated by the 43.7 Playwright run).

**Gate results**
- `npm run lint` — clean (330 files).
- `npm run typecheck` — clean.
- `npm test` — **1241 passed, 142 files** (was 1236; +5 new). The full suite is the regression check that the
  global `MotionConfig` did not disturb the ~40 existing per-component reduced-motion sites in their own tests.
- `npm run build` / **bundle baseline — DEFERRED**: a `dev` server was live and `build` clobbers its `.next`
  (known gotcha). To capture: stop dev, `npm run build`, record the First Load JS. This sprint is additive so
  the eventual delta is ~0; the baseline's main purpose is the "before" number for the deferred bundle migration.

**QA/QC (adversarial workflow — 3 dimensions, each HIGH/MED finding independently verified)**
- **0 confirmed findings.** Reduced-motion regression: no at-risk non-branching `motion` site (nothing relies on
  a transform to *become visible*). Invariants/behavior: router refactor exactly behavior-preserving; all locked
  decisions honored. Test quality: one MED finding (the "existing suite verifies the backstop" claim is only
  implied, not tested) — adversarially **dismissed** as a comment-wording nitpick correctly scoped to 43.7, but
  the overclaim was real, so the `MotionProvider.test.tsx` header comment was tightened to not overclaim.

**Deferred / follow-up**
- Capture the bundle baseline (above) when no dev server is live.
- The `{ motion }` → `m` + `LazyMotion` bundle migration across the 17 heavyweight-import files (its own sprint;
  the 43.1 baseline is its "before").

---

## 43.2 — FAB drawer enter/open transition — RETIRED (2026-06-07)

**Outcome: no code change.** Reading the drawer to begin this slice showed the open/close is already a
complete, state-driven, reduced-motion-aware CSS animation that stays mounted (`AssistantFab.client.tsx`:
`DRAWER_MOTION`, the `fab.state` class toggle, `hasMountedDrawerRef`, `motion-reduce:transition-none`,
`drawerRef.focus()` on open). All three of 43.2's acceptance tests already pass — "animate not mount",
"draft survives reopen" (`AssistantFab.integration.test.tsx:589`), "focusable through the transition". A
CSS→Motion conversion would touch the highest-risk component (drafts-survive) and mix Motion transforms with
the CSS resize we contractually keep — for no user-visible gain, failing the Rams "earns its place" gate.
Retired by user decision; spec updated. Energy moves to the genuinely-new animations (43.3, 43.4).

---

## 43.3 — Mode A→B flip (2026-06-07)

**Goal:** orient the user across the upload transition ("lease loaded → here's the workspace") with a calm
entrance, without touching the load-bearing layout or the `fixed` FAB.

**What changed**
- **NEW** [src/components/lease/workspace-flip.ts](../../../src/components/lease/workspace-flip.ts) —
  `shouldAnimateModeFlip(freshUpload, reducedMotion)` (pure gate) + `MODE_FLIP_TRANSITION` (tokenized:
  `DURATION.enter` ceiling, `EASE.standard`). The flip plays **only** on a fresh in-session upload with motion
  enabled — SSR-rehydrated workspaces and reduced-motion render instantly.
- [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) —
  added `useReducedMotion()`; wrapped the Mode B branch in `<motion.div initial={animateFlip ? {opacity:0} :
  false} animate={{opacity:1}} transition={MODE_FLIP_TRANSITION}>`. **Opacity-only by design**: the subtree
  holds the `fixed` AssistantFab, and a transform on an ancestor would re-base its containing block (Motion can
  leave a residual `translateY(0)`). Mode A (ParserLandingShell) is unchanged. **No `AnimatePresence`** — the
  router test asserts the old shell leaves the DOM on switch; an exit animation would have lingered it.

**Tests added (TDD red→green)**
- **NEW** [src/components/lease/workspace-flip.test.ts](../../../src/components/lease/workspace-flip.test.ts) —
  6-case truth table for the gate (fresh+motion → animate; SSR / reduced / null → instant) + the transition
  consumes the tokenized `enter` duration and `standard` easing. The opacity animation itself is gated by the
  43.7 Playwright run (not observable in happy-dom).

**Gate results**
- `npm run lint` clean (332 files); `npm run typecheck` clean; `npm test` — **1247 passed, 143 files** (+6).
  The existing `WorkspaceRouterShell.test.tsx` (6 tests) is the regression guard — the wrapper preserves the
  synchronous mode switch, prop forwarding, upload-lift, and Replace→Mode A.
- Bundle baseline still **DEFERRED** (dev live).

**QA/QC (adversarial workflow — 3 dimensions: CSS-interaction, SSR/hydration+behavior, restraint/test-honesty)**
- **0 findings.** Independent verification confirmed: opacity-only is safe for the fixed FAB and the
  `lg:sticky` PDF pane (no transform injected; transient stacking context only while opacity<1); no
  SSR/hydration mismatch (`freshUpload` is always false on the initial render → `initial={false}` on both
  server and first client render); behavior preserved; opacity-only justified + tokenized; tests honest.

---

## 43.4 — clause/red-flag list-entrance stagger (2026-06-07)

**Goal:** turn `ClausesList`'s bulk-snap (all rows appear at once when `extract_clauses` lands) into a calm,
capped cascade. `RedFlagReport` already satisfies its half — cards are severity-sorted (high-first), already
animate entrance, and are reduced-motion-aware — so it was **left untouched** (no churn, Rams).

**What changed**
- **NEW** [src/lib/motion/stagger.ts](../../../src/lib/motion/stagger.ts) — `cappedStaggerStep(count, step, cap)`:
  the per-item delay shrinks as the list grows so the last item's delay (`step*(count-1)`) never exceeds
  `LIST_STAGGER_CAP_SECONDS` (0.4s). A long clause list never withholds its tail behind a slow reveal
  (parser-first: content scannable fast).
- [src/components/lease/ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) — static `<ul>`/`<li>`
  → `<motion.ul>`/`<motion.li>` with container/item variants (`opacity 0→1`, `y 4→0`, `DURATION.fast` +
  `EASE.standard`), `staggerChildren = cappedStaggerStep(rows.length)`. Gated `animate = mounted && !reduced`
  with `initial={animate ? 'hidden' : false}`: a freshly-**populated** list (the scan's extract landing after
  mount) cascades; a **rehydrated** list (rows present on first render) does not flash on page load; reduced
  motion is instant. The whole row (label + page + SeverityBadge / "—") fades+rises as one unit, so severity
  icon+text are never absent while only the colour band shows.

**Tests added (TDD red→green)**
- **NEW** [src/lib/motion/stagger.test.ts](../../../src/lib/motion/stagger.test.ts) — 5 cases proving the budget
  invariant (`step*(count-1) ≤ cap`) across many counts, the STAGGER/cap defaults, and single/empty handling.
  The cascade itself is gated by the 43.7 Playwright run (not observable in happy-dom).

**Gate results**
- `npm run lint` clean (334 files); `npm run typecheck` clean; `npm test` — **1252 passed, 144 files** (+5).
  The existing 10 `ClausesList.test.tsx` tests are the regression guard — the `motion.ul`/`li` swap preserved
  rows, clicks, testids, and SeverityBadges. Bundle baseline still **DEFERRED** (dev live).

**QA/QC (adversarial workflow — 3 dimensions: animation-correctness/Osmani re-render, CSS/spec, test-honesty)**
- **0 findings.** Verified: cascade fires only on post-mount population (not rehydration); a grading update
  re-renders a row's content but does NOT remount the `motion.li` (stable `clause_id` key) → no re-cascade and
  no full-list churn (Osmani); the `y` transform is safe (no fixed descendants in the list); capped + tokenized
  + reduced-motion + color-not-alone all hold; `RedFlagReport` left untouched; tests honest.

---

## 43.5 — card micro-interactions (2026-06-07)

**Goal:** add sober tap/press feedback to the interactive clause rows + red-flag cards (≥44px preserved, no
playful bounce on legal-risk content), and a visible focus indicator at every site. Hover was already covered
soberly (red-flag `hover:shadow-lift`, clause-row `hover:bg`), so this slice is **tap-press + focus** only.

**What changed (CSS, not Motion — honors the deferred-migration decision)**
- [src/components/lease/ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) (row button) +
  [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) (card toggle):
  `transition-colors` → `transition-[background-color,transform]`, added sober `active:scale-[0.99]` (matching
  the FAB pill's `active:scale-[0.98]`; linear, no spring/overshoot — tone invariant), with
  `motion-reduce:transition-none` + `motion-reduce:active:scale-100` so reduced-motion fully neutralizes both
  the transition and the scale.
- **Red-flag toggle focus** — replaced the too-faint `focus-visible:bg-surface-muted/60` (~1.03–1.07:1, below
  the 3:1 focus-indicator bar) with a visible **inset** ring (`focus-visible:ring-2 focus-visible:ring-inset
  focus-visible:ring-accent-300 dark:focus-visible:ring-accent-400/50`, bg kept as a subtle fill). Inset (no
  `ring-offset`) survives the card's `overflow-hidden` — the same idiom the card's own `ActiveRing` uses. (My
  first pass wrongly assumed *any* ring would clip and kept the bg-change; the QA caught it.) Clause rows keep
  their existing `ring-offset` ring (they sit outside any `overflow-hidden`).

**Tests added (TDD red→green for the ring)**
- [RedFlagReport.test.tsx](../../../src/components/lease/RedFlagReport.test.tsx) — the card toggle exposes the
  tap-press, the reduced-motion neutralizers, and the inset focus ring (the ring assertion was red until the
  ring landed). [ClausesList.test.tsx](../../../src/components/lease/ClausesList.test.tsx) — rows expose the
  tap-press + reduced-motion neutralizer and retain their focus ring. className-contract tests, idiomatic in
  this repo for CSS micro-interactions (cf. ConfirmDialog/ParserLandingShell `active:scale` assertions).

**Gate results**
- `npm run lint` clean (334 files); `npm run typecheck` clean; `npm test` — **1254 passed, 144 files** (+2).
  Bundle baseline still **DEFERRED** (dev live).

**QA/QC (adversarial workflow — 2 dimensions: Tailwind/reduced-motion correctness, tone/spec/consistency)**
- **1 confirmed (MED), now fixed; 1 dismissed.** Confirmed: 43.5 shipped CSS with no tests, violating the
  sub-sprint DoD — *fixed* by adding the className-contract tests above (my "CSS isn't unit-testable" stance
  was wrong; the repo has precedent). Dismissed (out-of-scope for 43.5) but flagged as a real a11y weakness:
  the toggle's bg-change focus was ~1.03:1 — *resolved here* by the inset ring (better than deferring), since I
  was already touching that button and the user's original 43.5 ask included a visible ring. The adversarial
  verifier corrected my earlier over-claims ("WCAG-valid" bg-change; "a ring would clip") — both now fixed.
