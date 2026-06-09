# Sprint 43 — Motion: New Signature Animations on an Already-Motion Codebase

> Draft renumbered 39→43 (spec order == ship order; predates shipped Sprint 41/42). Source intent: the
> user's research ask — "rich, production-ready, outstanding UI/UX animations like Framer / motion.dev."
> **Revised 2026-06-07 after a 4-lens Spec-QA** (development-philosophy / power-words / ui-ux-design-philosophy
> + a current-state fact-check). The original draft assumed a greenfield Motion adoption; the fact-check
> proved Motion is already pervasive, so the premise and the bundle strategy were rewritten. **Awaiting the
> revised-spec gate — no commits until approved.**

## Goal

Add the **few signature transitions the app is still missing** — the Mode A→B workspace flip, the
clause/red-flag list entrance, card hover/tap micro-interactions, and a scan-complete cascade — and
**consolidate reduced-motion handling** behind a single root `<MotionConfig>`, **without** regressing the
parser-first hierarchy, the accessibility baseline, the FAB-stays-mounted invariant, or the calm/serious
tone a legal product needs. This sprint is **additive and behavior-preserving**: it uses the Motion import
pattern already in the codebase and adds no new dependency.

## Why now — verified current state (2026-06-07)

The original draft read as "adopt Motion / add the dep / wrap once / keep initial JS ~6kb." **That premise was
false.** Verified against the code:

- **Motion is already a production dependency** (`motion@^12.38.0`, `package.json`) used in **19 files** that
  import from `motion/react`. **17 use the heavyweight `{ motion }`** import; **7 use `AnimatePresence`**.
- **Zero** files use `LazyMotion`, `m`, or `MotionConfig` today. So the original "LazyMotion keeps us at ~6kb
  instead of ~34kb" claim is wrong **twice**: the app already ships the full runtime (17 direct `{ motion }`
  imports), and a `LazyMotion` wrap shrinks nothing until *every* `{ motion }` import is migrated to `m`.
- A motion-presets module **already exists** at `src/lib/motion/presets.ts` (spring/transition presets) — the
  "motion token system" is partly built; we **extend** it, not invent a new one.
- **Reduced-motion is already honored per-component** via `useReducedMotion()` + Tailwind `motion-reduce:`
  across ~40 sites, and there is already a Playwright reduced-motion e2e test (`tests/e2e/red-flag-interactions.spec.ts`,
  T18, asserts `data-motion="off"`). The global `MotionConfig` this sprint adds is a **consolidation/backstop**,
  not net-new a11y behavior — and it must be verified not to conflict with the existing per-component branches.
- **Already animated** (do not touch): FAB drawer open/close (CSS, Sprint 36.4) and RedFlag entrance
  (`RedFlagReport.tsx`, spring + `LayoutGroup`). The FAB drawer **stays mounted** (`AssistantFab.client.tsx`).
- **Not animated today (the genuinely-new work):** the Mode A→B flip (`WorkspaceRouterShell.tsx` hard-swaps
  `ParserLandingShell` ↔ `ParserResultsShell`) and `ClausesList.tsx` entrance (static list).
- **No bundle-analysis tooling / baseline** exists; `next build` is plain.

**Scope decision (user gate, 2026-06-07): defer the bundle migration.** The 17-file `{ motion }` → `m` +
`LazyMotion` migration is a behavior-preserving refactor that delivers a *bundle reduction* and deserves its
own sprint (recorded under Deferred work, Ward Cunningham). This sprint stays additive: it uses the existing
`motion` import pattern for consistency with the 17 files and does **not** add `LazyMotion`/`m`.

## Target user

The **NJ tenant** on the parser-first surface — anxious, reading a legal document, scanning for what's wrong
with their lease. Motion serves *them* only when it aids comprehension: orientation across the Mode A→B flip
("your lease loaded; here's the workspace"), perceived performance as findings arrive, and clear feedback on
the opt-in chat drawer. The secondary user is the **operator** (bundle/runtime-perf budget). Motion that
exists for its own sake — especially anything celebratory on legal-risk content — is out of scope by design.

