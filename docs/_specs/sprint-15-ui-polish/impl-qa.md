# Sprint 15 — Implementation QA Walkthrough

**Status:** Template — operator ticks each AC during the manual walk after Phase 10 completes.
**Date drafted:** 2026-05-08.
**Implements:** [`spec.md`](spec.md) §4 acceptance criteria.

---

## How to use this template

After the implementation phases ship and `npm run test` / `typecheck` / `lint` / `build` are all green, walk every AC below in a real browser. Tick `[x]` and add a one-line note when each is satisfied. File a follow-up under "Gaps" for any AC that didn't fully land. Commit the completed walkthrough as `docs(s15): impl-qa walkthrough complete`.

Test environment:
- Run `npm run dev` (predev seeds the DB if empty)
- Open http://localhost:3000 in a Chromium-based browser
- Have DevTools open — Rendering panel for prefers-color-scheme + prefers-reduced-motion emulation

---

## Acceptance criteria

### AC #1 — Empty state typography + sparkle + staggered cards

- [ ] H1 "LeaseLens — NJ Tenant Law" renders in Source Serif 4
- [ ] H1 ≥ 36 px on desktop
- [ ] Four starter cards stagger in (60ms apart) on first paint
- [ ] Sparkle icon barely-pulses on a 4-second loop
- [ ] Hovering a card darkens its border and nudges the icon ~2px right
- [ ] Card click still fires `onSelectPrompt` with the right prompt string

**Notes:** _____

### AC #2 — Role tabs animated pill

- [ ] Click between Tenant / Reviewer / Admin
- [ ] Active-pill underlay slides between positions over ~150ms (spring)
- [ ] No flash, no overlap during the slide
- [ ] Inactive labels fade slightly during the swap
- [ ] Keyboard focus on a tab shows a visible accent ring
- [ ] `RoleSwitcher.test.tsx` passes (data-active + accessible name preserved)

**Notes:** _____

### AC #3 — Composer focus + send button spring

- [ ] Click the textarea → container border crossfades to accent over ~120ms
- [ ] Hover the send button → scales to 1.05 with a soft spring
- [ ] Send button drops back to 1.0 on release
- [ ] Click send → spring releases cleanly, no jank
- [ ] Disabled send (empty input) does not animate
- [ ] Screen reader announces "Shift plus Enter inserts a new line" when textarea focused

**Notes:** _____

### AC #4 — Streamed token fades

- [ ] Send a question that produces a multi-token answer
- [ ] Newly-arrived tokens fade in over ~50ms each as the response streams
- [ ] No typewriter/clack effect
- [ ] No flicker between fade-in and settled state
- [ ] After streaming finishes, content reads as plain text (no re-animation on subsequent renders)

**Notes:** _____

### AC #5 — ToolCard hairline + hover lift

- [ ] Hover any tool card → it lifts 2px over ~150ms (spring)
- [ ] Card has a hairline border, no drop-shadow halo
- [ ] Click expand → content height animates open over 220ms
- [ ] Status badges (Done / Running / Error / Undo) use semantic tokens (success / neutral / danger / warning)

**Notes:** _____

### AC #6 — Dropzone dragover refinement

- [ ] Drag a PDF over the left pane → border becomes solid accent (was dashed grey when idle)
- [ ] Inner copy swaps to "Drop to scan."
- [ ] Icon pulses once on dragover entry
- [ ] Drop and release → uploading state, spinner, "Parsing your lease…" text
- [ ] Error state still uses danger token (red-200 border, red-50 background)
- [ ] Success state still uses success token (emerald-200 border, emerald-50 background)

**Notes:** _____

### AC #7 — RedFlagReport slide-in + header pulse + semantic bars

- [ ] Run the standard scan on the seeded sample lease
- [ ] As gradings complete, items slide in from the right with an 8px offset (spring)
- [ ] "RED FLAGS" panel header pulses once (opacity 1→0.7→1) on each new item
- [ ] Severity bars use semantic tokens:
  - high → danger
  - medium → warning
  - low → info
  - ok → success
- [ ] Citation chip recolour-matches the severity it belongs to
- [ ] Lease swap (upload a different PDF) → existing items slide out before new ones appear

**Notes:** _____

### AC #8 — System-pref dark mode

- [ ] DevTools → Rendering → emulate `prefers-color-scheme: dark`
- [ ] Body background flips to neutral-950
- [ ] Body text reads in neutral-100/200 — no near-white glare
- [ ] Header, role tabs, composer, transcript, ToolCard, dropzone, RedFlagReport, cockpit panels all flip cleanly
- [ ] Accent (primary action button, sparkle icon, role-tab pill) stays roughly the same hue (slight desaturation acceptable)
- [ ] Body-text contrast clears WCAG AA on every chat-surface text size
- [ ] Focus rings remain visible in dark mode

**Notes:** _____

### AC #9 — Reduced motion

- [ ] DevTools → Rendering → emulate `prefers-reduced-motion: reduce`
- [ ] Land on `/` — sparkle icon does not pulse
- [ ] Starter cards do not stagger; they appear instantly
- [ ] Click between role tabs → pill swaps position instantly (no slide)
- [ ] Drag a PDF over the dropzone → icon does not pulse
- [ ] Run the standard scan → red-flag items appear instantly (no slide); header does not pulse
- [ ] Send a streaming message → tokens appear without fade
- [ ] Hover send button → no scale animation
- [ ] Hover ToolCard → no lift animation
- [ ] DOM inspector confirms plain `<div>`/`<li>`/`<button>` (no `motion.*` attributes) on every reduced surface

**Notes:** _____

### AC #10 — Test sweep

- [ ] `npm run test` → 507+ tests pass
- [ ] `npm run typecheck` → green
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → production build succeeds

**Notes:** _____

### AC #11 — Lighthouse a11y

- [ ] Lighthouse a11y score ≥ 95 on `/` in light mode
- [ ] Lighthouse a11y score ≥ 95 on `/` in dark mode
- [ ] No critical contrast violations

**Notes:** _____

---

## Gaps + follow-ups

Document any AC that didn't fully land, with proposed Sprint 16 fixes:

| # | What's missing | Proposed fix | Priority |
|---|---|---|---|
| _ | _ | _ | _ |

---

## Sprint 16 deferred items

Carried forward from this sprint and the original Sprint 15 backlog:

- Sample-lease "Use sample lease" CTA on empty-state (closes Sprint-13 AC #1/#2 gap)
- In-app "Run Tier 2 (one case)" button on cockpit eval-health panel, gated by spend ceiling
- Paste-text fallback when scanned-PDF upload returns `pdf_no_text_layer`
- Vercel deploy with env-var rename (`CONTENTOPS_*` → `LEASELENS_*` in dashboard)
- Validate AC #14–15 against deployed URL (not in this sprint)
- 90-second Loom recording embedded in README
- Optional GitHub Actions `eval.yml` workflow (Tier 1 on PR, Tier 2 on workflow_dispatch)
- Mobile-responsive layout work (three-pane shell stays desktop-optimised)
- Manual dark/light theme switcher (system-pref only this sprint)

---

**End of impl-qa template.**
