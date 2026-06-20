# Sprint 52 — Assistant chat drawer readability (mobile sheet → web)

> Branch: `feature/pdf-highlight` · commits `feat(s52.x): …`
> Methodology: spec → spec-QA → TDD slices → gate sweep → Playwright visual pass (mobile + web).
> Shape brief: confirmed by user 2026-06-17 (impeccable `shape`, register = product).

## Problem

When an assistant answer renders in the FAB drawer it is harder to read than it should be, and the user
asked: "what is the best way we can make our chat more visible and easy to read when the chat comes up with
an answer, should we give it more space?" Diagnosis (sequential-thinking, screenshot review):

1. **Chrome stacks above the answer.** Three padded strips sit between the top of the drawer and the first
   line of an answer: the brand header (`<header>` in `AssistantFab.client.tsx`, ~62px), the context bar
   (`assistant-context-bar`, status row + optional focus row, ~36–56px), and ChatUI's `conversation-toolbar`
   carrying "Clear assistant chat" (~32px, appears once a thread exists). In `workspace-drawer` (720px) that's
   ~130px of chrome; on a mobile sheet (~85vh) it is a quarter of the panel before any words.
2. **Mobile is a floating card, not a sheet.** `MOBILE_SAFE_SIZE` keeps the drawer anchored `bottom-28
   right-6` as a `calc(100vw-2rem)` rounded card — it never becomes the full-width, bottom-flush, top-rounded
   bottom sheet that mobile chat UIs (and the platform muscle memory) expect. There is no half→full snap, so a
   long answer either crams into a card or there is nowhere to grow.
3. **Reading measure runs wide on web.** The transcript column is `max-w-3xl` (768px); at 14.5px body text in
   `expanded-reading` (820px drawer) the line length exceeds the comfortable 65–75ch.

Per-line typography is **already good** and out of scope: `ChatMessage` body is `text-[14.5px] leading-[1.7]`
(`ChatMessage.tsx:178`). The fix is **space + structure**, not type size.

## Goal

Make a rendered answer the load-bearing thing in the drawer: less chrome above it, a real mobile bottom sheet
that can snap from half to full, and a capped reading measure on wide web. Mobile-first; web inherits the same
trims. Quieter and more dimensional, not flashier (Dieter Rams) — reuse the shipped warm-glass surface, motion
gates, and tokens.

## Hard invariants (every slice)

1. **Lazy-mount-stays-mounted.** The drawer DOM + the single `ChatUI` instance persist across close→open and
   across every snap/resize; typed drafts and the conversation survive. No slice may remount `ChatUI` or move
   it across a conditional boundary.
2. **"Clear assistant chat" stays chat-only.** It must keep calling the existing handler (`handleNewConversation`
   → abort + stash + `fab.clearPendingContext()` + clear messages) and must NOT touch lease/clauses/red flags.
   The `new-conversation-announcer` ("Assistant chat cleared. Your lease review was preserved.") and the undo
   toast/stash flow are preserved verbatim, including the `aria-describedby` helper text.
3. **`prefers-reduced-motion` honored at every animation site** (snap, resize, sheet rise) — instant, no
   transform, mirroring the existing `motion-reduce:transition-none` on the drawer.
4. **≥44px touch targets** on every new control (snap handle, overflow trigger, menu items). WCAG-AA contrast
   on all new text/icons; existing AA pins (status text-pairing, `fg-muted` over the parchment glass) hold.
5. **Half-snap keeps the workspace visible.** The mobile sheet opens at the half snap so the parser surface
   shows behind it — chat is assistant-second; full-screen-by-default is a non-goal.
6. **AssistantFabContext boundary unchanged.** Snap state reuses the existing local `expanded` flag; do NOT add
   parser/chat fields to any context. No new context fields.
7. No silently-broken tests: pinned assertions are updated deliberately in the red→green cycle.

## Power-words