## Governing power-words (the design lenses for Sprint 43)

Per `power-words.md` (valid only when each names a real decision/artifact/failure-mode/verification):

| Power word | Decision it governs | Verification |
|---|---|---|
| **WCAG** | Global `<MotionConfig reducedMotion="user">` + per-site `useReducedMotion()`; ≥44px targets preserved through hover/tap scaling; severity stays text+icon+color **including mid-animation**; visible non-animated focus rings. | Playwright reduced-motion run green (43.7); reduced-motion→static unit tests; touch-target-unchanged test; focus-reachable test across FAB-open + Mode A→B. |
| **Apple HIG** | FAB drawer open/close motion (already a stays-mounted, reduced-motion-aware CSS transition — 43.2 retired, no conversion). | "Draft survives reopen" invariant test stays green (`AssistantFab.integration.test.tsx:589`). |
| **React Team / Dan Abramov** | No `AnimatePresence` mount-gating on the FAB; provider tree order preserved (`MotionProvider` wraps without reorder). | FAB-state-persistence test + `ChatStreamContext` exposed-keys test stay green. |
| **Ilya Grigorik** | The Mode A→B flip + list stagger must hold a measured **runtime** budget, not just a bundle number ("performance designed, not guessed"). | CLS/INP (or frame-budget) check on flip + stagger at 43.7; bundle-delta ~0 vs 43.1 baseline (additive sprint). |
| **Addy Osmani** | The scan-complete cascade tied to `use-scan-progress` must **not** re-render the full clause list / PDF viewer on every progress tick. | Render-count assertion on the progress-driven cascade (43.6). |
| **Dieter Rams** | Restraint is a **gate**, not a claim: each animation states the comprehension/feedback it buys; signature-only scope; CSS resize transition stays (Sprint 36.4 / 37.5 not reversed). | Per-sub-sprint "earns its place" line; explicit sober-motion sign-off on 43.5/43.6. |

Supporting: **Kent C. Dodds** (test user-observable behavior — draft survives, target stays ≥44px,
reduced-motion yields static output, high-severity flag visible immediately — not "a `whileHover` prop exists").

## Locked decisions (revised-spec gate — confirm before 43.1)

1. **Use the existing `motion` import pattern; bundle migration deferred.** This sprint adds no `LazyMotion`/`m`
   and no new dep — it matches the 17 files already importing `{ motion }` from `motion/react` for consistency.
   The `{ motion }`→`m` + `LazyMotion` bundle migration is its **own future sprint** (Deferred work). No grep
   guard forbidding `{ motion }` this sprint — that guard belongs to the migration sprint (it would fail today).
2. **`<MotionConfig reducedMotion="user">` at the root**, mounted via a `MotionProvider`. Consolidates the
   reduced-motion contract globally (auto-disables transform/layout, keeps opacity/color). **Must be verified
   not to regress** the ~40 existing per-component `useReducedMotion()` branches — 43.1 includes that check.
3. **The FAB drawer stays mounted (CLAUDE.md).** Animate open/close via state-driven variants — **never** gate
   mount/unmount through `AnimatePresence`. Drafts + conversation survive close→reopen exactly as today.
   `AnimatePresence` is allowed only for genuinely-unmounting inner content.
4. **Severity stays text + icon + color — including mid-animation.** No animation may make color or motion the
   *only* signal, and no entrance frame may show the color band before its text+icon. `SeverityBadge` unchanged.
5. **No playful/celebratory motion on legal-risk content (tone invariant).** Red-flag hover/tap and the
   scan-complete cascade must read as **sober/informational** (subtle elevation; no bounce/overshoot/confetti).
   The cascade *directs attention to findings*; it does not *celebrate completion* — a confetti feel on "4
   serious red flags" undermines the trust a legal product needs.
6. **The stagger never withholds high-severity red flags.** High-severity cards render first/instantly; stagger
   is a bounded attention aid, not a reveal gimmick that delays the most important content from being scannable.
