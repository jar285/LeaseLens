# Sprint 38 — Implementation Notes & QA Report

Premium LeaseLens Assistant concierge panel. Spec: [`spec.md`](spec.md). Method:
`development-philosophy.md` (Spec → QA-spec → Sprint → TDD → Code → QA). Builds on Sprint 37.

## 1. What was completed (by sub-sprint)

- **38.1 — Structure & state audit + guard tests.** Confirmed state ownership is already clean and
  needs no rebuild: open/close lifecycle in `AssistantFabContext`; messages in `ChatUI`; draft in
  `ChatComposer` (internal); selection in context; display state (`expanded`/`hasAskedQuestion`) local
  to `AssistantFab.client`. All persist across close→open (drawer stays mounted). Added a **send-button
  disabled-state guard** (empty → disabled, draft → enabled, locked → disabled) as a regression net
  before the reskin. (Escape-close, focus-return, draft-survives-close were already covered.)
- **38.2 — Premium panel layout (material + identity).** 24px radius (`rounded-[24px]`); translucent
  warm-parchment glass (`bg-surface-card/75` + `backdrop-blur-xl`) with a 1px inner top highlight
  (`before:` gradient line) + the warm `--shadow-popover`; divider-free (header + status transparent,
  one quiet footer separator kept). Branded header: `LeaseLensMark` + **"LeaseLens *Assistant*"** over
  **"NJ tenant-law guidance"**; circular icon close (+ expand). **Status pill** replaces "USING:" —
  hollow `○` + "No lease attached" + a dropzone hint (text, no control), or a filled `●` radar (scan-
  tone tinted) + "Lease attached: <file> · N clauses · <status>". Premium empty-state copy. Soft-fill
  chips (warm wash + hover lift). Circular send button. State-aware placeholders ("Ask a general
  question about NJ leases…" / "Ask about a clause, fee, deposit, or red flag…").
- **38.3 — Motion & FAB polish.** Open reads as expanding from the FAB: opacity 0→1, scale 0.96→1, a
  12px rise (`translate-y-3→0`), ~180ms on `ease-out-soft` (= the brief's `cubic-bezier(0.22,1,0.36,1)`);
  close reverses (hide, not destroy). FAB pill: warm coral **gradient** + inset top highlight + soft
  accent-tinted shadow + motion-safe hover lift + active press + focus ring. Reduced-motion disables
  all transforms/transitions.
- **38.4 — Accessibility & QA.** Live verification + WCAG contrast + the fixes below.

## 2. Files changed
- `src/components/chat/AssistantFab.client.tsx` — panel material, branded header, status pill, motion,
  FAB pill, placeholders, empty-state copy.
- `src/components/chat/ChatComposer.tsx` — circular send button.
- `src/components/chat/ChatUI.tsx` — soft-fill chips + hover lift.
- Tests: `ChatComposer.test.tsx` (send-disabled guard), `AssistantFab.client.test.tsx` (header
  identity, status pill, divider-free, motion 12px-rise, FAB polish), `AssistantFab.integration.test.tsx`
  (status copy), updates to superseded 36/37 assertions.
- Docs: `spec.md`, this `impl.md`, screenshots.
- (No `globals.css` change needed — reused `--shadow-popover` + `--ease-out-soft`; the 24px radius is an
  arbitrary value, the project's `--radius-*` scale caps at 16px.)

## 3. Tests added/updated
Added: send-disabled guard (×2); header subtitle/identity; status-pill "Lease attached:" framing;
divider-free context bar; motion 12px-rise (open + close); FAB gradient/lift/press. Updated: the
italic-emphasis word (`assistant`→`Assistant`); the `/using:/i`→`/no lease attached/ + /dropzone/`
copy; the empty-state subhead copy; the radar-dot framing (now leads the row).

## 4. Test status — **PASS**
- Chat suite: **205 passed**. Full suite earlier in the sprint: **1185 passed** (the 38.4 radius/hint/
  separator tweaks are CSS/text-only, re-confirmed green via chat suite + build).
- **lint ✓ · typecheck ✓ · test ✓ · build ✓.** (Build run only with no dev server live — `next build`
  clobbers a running `next dev`'s `.next`.)

## 5. How the design applies the power words
- **Steve Krug** — the status pill makes "is a lease attached?" obvious at a glance (`○`/`●` + text); the
  empty state says plainly what to do.
- **Wathan/Schoger** — 24px radius, inner-highlight depth, soft-fill chips, consistent spacing, divider
  reduction: the panel reads *designed*, not assembled.
- **Dieter Rams** — removed hard dividers + the debug "USING:" row; motion is calm (no bounce); glass is
  used with restraint behind a WCAG guardrail.
- **Apple HIG** — the 180ms expand-from-pill, the FAB hover-lift/press, and the full open/closed/expanded
  state set read as polished, predictable interaction.
- **Material Design** — every state is real & designed (closed/opening/open/closing, empty/draft/sending,
  no-lease/lease-attached); the send button visibly tracks its disabled state.
- **WCAG** — see §6.
- **React state-ownership** — display state stayed local; draft/conversation/selection survive close
  (the `AssistantFabContext` boundary held; no parser/chat-context pollution).
- **Kent C. Dodds** — tests assert user-visible behavior (the send button disables, the status reads
  "Lease attached: …", the header shows the role), not internal state names.

## 6. Accessibility checks completed
- **WCAG-AA contrast over the glass (the guardrail):** computed against the parchment-glass effective
  background (`rgb(241,233,213)` — the translucent panel composites *lighter* over the cream landing, so
  the glass does not reduce contrast): **body text 15.0:1, assistant-answer text (fg-default/85) 10.1:1,
  empty-state subhead (fg-muted) 6.6:1 — all ≥ AA.** Fixed the one new sub-AA item: the no-lease hint was
  `fg-subtle` (2.3:1) → bumped to `fg-muted` (6.6:1).
- Semantic `<button>`s with accessible labels (circular close "Close assistant", send "Send message",
  expand "Expand/Collapse assistant" + `aria-pressed`, FAB "Open assistant — …"); status dot is
  `aria-hidden` and always paired with text (never colour-only); focus rings retained; ≥44px touch on
  close/expand/FAB; reduced-motion disables stagger + transforms (unit-pinned `data-motion="off"` + CSS
  `motion-reduce:`/`motion-safe:` guards). Live: 24px radius, `backdrop-filter: blur(24px)`, hint color
  `rgb(92,79,58)` (fg-muted) confirmed; **0 console errors**.
- Screenshots: [`s38-no-lease-panel.png`](screenshots/s38-no-lease-panel.png),
  [`s38-lease-attached-panel.png`](screenshots/s38-lease-attached-panel.png).

## 7. Risks / follow-up
- **More-visible glass + dark mode:** dark contrast wasn't measured live (the dev seed boots light). The
  dark panel uses `bg-neutral-900/75` + the hairline border; body text is light-on-dark and the math is
  comparable, but a dark-mode contrast pass is worth a follow-up.
- **Backdrop-blur over the PDF (workspace mode):** verified light over the cream landing; the workspace
  panel can sit over the PDF viewer — body text still passed (parchment dominates at 75%), but worth a
  glance on a white-heavy PDF.
- **Pre-existing, out-of-scope:** the scan-intro card still shows a stale **"Editorial Assistant"** label
  (pre-pivot leftover from the ContentOp era) — not part of the FAB panel; flagged for a separate copy
  fix.
- The 24px radius is an arbitrary value (the `--radius-*` scale tops at 16px); consider adding a
  `--radius-4xl: 24px` token if this radius gets reused.

## 38.5 — Hover-transition fix (the lift snapped instead of easing)

User feedback: the FAB hover lift jumped to the top instantly. Root cause: the 38.3 transition lists
named **`transform`**, but Tailwind v4 animates the **`translate`** and **`scale`** CSS properties
separately (not `transform`) — so the named property never changed and the lift applied with no
transition (instant snap). Fix: the FAB transition is now
`transition-[translate,scale,box-shadow,background-color]` at **200ms** `ease-out-soft`, and the chips'
transition lists `translate` (was `transform`). Live-verified the FAB computes
`transition-property: translate, scale, box-shadow, background-color` · `0.2s` ·
`cubic-bezier(0.22,1,0.36,1)`, and the hover lift settles at `translate: 0px -2px` (now eased, not
snapped). +1 regression assertion on the 38.3 FAB test (transition must name `translate,scale`, not
`transform`). lint ✓ · chat suite 205 ✓.

## 38.6 — No-lease spacing (reclaim the dead void + tighten chips)

User feedback: the no-lease panel felt too spaced up top / the TRY ASKING block wanted to sit lower.
Measured cause: a ~53px **dead void** above the subhead came from the "Clear assistant chat" toolbar
reserving layout space when there's no thread (it was `invisible`, not removed) — which also clipped the
subhead by ~7px. Fix: toolbar uses `hidden` (not `invisible`) when `!showToolbar`, reclaiming the row;
TRY ASKING card tightened (eyebrow↔chips `gap-2→gap-1.5`, chip group `gap-2→gap-1.5`, `pt-3→pt-2.5`).
Live: toolbar `display:none`, status→subhead gap `53px → 0`, subhead `noClip` (74=74), card 163→155px.
No test pinned `invisible`; toolbar tests render with a thread (unaffected). lint ✓ · chat 205 ✓ · build ✓.
Screenshot: [`s38.6-spacing.png`](screenshots/s38.6-spacing.png). (Possible follow-up: the footer card +
composer are still opaque `surface-card` while the rest of the panel is glass — making them translucent
too would complete the glass consistency.)

## 38.7 — One-row quick actions + content-fit panel height

User feedback: the no-lease "Try asking" section took too much space. Cause (measured): the 3 chips
have long labels (~190px) that can't pair in the 370px row, so they stacked into 3 rows (~155px). Fix:
shortened the chip LABELS ("How it works" / "What it checks" / "After upload" — the full `prompt` sent
on click is unchanged) so they pack onto **one row**, and trimmed chip height `py-2→py-1.5`. The section
went **155px → 71px (1 row)**. That left the composer floating ~139px above the panel bottom (the
fixed-height panel no longer matched the now-compact content), so the compact-help height was retuned
**520 → 390px** to track the content (composer now ~9px from the bottom, subhead unclipped, chips 1 row).
Updated the compact-size test to `h-[min(390px,70vh)]` and the chip-scale assertion to `py-1.5`.

## 38.8 — Smoother expand + the hydration-warning fix

- **Expand resize** felt abrupt (same 180ms as the open, for a much bigger box change). Fix:
  **per-property transition durations** — open/close (opacity/scale/translate) stays 180ms, but the
  **resize (width/height) eases over 280ms** for a graceful, deliberate grow. Tailwind can't express
  per-property durations, so they're set inline (`DRAWER_RESIZE_TIMING`) while transition-property +
  easing stay in `DRAWER_MOTION`; `transition-none` still wins under reduced-motion. Live-verified
  computed `transition-duration: 0.18s,0.18s,0.18s,0.28s,0.28s` and width interpolates 620→…→820 (a
  real grow, not a snap). Note: dev-mode adds a React re-render beat before the CSS transition; it's
  smoother in a production build.
- **Console hydration warning** (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded` on `<body>`):
  these are injected by the **Grammarly browser extension** before React hydrates — not an app bug. Added
  `suppressHydrationWarning` to `<body>` in [`layout.tsx`](../../../src/app/layout.tsx) (the
  Next.js-recommended silencer; suppresses the body element's own attribute mismatch only, not children).

## 8. Parser-first alignment — confirmed
No in-chat upload control (text guidance only; the hero dropzone is the sole upload surface). The
assistant stays a secondary, opt-in support surface; no parser/upload code touched; the page is not
chat-first. The redesign is a skin + identity layer over the existing behavior (Martin Fowler:
behavior-preserving) — all persistence, modes, and a11y machinery intact.