| Slice | Power-words |
|---|---|
| 52.1 Slim header + context fold | Dieter Rams, Steve Krug, Jakob Nielsen, WCAG |
| 52.2 Overflow menu for thread controls | Don Norman (group control with its object; progressive disclosure), Apple HIG, Material, Jakob Nielsen, WCAG |
| 52.3 Mobile bottom sheet (half → full snap) | Apple HIG (sheets), Material (sheet states), Don Norman, WCAG |
| 52.4 Reading measure + desktop headroom | Typographic measure 65–75ch (Butterick / Wathan-Schoger), Dieter Rams |

## Slices (TDD, ordered mobile-first)

### S52.1 — Slim header + context fold (`AssistantFab.client.tsx`)
**Goal:** collapse the two stacked chrome blocks (brand `<header>` + `assistant-context-bar`) into one tighter
zone so an answer starts higher. One brand line; the lease status + clause count + scan stage read as a single
slim metadata line; the "Focused on" row stays but compact. Reclaim vertical padding.

- Keep the LeaseLens mark + "LeaseLens *Assistant*" heading (the `headingId` aria target) and the window
  controls (expand/close). Tighten the header's vertical padding; the "NJ tenant-law guidance" subline is
  retained but may fold onto the status line's role (decide in impl — the goal is one identity line, not two).
- The status row keeps the dot **paired with a status word** (never colour-only) and the mono filename; trim
  to a single line (the metadata is already one line — remove the block's extra `py` and the separate subhead
  for the no-lease hint by making it inline/quieter).
- The "Focused on" detach row stays functional (detach × keeps its 44px target) but compact.
- Preserve testids: `assistant-context-bar`, `assistant-using-status-dot`, `assistant-context-bar-focus`,
  `assistant-context-bar-detach`. Preserve the "No lease attached" / "Lease attached:" text and the mono
  filename. textContent-based pins continue to pass.

**Red tests (`AssistantFab.client.test.tsx`):** assert one heading in the drawer header; status dot still
paired with a status word; the chrome above the transcript is a single context block (assert the slimmed
structure via testids, not pixel counts). Update the stale Sprint 36.2/38.2 layout comments.

### S52.2 — Overflow menu for chat-thread controls (`ChatUI.tsx`)
**Goal:** remove the always-present `conversation-toolbar` strip; move "Clear assistant chat" and "Continue
previous" into a compact overflow (⋮) menu anchored top-right of the chat region (Don Norman: the control
lives with the object it acts on — the thread — not in the window chrome). Reclaims the ~32px strip.

- New `data-testid="assistant-thread-menu-trigger"` icon button (`aria-haspopup="menu"`, `aria-expanded`,
  ≥44px target, focus ring). Opens a `role="menu"` popover containing the existing **Clear assistant chat**
  (`new-conversation-btn`, handler + `aria-describedby` helper preserved) and, when a stash exists, **Continue
  previous** (`continue-previous-btn`, handler preserved). Menu closes on Escape, outside pointerdown, and item
  activation; focus moves to the first item on open and returns to the trigger on close.
- The trigger is shown only when `showToolbar` (thread or stash exists) — same gate as today, so the empty
  popover stays clean. The `new-conversation-announcer` + undo toast/stash wiring are untouched.
- The visible helper text ("Your lease, clauses, and red flags will stay here.") moves into the menu (or stays
  as the `aria-describedby` source) so the reassurance survives; keep `clear-assistant-chat-helper` testid.

**Red tests (`ChatUI.test.tsx`):** trigger opens the menu; menu has `role="menu"`; Clear item still calls the
new-conversation flow (announcer populated, messages cleared, parser untouched — the existing assertions move
behind a trigger-open step); Escape/outside-click close; Continue-previous appears only with a stash. Grep e2e
(`fab-assistant.spec.ts`, `red-flag-interactions.spec.ts`) for `new-conversation-btn`/`continue-previous-btn`
and add the open-menu step if referenced.

### S52.3 — Mobile bottom sheet, half → full snap (`AssistantFab.client.tsx`)
**Goal:** on `max-sm` the drawer becomes a true bottom sheet — full-width, bottom-flush, top-corners rounded —
that opens at a **half** snap (workspace visible behind) and snaps to **full** via a tap handle. Built by
extending the existing `displayMode`/size system and reusing the local `expanded` flag (no Vaul, no free-drag,
no new dependency, no new context field).