7. **Provider tree order is preserved.** `MotionProvider` wraps without disturbing
   `AssistantFabProvider → LeaseParserProvider → ChatStreamProvider`.
8. **Motion is tokenized.** Durations, easings, and the stagger interval live in (an extended) `src/lib/motion/presets.ts`;
   every new `motion.*` site consumes tokens — components consume, never duplicate (repo convention).

## Sub-sprints (each a small reviewable commit, one purpose, TDD red→green)

- **43.1 — Foundations + motion tokens.** `MotionProvider` (`<MotionConfig reducedMotion="user">`) mounted in
  the workspace shell (above `AssistantFabProvider`); **extend** `presets.ts` into a documented token set
  (`duration.fast/base/enter`, `ease.standard/exit`, one `stagger` interval). Capture a **bundle baseline**
  (record initial-JS from `next build`) for the future migration's payoff. *Earns its place:* one source of
  truth for reduced-motion + consistent motion feel. Tests: provider renders children; reduced-motion path
  yields static values; **regression — the existing per-component `useReducedMotion()` sites still behave**
  (no double-disable / conflict introduced by the global config).
- **43.2 — FAB drawer enter/open transition. RETIRED (2026-06-07) — already satisfied.** Reading the drawer
  to start this slice showed the open/close is *already* a complete, state-driven, reduced-motion-aware CSS
  animation that stays mounted (`AssistantFab.client.tsx`: `DRAWER_MOTION` opacity/scale/translate on
  `ease-out-soft`, the `fab.state` class toggle, `hasMountedDrawerRef`, `motion-reduce:transition-none`,
  `drawerRef.focus()` on open). Every acceptance test 43.2 named already passes — "animate not mount",
  "draft survives reopen" (`AssistantFab.integration.test.tsx:589`), "focusable through the transition". A
  CSS→Motion conversion would touch the highest-risk component (the drafts-survive invariant) and mix Motion
  transforms with the CSS width/height resize we keep — for no user-visible gain. Per the **Rams "earns its
  place"** gate this slice does not earn its place; it is retired, consistent with the *"Already animated (do
  not touch): FAB drawer open/close"* note under "Why now".
- **43.3 — Mode A→B flip (only).** Animate `WorkspaceRouterShell`'s Mode A→B transition under a **duration
  ceiling** (token `duration.enter`); reduced-motion → instant. *Earns its place:* explains "lease loaded →
  workspace." Tests: post-flip focus/visual weight lands on the red-flags/clauses column (not the transition);
  reduced-motion collapses to instant.
- **43.4 — Clause/red-flag list-entrance stagger (only).** Stagger `ClausesList` (and any not-yet-staggered
  cards) via tokenized `stagger()`; **capped total**; **high-severity red flags first/instant**; severity
  text+icon present in every entrance frame (no color-only frame). Reduced-motion → instant. Tests: high-severity
  card visible immediately; total stagger within budget; reduced-motion collapses delay to 0.
- **43.5 — Card micro-interactions (only).** `whileHover`/`whileTap` on red-flag + clause rows; ≥44px targets
  preserved; **sober** on red-flag cards (no bounce/overshoot — tone invariant); a **visible, non-animated
  focus ring** at every site. Tests: touch-target size unchanged; reduced-motion disables scale; focus ring
  present and unaffected by hover/tap state.
- **43.6 — Scan-complete cascade (only).** A cascade tied to existing `use-scan-progress` state — **consume,
  don't duplicate** — framed as *informational sequencing*, not celebration (tone invariant). Tests:
  reduced-motion disables the cascade; **render-cost — the cascade does not re-render the full clause list /
  PDF viewer per progress tick** (Osmani); no celebratory affordance on a high-severity result.
- **43.7 — Motion + a11y + perf gate.** Easing/spring tuning via tokens; full reduced-motion sweep; **Playwright
  reduced-motion run green**; **runtime perf budget — CLS/INP (or frame-budget) on the flip + stagger** within
  budget (Grigorik); **bundle-delta ~0 vs the 43.1 baseline** (additive sprint — any growth is a regression to
  explain). Screenshots of each affected flow appended to `impl.md`.

