# Sprint 36 — Implementation Notes & QA Report

Context-sized FAB assistant. Spec: [`spec.md`](spec.md). Approved plan scope: **full three-mode**
(compact-help / workspace-drawer / expanded-reading), derived (not new context state).

## What shipped — all in [`AssistantFab.client.tsx`](../../../src/components/chat/AssistantFab.client.tsx)

The drawer was one fixed size (720px tall, heavy `border border-neutral-200` + `shadow-xl`) regardless
of context, so "Help" on the landing page opened the full workspace drawer over the upload CTA. Fix:

- **Local `expanded` state** (`useState`, not a context field — pure presentation; the drawer DOM +
  ChatUI instance persist, so resize never resets messages/draft/selection). Reset to `false` in the
  existing focus effect's `closed` branch so reopening starts at the natural per-context size.
- **Derived `displayMode`** (`'compact-help' | 'workspace-drawer' | 'expanded-reading'`): no lease →
  compact-help; lease + `expanded` → expanded-reading; else workspace-drawer. `AssistantFabState`
  untouched (the vestigial `'menu'` left as-is).
- **`SIZE_BY_MODE`** lookup applied to the drawer container + `data-display-mode` test hook:
  compact `w-[min(420px…)] h-[min(480px,70vh)]` · workspace `…560/620…×720` (**byte-for-byte today** →
  zero Mode-B regression) · expanded `…720/820…×900`. Shared `MOBILE_SAFE_SIZE`
  (`max-sm:w-[calc(100vw-2rem)] max-sm:h-[min(85vh,calc(100vh-7rem))]`) for phones.
- **Expand/Collapse header button** (lease-only, before the close button): `assistant-fab-expand`,
  `aria-label` expand/collapse, `aria-pressed`, reuses the close button's exact `h-11 w-11` + focus-ring
  recipe; `onClick` flips only local state. Icons `Maximize2`/`Minimize2`.
- **Visual lightening** (Refactoring UI / Rams): heavy `border border-neutral-200 …` + `shadow-xl` →
  `border border-border-hairline` + `shadow-lg` (hairline token auto-flips dark; the
  `shadow-hairline + shadow-lg` combo from the plan was a box-shadow conflict — corrected to a hairline
  *border* + soft shadow).
- Compact body unchanged: `emptyStateVariant="compact"` was already wired; the height shrink closes the
  "big empty body."

## Tests (TDD red → green) — `Sprint 36` block in `AssistantFab.client.test.tsx` + context guard

Red first (no `data-display-mode`, no size classes, no expand button, heavy border present), then green.

| Test | Pins |
|---|---|
| no lease → compact size | `data-display-mode="compact-help"` + `w-[min(420px…)]` + `h-[min(480px,70vh)]` |
| lease → workspace size | `"workspace-drawer"` + 560/620 × 720 (no-regression) |
| click expand → expanded | `"expanded-reading"` + 720/820 × 900 |
| expand preserves prefill | `data-prefill` unchanged across toggle; selection unchanged |
| no lease → no expand button | `queryByTestId('assistant-fab-expand')` null |
| expand button 44px + a11y | `h-11`/`w-11`, `aria-label` /expand\|collapse/, `aria-pressed` false→true |
| focus-return after expand | close → `activeElement === pill`; reopen → workspace size (expanded reset) |
| Escape after expand | `state==='closed'` + `aria-hidden="true"` |
| mobile safe class | `max-sm:w-[calc(100vw-2rem)]` + `max-sm:h-[min(85vh…)]` |
| lighter border | `border-border-hairline` + `shadow-lg`; no `border border-neutral-200`, no `shadow-xl` |
| **context guard** (`AssistantFabContext.test.tsx`) | context value exposes no `expanded`/`setExpanded`/`displayMode` |

Suite **1145 → 1156** (+11).

## Gates (final)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 289 files (two Biome line-wrap autofixes) |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS** — **1156 / 1156** |
| `npm run build` | **PASS** — compiled 6.0s |