- Replace `MOBILE_SAFE_SIZE` with a `MOBILE_SHEET_SIZE` override: `max-sm:inset-x-0 max-sm:bottom-0
  max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:origin-bottom` plus a height driven by
  the snap state — **half** (`expanded === false`, e.g. `max-sm:h-[58vh]`) → **full** (`expanded === true`,
  e.g. `max-sm:h-[92vh]`, header stays in view). The desktop anchor (`right-6 bottom-28`) and the four desktop
  `SIZE_BY_MODE` widths/heights are untouched — `max-sm:` overrides win only on phones.
- Open/close on mobile rises from below: override the closed transform to `max-sm:translate-y-full`
  (slide-up) while desktop keeps `translate-y-3 scale-95`. Resize between snaps reuses `DRAWER_MOTION` +
  `DRAWER_RESIZE_TIMING`; `motion-reduce:transition-none` still nulls it.
- Add a **snap handle**: a top grab-bar button (`data-testid="assistant-fab-snap-handle"`,
  `aria-label="Expand chat"` / `"Collapse chat"`, `aria-expanded={expanded}`, ≥44px hit area) that toggles
  `expanded` (half↔full). On mobile the handle is always interactive (it does not depend on `canExpand`, so a
  pre-upload help sheet can still expand to read). On desktop the handle is visually a decorative grip / hidden
  — the existing desktop expand button keeps its `canExpand` gate; do not regress it.
- `expanded` already resets on close, so a reopened sheet starts at the half snap. Toggling the snap must NOT
  remount `ChatUI` (invariant 1).

**Red tests (`AssistantFab.client.test.tsx`):** drawer className contains the sheet overrides
(`max-sm:bottom-0`, `max-sm:w-full`, `max-sm:rounded-b-none`, `max-sm:origin-bottom`); the snap handle exists,
toggles `expanded` (assert via the mobile height override class flipping half↔full), and carries the right
aria; reduced-motion path keeps `motion-reduce:transition-none`; toggling the handle preserves a typed draft
(mount-survival). Playwright drives a 390px viewport for the real visual.

### S52.4 — Reading measure cap + desktop headroom (`ChatTranscript.tsx`, `AssistantFab.client.tsx`)
**Goal:** cap the line length on wide web and give the default desktop drawer a touch more height so an answer
has room without forcing expand.

- `ChatTranscript` transcript column `max-w-3xl` (768px) → a measure-tuned cap (`max-w-2xl` / a `max-w-[680px]`
  token) so the 14.5px body lands at ~66–70ch. Applies to all chat mounts (the landing hero chat benefits too
  — better measure is universally correct); note this in impl.
- `SIZE_BY_MODE['workspace-drawer']` height bumped a notch (e.g. `h-[min(720px,80vh)]` → `h-[min(760px,82vh)]`);
  `expanded-reading` is unchanged (already the reading mode). Widths unchanged.

**Red tests:** `ChatTranscript.test.tsx` asserts the tightened measure class on the transcript column;
`AssistantFab.client.test.tsx` asserts the bumped `workspace-drawer` height substring.

## Out of scope / non-goals

- Per-line typography (size/leading) — already good.
- Vaul or any drag/gesture library — explicitly rejected (extend the custom drawer).
- New context fields — snap reuses local `expanded`.
- Free-drag snapping — snap is tap/expand only.
- Full-screen-by-default mobile — half snap is the default (chat is assistant-second).
- Dark-mode FAB-label strict-AA shade (carried over from Sprint 51 follow-ups).

## Definition of Done

TDD per slice; `npm run lint && npm run typecheck && npm test && npm run build` all green; new behaviours
tested; `impl.md` QA note; `history.md` + README sprint row updated; Playwright visual pass against the seeded
sample lease at **390px (mobile sheet, half + full)** and **desktop**, screenshots saved in
`docs/_specs/sprint-52-assistant-readability/screenshots/`.