## Variance (allowed to change without re-QA)

Easing/spring values, durations, the stagger interval and per-surface delays, exact `variants`/`transition`
shapes, token names, and *which* micro-interaction surfaces get hover/tap (the set is negotiable). The frozen
parts are the Locked decisions + Invariants below.

## Invariants / out of scope

- **Reduced-motion honored at every site** — global `MotionConfig` + per-site checks; the Playwright
  reduced-motion run is a gate (43.7).
- **FAB drawer stays mounted** — animate state, never gate mount on `AnimatePresence`.
- **Severity never color/motion-only**, including mid-animation; ≥44px targets preserved through hover/tap.
- **No playful/celebratory motion on legal-risk content** (red-flag hover/tap + scan-complete cascade).
- **High-severity red flags never withheld behind the stagger.**
- **Keep the CSS resize transition (Sprint 36.4 / 37.5)** — not migrated to Motion `layout` this sprint.
- **Provider tree order unchanged. No new dependency.** Existing `{ motion }` import pattern reused.
- **No `{ motion }`→`m` / `LazyMotion` bundle migration this sprint** — deferred (see below).
- No commits until the user says so.

## Risks

- **HIGH — FAB drafts/conversation lost.** A variant refactor or stray `AnimatePresence` unmounts the
  stays-mounted drawer and wipes `messages`/draft. *Mitigation:* animate state not mount (decision 3); the
  existing draft-survives-reopen + `ChatStreamContext` exposed-keys tests gate it (43.2).
- **HIGH — tone regression.** Celebratory/bouncy motion on legal-risk content (cascade, red-flag hover/tap)
  trivializes risk and reduces trust. *Mitigation:* tone invariant (decision 5) + sober sign-off on 43.5/43.6.
- **MED — global `MotionConfig` conflicts with the ~40 existing per-component reduced-motion branches.**
  *Mitigation:* 43.1 regression check that existing sites still behave; Playwright reduced-motion gate.
- **MED — runtime jank / CLS / INP** on the flip + stagger (measured only by bundle today). *Mitigation:*
  Grigorik perf budget at 43.7; duration ceiling on the flip; capped stagger.
- **MED — parser-first hierarchy hurt** if the stagger delays high-severity red flags. *Mitigation:*
  high-severity first/instant + bounded total (decision 6, 43.4).
- **LOW — bundle creep.** Additive sprint (no new dep, no new import pattern) → delta should be ~0; the 43.1
  baseline + 43.7 delta confirm it.

## Deferred work (recorded, not built — Ward Cunningham)

- **`{ motion }` → `m` + `LazyMotion` bundle migration** across the 17 heavyweight-import files, with the
  tree-shaking grep guard forbidding `import { motion }`. This is where the real initial-JS reduction lives;
  it's a behavior-preserving refactor that warrants its own sprint and its own before/after bundle numbers
  (the 43.1 baseline is the "before").

## Definition of Done

- Every sub-sprint maps back to a Goal/sub-sprint line above; no work-ahead.
- TDD red→green per sub-sprint; tests assert **user-observable behavior** (Dodds), not Motion prop presence.
- Gate sweep green per sub-sprint: `lint / typecheck / test` (+ `build` **only when no dev server is live** —
  build clobbers a live `dev`'s `.next`).
- 43.7: Playwright reduced-motion run green; CLS/INP (or frame-budget) within budget on flip + stagger;
  bundle-delta ~0 vs the 43.1 baseline.
- Live `npm run dev` check of each affected flow against the seeded sample lease; screenshots in `impl.md`.
- A per-sub-sprint QA note appended to `docs/_specs/sprint-43-motion-animations/impl.md` (what changed, tests
  added, verification results).

## Verification

Per sub-sprint: the gate sweep above + live `dev` check + screenshots. 43.7 adds the Playwright reduced-motion
run, the runtime perf budget, and the bundle-delta report vs the 43.1 baseline. QA notes accumulate in `impl.md`.