## Live verify (Playwright, seeded sample lease)

| Scenario | Result |
|---|---|
| Lease attached → open | `workspace-drawer` **620×720** (today's size, unchanged) ✓; 1px hairline border + shadow |
| Type draft → click Expand | grows to `expanded-reading` **820×828**; **draft survived** ("My draft about the security deposit clause"); `aria-pressed=true`, label → "Collapse assistant" |
| Escape (from expanded) | closes (`state=closed`, `aria-hidden=true`); **focus returned to pill** |
| Reset → Landing (no lease) → "Help" | `compact-help` **420×480**; pill label "Help"; **no** expand button; **does not cover the upload dropzone** (`coversDropzone: false`) |
| Mobile 390px | safe sheet **358×717** (`100vw-2rem` × `min(85vh,…)`); drawer fully within viewport |
| Console | **0 errors** |

Screenshots: [`s36-1-compact-help-landing.png`](screenshots/s36-1-compact-help-landing.png) ·
[`s36-2-expanded-reading.png`](screenshots/s36-2-expanded-reading.png) ·
[`s36-3-mobile-safe-sheet.png`](screenshots/s36-3-mobile-safe-sheet.png).

## Spec alignment & drift

All approved-plan items DONE. One correction vs the plan: the lighter treatment is a hairline **border**
+ `shadow-lg` (not `shadow-hairline shadow-lg` — two `shadow-*` utilities share `box-shadow` and
conflict; the IDE/Biome flagged it). Same calm-support-layer outcome; tests assert the corrected recipe.

## Sprint 36.1 — expanded-mode header clipped (follow-up bug fix)

User report: once expanded, the drawer couldn't be collapsed — the only way out was closing via the
FAB pill. **Root cause:** expanded height was `h-[min(900px,92vh)]` but the drawer is anchored
`bottom-28` (112px up) with `overflow-hidden`, so its top = `viewportH − 112 − height`. At `92vh` that's
`0.08·H − 112` — **negative unless the viewport is taller than ~1400px**, so the header (Collapse +
Close) was pushed above the viewport on virtually every screen, with no scroll to reach it.

**Fix:** clamp expanded height to the space above the anchor + a top inset —
`h-[min(900px,calc(100vh-9rem))]` (9rem = the 7rem `bottom-28` anchor + 2rem top inset). Header now stays
~32px below the viewport top at any height; still uses the full 900px on tall screens. One-line size
change; test #3 updated to pin the new clamp (red→green); suite still **1156**.

**Live (Playwright, 1280×800 — a height that previously clipped):** expanded drawer `top: 32px`,
height 656; Collapse button at `y: 45`, `headerInView: true`, `expandButtonClickable: true`; clicking
Collapse returns to `workspace-drawer` (640px) with the drawer **still open** (not closed). 0 console
errors. Screenshot: [`s36.1-expanded-header-in-view.png`](screenshots/s36.1-expanded-header-in-view.png).

## Sprint 36.2 — drawer header typography (follow-up polish)

The header read like dev chrome: the title was `text-[13px] font-semibold` plain Geist Sans, and the
"USING:" line dumped filename + clause count + scan status as one flat, equal-weight run — ignoring the
brand type system (Source Serif 4 headings; Geist Mono technical identifiers) and visual hierarchy.

- **Title → editorial serif lockup:** "LeaseLens **assistant**" in Source Serif 4, 15px, tracking-tight,
  with "assistant" as the brand's one-italic-emphasis word. Matches the wordmark + verdict headline.
- **USING bar → identity/metadata hierarchy:** the `usingLabel` join was split into `usingParts`
  `{ filename, meta }`; the **filename renders in Geist Mono** (a technical identifier per MASTER.md) and
  the clause-count + scan-status drop to muted weight. Visible text is unchanged (textContent still
  `filename · N clauses · stage`) → the integration context-bar assertions stay green (16/16).

**Tests:** +3 in `AssistantFab.client.test.tsx` (`Sprint 36.2`): title is serif + bold + italic-"assistant"
(not `text-[13px]`); lease filename renders `.font-mono`; no-lease keeps "No lease attached" with no mono
token. Suite **1156 → 1159**. **Live:** computed title `Source Serif 4 / 15px / italic "assistant"`,
filename `Geist Mono`; 0 console errors. Screenshot:
[`s36.2-header-typography.png`](screenshots/s36.2-header-typography.png).

## Sprint 36.3 — USING-bar metadata (status dot + tabular count)

The metadata after the filename (`· 15 clauses · Scan complete`) was a flat, equal-weight run. Split
`usingParts` into `{ filename, clauseLabel, status, statusTone }` and:
- clause count → **`tabular-nums`** (a designed metric).
- scan status → a small **status dot** reusing the masthead "● LIVE" vocabulary (`bg-success-600`
  complete / `bg-accent-500` scanning / neutral ready), `aria-hidden` and always paired with the status
  word (colour never the only signal). Visible text unchanged → integration context-bar tests stay green.
- **+2 tests** (`Sprint 36.3`); **live:** dot computed `rgb(31,139,76)` = `success-600`, count
  `font-variant-numeric: tabular-nums`.

## Sprint 36.4 — drawer open / close / resize motion (fade + scale)

The drawer toggled via `hidden` (display:none) → it *popped* in/out instantly. Replaced the toggle with
a class-driven CSS transition (the drawer already stays mounted, so both directions animate):
- `DRAWER_MOTION` = `origin-bottom-right transition-[opacity,scale,width,height] duration-200 ease-out
  starting:opacity-0 starting:scale-95 motion-reduce:transition-none`.
- open = `scale-100 opacity-100`; closed = `pointer-events-none scale-95 opacity-0` (no more `hidden`).
- `starting:` eases the first open (the drawer mounts straight into the open state); the
  `width/height` in the transition makes the **expand/collapse resize** morph; scales from the pill
  corner. Same calm feel as the Replace modal (28.15); reduced-motion disables it. A11y
  (`aria-hidden`/`inert`/focus-return) unchanged — the close test still asserts `aria-hidden` + mounted.
- **+2 tests** (`Sprint 36.4`). **Live (Playwright frame-sampling):** open opacity `0→0.27→0.58→0.96`;
  close `1.0→0.41→0.10→0.0`; expand width `620→735→799→820` — all over ~200ms, none instant.

Suite **1156 → 1163** (+7 across 36.2/36.3/36.4). Gates green; 0 console errors. Screenshots:
[`s36.2-header-typography.png`](screenshots/s36.2-header-typography.png) ·
[`s36.3-using-status-dot.png`](screenshots/s36.3-using-status-dot.png).

## Sprint 36.5 — radar status dot + drop the post-"clauses" separator

User refinement on the USING bar: remove the `·` separator after "clauses", and make the green status
dot an **animated radar** like the masthead LIVE indicator.
- Dropped the ` · ` separator span between the count and the status; the status now sits on its own,
  set apart by `ml-2` spacing (the ` · ` before "15 clauses" — filename↔count — stays).
- Status dot → the **two-layer `motion-safe:animate-ping` radar** copied from the nav LIVE indicator
  (`page.tsx:231-233`): an absolute ripple layer + a solid layer, both tinted by `STATUS_DOT[tone]`.
  Still `aria-hidden` + paired with the status word (colour + motion are reinforcement, not the only
  signal); reduced-motion users get just the static dot.
- Test updated (`Sprint 36.3`) to pin the radar structure (`motion-safe:animate-ping` + `bg-success-600`)
  and assert the post-clauses separator is gone (`not.toContain('clauses · Scan')`). Suite **1163**.
- **Live:** dot has 2 layers, ripple computed `animation-name: ping`, `rgb(31,139,76)` = success-600;
  bar text `…pdf · 15 clauses  Scan complete` (no middle dot after clauses). 0 console errors.
  Screenshot: [`s36.5-radar-status-dot.png`](screenshots/s36.5-radar-status-dot.png).

## Sprint 36.6 — unified footer card (chips + composer) + compact-help height fix

User feedback on the landing FAB: the suggestion chips sat **too close** to the composer once the
compact chat opened. Root cause (read from code, not the screenshot): the footer was two
**separately-bordered** bands — the chip row (`border-t … gap-1.5 pt-3 pb-2`, chips `py-1.5` ≈ 28px) and
the composer (its own `border-t … pt-3.5`). Net: chips ~8px above a hairline, then another hairline,
then the input — a cramped double-divider sandwich, and in the narrow 420px panel the three wide chips
wrap to their own lines so the whole cluster bunched together. Refactoring UI (spacing isn't doing
enough grouping work) + Dieter Rams (a redundant second divider line is noise) + WCAG (28px < the 44px
tap-target baseline). **Decision locked at the gate: "Unified footer card."**

- **One enclosure, one divider.** The chip row now carries a `Try asking` eyebrow (same 10px uppercase
  `tracking-wider text-fg-subtle` register as the context bar's "Using:") and owns the single
  `border-t`. The composer gets a new `grouped` prop ([ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx))
  that drops its own `border-t` + softens its top padding (`pt-3.5`→`pt-2`) and reflects `data-grouped`.
  ChatUI passes `grouped={showSuggestions}` so chips + input read as one calm footer block.
- **Comfier chips:** `gap-1.5`→`gap-2`, `py-1.5`→`py-2.5` (≈ 38px tap target, live-measured).
- **Compact-help height 480→580 (70vh→80vh).** The taller footer card (eyebrow + 3 stacked chips ≈
  175px) starved the 480px panel's transcript to ~32px and **clipped the "LeaseLens Assistant"
  empty-state hero** (a latent issue pre-36.6 — the shorter footer left only ~87px; 36.6 made it
  obvious). 580px restores the hero in full above the footer; still clearly < the 720px workspace.
- **TDD:** +2 `ChatComposer` (ungrouped keeps `border-t`; grouped drops it + sets `data-grouped`),
  +2 `AssistantFab.integration` (no-lease → `Try asking` eyebrow + composer grouped + chip `py-2.5`;
  active thread → no eyebrow + composer not grouped). Updated the 36-base compact-size assertion to
  `h-[min(580px,80vh)]`. Suite **1163 → 1167** (+4).
- **Live (Playwright, no-lease compact panel):** `data-display-mode="compact-help"`, drawer 580px tall,
  transcript scroll region 132px with hero `scrollHeight 132 ≤ clientHeight 132` (**no clip**); footer
  card `border-top 1px`, composer `border-top 0px` + `data-grouped="true"`; chips 38px, 25px gap to the
  input. Header/close reachable (drawer top 108px). 0 console errors.
  Screenshot: [`s36.6-unified-footer-card.png`](screenshots/s36.6-unified-footer-card.png).

## Carries / out of scope (not regressions)
- **Pre-existing 16px horizontal overflow on the Mode-A landing page at ~390px** comes from
  `parser-landing-editorial-frame` (the decorative frame, `inset-x-4`), **not** the FAB drawer
  (verified `drawerWithinViewport: true`). Worth a separate landing-shell responsive fix.
- Animated resize deferred (instant is fine). `'menu'` state still vestigial.

## How to re-verify locally
```bash
npm test src/components/chat/AssistantFab.client.test.tsx src/components/chat/AssistantFabContext.test.tsx
npm run lint && npm run typecheck && npm run build
# Live: npm run dev → Landing "Help" = compact (~420×480, doesn't cover upload);
#   lease → "Ask about lease" = workspace (620×720); header Expand → ~820×900, draft survives;
#   Escape closes + focus returns to pill; 390px → safe sheet.
```
