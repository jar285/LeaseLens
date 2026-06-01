# LeaseLens UI/UX Modernization — Sprint Roadmap

> **STATUS: CLOSED ROADMAP (2026-05-29).** This roadmap covers Sprints 16A–19. Sprints 16A–18 shipped; Sprint 19 (paste-text fallback) was deferred. The project has since executed Sprints 23, 26–33, including the parser-first pivot (Sprint 26 → `WorkspaceRouterShell` + `AssistantFab`) and the FAB chat refactor (Sprint 29). For the current forward-looking direction, read [`docs/_specs/sprint-29-fab-refactor/spec.md`](_specs/sprint-29-fab-refactor/spec.md) and the in-progress sprint folder. **The sections below are historical record of the Sprint 16–19 plan, kept for traceability — they are not the current roadmap.**

**Status:** Sprint 16A documentation, ready for Sprint 16B kickoff.
**Cross-references:** [`design-system/MASTER.md`](../design-system/MASTER.md), [`design-system/pages/*`](../design-system/pages/), [`docs/ui-ux-audit.md`](ui-ux-audit.md).

This file is the roadmap. It documents what each sprint changes, what each sprint deliberately leaves alone, how to verify each sprint, and the risks + rollback strategy for each.

---

## 1. Why `/` remains the full product experience

The brief explicitly rejects splitting LeaseLens into a separate marketing landing page and a `/app` workspace. The decision is structural, not stylistic:

1. **Tenants find LeaseLens under time pressure.** A renter who has a 24-hour window to review a lease doesn't want a marketing funnel — they want the product, now.
2. **The product IS the demo.** A landing page that promises lease review and then makes the user click "Get started" to reach the actual tool is friction, not polish.
3. **Hiring reviewers (the other audience) benefit from immediacy.** A reviewer landing cold from a portfolio link should see what the product does in five seconds, not "Try it free" CTAs.
4. **Trust comes from competence, not marketing.** A working tool that explains itself reads as more trustworthy than a polished landing that hides the tool.

The fix is to make `/` itself a landing-AND-workspace hybrid — the welcome state on `/` does the job of a marketing hero, then dissolves the instant the user takes their first action.

---

## 2. Why five sprints (and not three or one)

Each sprint has a single responsibility:

- **16A** — design-system documentation. No runtime code changes. Zero regression risk. The foundation everything else builds on.
- **16B** — shared UI primitives (layout + state). No-redesign refactor; the UI looks the same after. Eliminates copy-pasted scaffolding.
- **17** — modernize `/` itself: welcome state polish, upload-area copy, red-flags empty state, visible disclaimer. Visible improvement, no behaviour change.
- **18** — workspace polish: scan progress, ToolCard tenant-friendly render, mobile layout, citation-card pulse. Visible improvement, no behaviour change.
- **19** — paste-text fallback for scanned PDFs. New ingestion path; new endpoint; new tests. Behaviour change.

The separation is intentional. Mixing visual polish with a new ingestion path (Sprint 19) makes review harder and increases regression risk. Mixing token primitives extraction (16B) with new components (17, 18) makes it hard to roll back a misbehaving primitive without losing the polish work.

Each sprint is independently shippable and testable. If 17 looks great but 18's mobile layout has issues, 17 ships first and 18 iterates.

---

## 3. Sprint 16A — Design System Documentation

### Scope

Create the following seven files. **No runtime code changes.**

- `design-system/MASTER.md` — global source of truth
- `design-system/pages/homepage-workspace.md` — `/` page override
- `design-system/pages/app-chat-workspace.md` — chat surface override
- `design-system/pages/pdf-upload-viewer.md` — left pane override
- `design-system/pages/red-flags-panel.md` — right pane override
- `docs/ui-ux-audit.md` — current-state audit
- `docs/ui-ux-modernization-plan.md` — this file

### Verification

| Check | How |
|---|---|
| Seven files exist | `ls design-system/ design-system/pages/ docs/` |
| Docs say `/` stays | Grep `"/app"` returns no migration recommendations |
| Tokens consistent with `globals.css` | Diff the `@theme` block against `MASTER.md` §2 + §5 |
| No runtime changes | `git diff src/` returns empty; tests still 507/507 |

### Risk + rollback

Near-zero risk. Worst case the docs are inaccurate and a contributor reads stale info — fix by updating the doc.

Rollback: `git revert <commit>` of the Sprint 16A commit. No code regression.

---

## 4. Sprint 16B — Shared UI Primitives

> **Status: shipped.** Six primitives + 34 new tests + 2 consumer refactors. 541/541 vitest pass, lint 0, typecheck green. See §4.6 for what was actually delivered vs originally scoped.

### Scope

Extract three layout primitives and three state primitives from inline patterns currently duplicated across the codebase. **The UI looks the same after this sprint.**

#### Layout primitives — `src/components/layout/`

- `PageShell.tsx` — top-level vertical flex `flex flex-col h-dvh overflow-hidden bg-surface-base font-sans text-fg-default` with named slots: `<PageShell.Header>`, `<PageShell.Main>`, optional `<PageShell.Footer>`. Replaces the inline `<main className="flex h-dvh flex-col overflow-hidden bg-surface-base ...">` pattern in `app/page.tsx` and the equivalent in `app/cockpit/layout.tsx`.
- `Container.tsx` — `<div className="mx-auto max-w-6xl px-6">`. Used by cockpit's main content block (`max-w-6xl px-6 py-8`).
- `Stack.tsx` — `<div className="flex flex-col gap-{token}">`, prop `gap` in `1.5 | 2 | 3 | 4 | 6 | 8`. Replaces the inline `flex flex-col gap-3` patterns in RedFlagReport empty state, dropzone column, and several panels.

#### State primitives — `src/components/states/`

- `EmptyState.tsx` — composable. Slot pattern: `<EmptyState icon={...} title="..." description="..." actions={...}>`. Used by:
  - `ChatEmptyState` (refactor to compose `EmptyState` underneath; preserve serif H1 + cards as children)
  - `RedFlagReport` empty state
  - Future: dropzone idle could swap to `EmptyState` (decide in Sprint 17)
- `LoadingState.tsx` — composable skeleton. Used by:
  - ToolCard pending body (currently three inline `animate-pulse` bars)
  - Sprint 18 will use it for the scanning red-flag skeleton cards
  - Future: chat transcript skeleton between turns if needed
- `ErrorState.tsx` — composable. Slots: `icon`, `title`, `description`, `actions`. Used by:
  - LeaseUploadDropzone error state (refactor)
  - Sprint 19 paste-text fallback error
  - Future: chat-route 5xx errors surface as ErrorState in transcript

### Rules

- ❌ Do NOT redesign any screen during 16B
- ❌ Do NOT change routes
- ❌ Do NOT change product behaviour
- ❌ Do NOT introduce new dependencies
- ❌ Do NOT replace components that don't share the extracted pattern
- ✅ DO add unit tests for the new primitives
- ✅ DO update existing component tests if a refactored child needs assertion updates
- ✅ DO match existing visual output pixel-for-pixel after the refactor

### Verification

| Check | How |
|---|---|
| Six new files exist | `ls src/components/layout/ src/components/states/` |
| Primitives have tests | Each component has a `*.test.tsx` covering the slot composition |
| No visual regression | Screenshot diff `/` and `/cockpit` before vs after — should be identical |
| Tests pass | `npm run test` ≥ 507/507 (with new primitive tests pushing count higher) |
| Lint, typecheck | `npm run lint` 0 errors; `npm run typecheck` green |

### Risk + rollback

Moderate risk. The refactor touches `app/page.tsx`, `app/cockpit/layout.tsx`, `ChatEmptyState.tsx`, `LeaseUploadDropzone.tsx`, `RedFlagReport.tsx`, `ToolCard.tsx`. If a primitive's slot API is wrong, the refactored components break in subtle ways (e.g. focus rings missing on a child slot).

Mitigation:

- Each primitive lands in its own commit BEFORE the consumer is refactored.
- Each consumer refactor is a separate commit so it can be reverted independently.
- Visual smoke test (manual browser walk) at every commit.

Rollback: `git revert` the specific consumer-refactor commit while keeping the primitive in place.

### 4.6 What actually shipped vs originally scoped

**All six primitives + tests landed as planned:**

- [`src/components/states/EmptyState.tsx`](../src/components/states/EmptyState.tsx) — slot-based (icon · title · description · actions); `align` prop for centered vs top layout; 5 tests
- [`src/components/states/LoadingState.tsx`](../src/components/states/LoadingState.tsx) — bars array OR custom children; `ariaLabel` required for screen-reader announcement; biome-ignore comment on the `key={index}` (decorative skeletons never reorder); 6 tests
- [`src/components/states/ErrorState.tsx`](../src/components/states/ErrorState.tsx) — `centered` vs `inline` variant; `role="alert"` default for immediate screen-reader announcement; 7 tests
- [`src/components/layout/PageShell.tsx`](../src/components/layout/PageShell.tsx) — `fixed` (h-dvh, overflow-hidden) vs `page` (min-h-screen) layout prop; outer `<main>` with token-driven background/text/font; 6 tests
- [`src/components/layout/Container.tsx`](../src/components/layout/Container.tsx) — `sm | md | lg | xl | 2xl` sizes mapping to max-w-3xl through max-w-7xl; `as` prop for semantic element choice; 5 tests
- [`src/components/layout/Stack.tsx`](../src/components/layout/Stack.tsx) — vertical flex with `gap` prop (0 through 8); `as` prop for `<ul>`/`<ol>`/`<section>`/etc.; 5 tests

**Consumer refactors:**

| Consumer | Status | Notes |
|---|---|---|
| `ToolCard` pending body | ✅ Refactored to `<LoadingState>` | Drops 3 inline `animate-pulse` bars + sr-only label; primitive supplies all of them. 10/10 tests still pass. |
| `RedFlagReport` empty state | ✅ Refactored to `<EmptyState align="top">` | Paperclip icon + microcopy preserved; uses the primitive's wrapper. 10/10 tests still pass. |
| `LeaseUploadDropzone` error state | 🟡 **Deferred** | The dropzone's `<section>` is a single surface that reshapes per `data-status` (idle / dragover / uploading / error / success); each status shares the section's drag handlers, ARIA label, and icon container. Pulling just the error branch out means duplicating the section scaffolding AND adding an `<ErrorState>` wrapper — net more code, no clarity gain. The primitive's first real consumer will be Sprint 19's paste-text ingestion errors (separable surface). |
| `<ChatEmptyState>` body | 🟡 **Not in 16B scope** | Sprint 17 owns the welcome-state redesign. Refactoring to `<EmptyState>` lands then. |
| `<PageShell>` / `<Container>` consumers | 🟡 **Not in 16B scope** | Plan §13 marked these as "optional" if the slot pattern proves clean. They are available and tested; consumer refactors land when Sprint 17 needs them. |

**Why some deferrals are right:** the plan's principle "Replace repeated UI patterns only when safe" means refactoring should reduce code AND clarify intent. The dropzone error refactor would do neither — the state machine itself is the design. ChatEmptyState's serif H1 + 4 motion-staggered cards are surface-specific and benefit more from the Sprint 17 redesign than a mechanical primitive swap.

The primitives are **ready** when the right consumer appears.

---

## 5. Sprint 17 — Homepage Workspace Modernization

> **Status: shipped.** Welcome-state How-it-works strip + disclaimer trust block, red-flags empty-state examples, dropzone privacy/legal microcopy, composer `inputMode="text"` + autocapitalize/spellcheck, responsive grid (single-column below `lg`, three-pane at `lg`+). 550/550 tests pass, 0 lint, typecheck green. See §5.8 for what was actually delivered vs originally scoped.

### Scope

Modernize the existing `/` page so it feels like a premium landing-page/workspace hybrid. **`/` stays as the full LeaseLens experience.** No route migration.

#### 5.1 Header polish

- Verify role-tab touch targets meet 44×44px on mobile (Currently h-7 = 28px — needs investigation)
- Audit theme-toggle button positioning at narrow widths
- Confirm focus rings visible in both schemes on every header element

#### 5.2 Left pane (upload area)

- Add disclaimer subline: "Informational analysis, not legal advice." — `text-[10px] text-fg-subtle`
- Add privacy reassurance line: "Your lease text stays in this session." — same treatment
- Tighten subtext copy on the idle state — current "We'll scan it against NJ tenant law and surface red flags in seconds." is fine but could read as "We'll scan it against NJ tenant-law sources and surface red flags in seconds." (the tool surfaces red flags FROM sources, not random pattern-matches)

#### 5.3 Centre pane welcome state polish

- Add "How it works" strip below the starter cards. Treatment: four steps in a row with subtle separators, `text-xs text-fg-subtle`. Steps: **Upload lease → Scan clauses → Review red flags → Ask follow-ups**.
- Add disclaimer line below the how-it-works strip. Verbatim from `LEASELENS_DISCLAIMER` or a short variant referring back to it.
- Optional: add a "Use sample lease" affordance (link or button) — closes the AC #1/#2 gap from Sprint 13's impl-qa backlog.

#### 5.4 Composer

- Add `inputMode="text"` on the textarea for explicit mobile keyboard.
- Verify reduced-motion behaviour on send-button spring (already shipped Sprint 15.4, sanity-check).

#### 5.5 Right pane empty state

- Add 3-4 example bullets ("Security deposit issues, attorneys' fees, late fees, sublet bans") under the existing copy.
- Examples label: `text-[10px] uppercase tracking-wider text-fg-subtle`.
- Bullets: `text-[11px] text-fg-muted leading-tight`.

#### 5.6 Visible trust block

Below the welcome state's how-it-works strip, render the disclaimer with a subtle border container:

```
┌───────────────────────────────────────────────┐
│ ⓘ  LeaseLens provides informational lease     │
│    analysis, not legal advice. Consult a      │
│    tenant attorney or NJ legal-aid clinic     │
│    before acting.                             │
└───────────────────────────────────────────────┘
```

Treatment: `border border-neutral-200 dark:border-neutral-800 rounded-lg p-3`, `text-xs text-fg-muted`, icon `Info` from lucide in `text-fg-subtle`.

Disappears when the user sends their first message (same as the rest of the welcome state).

#### 5.7 Responsive at 1024-1440px

- Confirm three-pane layout works at 1024-1440px without horizontal scroll
- At 768-1024px: narrow side panes to `14rem` (decide implementation approach during execution)
- At < 768px: no full mobile implementation yet (Sprint 18); minimum require no horizontal scroll + chat composer + welcome state readable + dropzone reachable

#### 5.8 Motion verification

Walk every Sprint 17 motion site with `prefers-reduced-motion` emulated. Confirm the plain DOM branch renders (`data-motion="off"`).

### Verification

| Check | How |
|---|---|
| `/` remains main experience | No `/app` route exists; no middleware redirect; cold load on `/` shows welcome state then transitions to workspace cleanly |
| First-time user understands | 5-second comprehension test: cold-load `/`, ask "what is this and what do I do" — answer should be obvious from the page |
| Upload CTA clearer | New copy renders correctly in light + dark |
| Welcome state stronger | How-it-works strip + disclaimer visible; serif H1 readable; cards stagger in |
| Red flags empty state improved | Examples bullets render |
| Legal disclaimer visible | Trust block renders on cold load; disappears on first message |
| Desktop layout works | 1024, 1280, 1440px all render without horizontal scroll |
| Mobile minimum | At 375px, page renders (not pretty yet) without horizontal scroll |
| Tests pass | `npm run test` ≥ baseline |
| Lint, typecheck | 0 errors, green |

### Risk + rollback

Low risk. Sprint 17 is additive — adding sections to the welcome state, adding microcopy to the dropzone. The only meaningful regression vector is if the new welcome-state height pushes the composer below the fold on small viewports. Mitigation: cap welcome-state max-height at 80vh and let it scroll internally.

Rollback: `git revert` the Sprint 17 commit. Welcome state returns to pre-17 (which is post-15 = already shipped).

### 5.8 What actually shipped vs originally scoped

**Welcome state (centre pane)** — [`src/components/chat/ChatEmptyState.tsx`](../src/components/chat/ChatEmptyState.tsx)

- ✅ "How it works" inline strip — four steps (`Upload lease · Scan clauses · Review red flags · Ask follow-ups`) with lucide icons (`Upload`, `FileSearch`, `Flag`, `MessageSquare`) and subtle middle-dot separators. Token-driven (`text-fg-subtle` + accent icons), wraps gracefully on narrow widths.
- ✅ Disclaimer trust block — renders the `LEASELENS_DISCLAIMER` constant verbatim inside a hairline-bordered card with an `Info` icon. Disappears with the rest of the empty state on first message send.
- 🟡 "Use sample lease" CTA — **deferred.** The sample workspace already auto-loads the seeded lease, so the standard-scan starter card works immediately. Adding a separate "Use sample lease" affordance would duplicate that path; the AC #1/#2 gap from the Sprint 13 backlog could be closed by relabeling the starter card if it ever becomes a real confusion source.

**Left pane (dropzone)** — [`src/components/lease/LeaseUploadDropzone.tsx`](../src/components/lease/LeaseUploadDropzone.tsx)

- ✅ Idle-state hint block expanded from a single line ("PDF files up to 10 MB") to three: file requirements, session-only privacy note, "informational analysis, not legal advice." Each is `text-[11px] text-fg-subtle` so they're informative without crowding the CTA.

**Right pane (red flags)** — [`src/components/lease/RedFlagReport.tsx`](../src/components/lease/RedFlagReport.tsx)

- ✅ Empty state grew an "EXAMPLES" eyebrow + four-bullet list (security-deposit overcharges, one-way attorney's-fee clauses, unenforceable late-fee structures, blanket sublet bans). Passed to the `<EmptyState>` primitive via its `actions` slot — proves the primitive's slot API works as intended.

**Composer** — [`src/components/chat/ChatComposer.tsx`](../src/components/chat/ChatComposer.tsx)

- ✅ `inputMode="text"` + `autoCapitalize="sentences"` + `spellCheck` explicitly set on the textarea so mobile keyboards show the standard layout with sensible defaults for natural-language questions.

**Responsive grid** — [`src/components/lease/LeaseLensWorkspaceShell.tsx`](../src/components/lease/LeaseLensWorkspaceShell.tsx)

- ✅ Below `lg` (1024px), the grid collapses from `[20rem 1fr 20rem]` to a single column and the side panes are `hidden lg:flex`. Centre pane fills the viewport. **No horizontal scroll at any breakpoint.**
- 🟡 Mobile upload + red-flags reachability — **deferred to Sprint 18** as the plan calls out. On mobile (< 1024px), users currently see only the chat. The Sprint 18 work brings the dropzone + red-flags back via a tabs / drawer pattern.

**Items deliberately deferred** (consistent with the plan's "do the minimum that ships cleanly"):

- Role-tab touch-target audit (the buttons are h-7 = 28px; plan §5.1 flagged 44×44px as the bar but this is part of Sprint 18's broader mobile pass).
- Header padding / theme-toggle responsive tuning — non-blocking.
- Welcome-state max-height cap — not needed yet; the new content fits comfortably at the seeded sample's workspace name length.

**Visual smoke checklist** (works in both light + dark; reduced-motion gated):

- Welcome state shows serif H1 + 4 staggered starter cards + How-it-works strip + disclaimer trust block.
- Drop a PDF → privacy hint disappears; dropzone shifts to uploading state.
- Red-flags pane shows examples list when no scan has run; populates with severity cards when a scan completes.
- Resize the browser below 1024px → side panes hide, chat fills the viewport, composer stays sticky at the bottom.

### 5.9 Follow-up patches (Sprint 17.1 / 17.2)

Three small, scoped patches shipped after Sprint 17 main to address specific user feedback that surfaced once the new welcome state was in the user's hands.

**Sprint 17.1 — Logo + sticky cockpit header**

- ✅ Chat header logo icon: lucide `ScrollText` → lucide `FileSearch`. The scroll metaphor read as "historical document"; FileSearch (document + magnifying glass) reads directly as "Lease + Lens".
- ✅ Cockpit header: added `sticky top-0 z-20`. Cockpit uses natural document scroll (unlike the chat page, which is `h-dvh + overflow-hidden`), so its header needed `position: sticky` to stay visible while the dashboard panels scrolled.

**Sprint 17.1.1 — Chat welcome-state scroll fix** ([`ChatTranscript.tsx`](../src/components/chat/ChatTranscript.tsx), [`ChatEmptyState.tsx`](../src/components/chat/ChatEmptyState.tsx))

User report: "the scrolling for the logo isn't working inside the chat." Playwright probing showed the chat header was correctly pinned at `y=0` at every viewport — but the welcome-state hero (Sparkle badge + serif H1) was scrolling off-screen on mount, making the page look like the logo had moved. Root cause was two compounding layout bugs:

1. **Unsafe `justify-center` on the empty-state container.** When the welcome content was taller than the available pane (anything below ~720 px viewport height), flexbox centred it symmetrically — the top of the content ended up at a negative y inside the scroll wrapper, unreachable by scrolling up. Fixed by switching to Tailwind v4's `justify-center-safe` (`justify-content: safe center`), which falls back to flex-start when content overflows.
2. **Auto-scroll-to-bottom firing on empty-state mount.** `pinnedToBottom` defaulted to `true`, so the pin-to-bottom effect ran on first render for both the messages and empty-state branches. Worse, React reuses the same scroll container across the two branches, so a clamped scrollTop from a prior conversation bled through. Fixed in `ChatTranscript`'s effect: early-return when `messages.length === 0`, and explicitly reset `scrollTop = 0` to clear any clamped-but-preserved value.

After the fix, on a cramped 1440×600 viewport: Sparkle goes from `y=-96` (hidden) to `y=128` (visible), H1 from `y=-35` to `y=188`. Header was always at `y=0`.

**Sprint 17.2 — Bespoke brand mark** ([`src/components/brand/LeaseLensMark.tsx`](../src/components/brand/LeaseLensMark.tsx))

User feedback: "can we change the logo to something that will suit us more and can it be animated if possible?" — referring originally to the **welcome-state hero icon** (the lucide `Sparkles` star above the H1). Lucide's `Sparkles` was generic AI-shorthand that read as "any chatbot" rather than LeaseLens. The fix bundles a new bespoke mark + both placements:

- New component `LeaseLensMark`: inline SVG of a document with three text lines and a magnifying glass overlapping the bottom-right corner. Same metaphor as lucide's `FileSearch` (which we used briefly in Sprint 17.1), but custom geometry and animatable.
- One-shot scan sweep on mount: a thin horizontal stroke translates `y: 5 → 18.5` over ~900 ms with `0 → 1 → 0` opacity, then never re-runs. Hover gives the lens a `1.08` scale, 220 ms.
- `useReducedMotion()` gated — users who opt out get the static frame, no scan, no hover scale.
- **Header placement** (small, 14 px): replaces the lucide `FileSearch` chip from Sprint 17.1. Gives the global identity a bespoke silhouette.
- **Welcome-state hero placement** (large, 28 px): replaces the lucide `Sparkles` inside the existing 56 px accent badge. The badge keeps its 4-second breathing pulse (calm "AI is alive" cue); the mark inside still scans once on its own mount, so the two animations stack as independent layers.
- Cockpit kept its lucide `Layers` icon by design: the two views are distinct workspaces and the icon difference helps tell them apart at a glance.

See [design-system/MASTER.md → Brand mark](../design-system/MASTER.md#brand-mark) for the full motion contract and placement rules.

---

## 6. Sprint 18 — App / Chat Workspace Polish

### Scope

Improve the active workspace experience after the user uploads a lease or starts chatting. **No new ingestion paths.**

#### 6.1 Scan progress

Add a top-level scan-progress label on the RedFlagReport header during a standard scan:

```
RED FLAGS · Scanning clause 6 of 15…
```

Implementation:

- Count `grade_clause_severity` `tool_use` events in `toolEvents` (in-flight).
- Total clauses = the most-recent `extract_clauses` result's `clauses.length`.
- Label transitions: "Parsing lease…" → "Extracting clauses…" → "Scanning clause N of M…" → "Generating summary…" → (label disappears, count badge appears).
- `aria-live="polite"` so screen readers announce progress.

Add skeleton red-flag cards during the scan — one skeleton per pending grade — so the right pane fills visibly rather than jumping from empty to full.

#### 6.2 ToolCard tenant-friendly render for `grade_clause_severity`

When a ToolCard's invocation is `grade_clause_severity` and the result matches `isGradingResult()`, render a polished severity-card body in the expanded view instead of pretty-printed JSON:

```
┌────────────────────────────────────┐
│ ⬛ [HIGH]  Security deposit · §3   │  ← severity bar + pill + label
│                                    │
│ This deposit is two months' rent…  │  ← reasoning (full, not clamped)
│                                    │
│ 📎 NJ Stat 46:8-19                 │  ← citation chip
│                                    │
│ RECOMMENDED ACTION                 │
│ Demand the deposit cap be reduced. │
│                                    │
│ [↗ View on page 1]                 │
└────────────────────────────────────┘
```

Falls back to JSON view for non-grading tools (`search_corpus`, `list_documents`, `render_workflow_diagram`).

#### 6.3 Chat message rendering polish

- Tighten spacing between consecutive messages
- Verify markdown rendering of `####` headings (Sprint 15.3 added; spot-check in dark mode)
- Add a streaming caret block at the end of streaming assistant text — `motion.span` with blinking opacity (gated by reduced-motion)

#### 6.4 Composer enhancements

- Add `inputMode="text"` (also covered in Sprint 17.4 — verify it's there)
- Add subtle character count when input > 800 chars: `text-[10px] text-fg-subtle` to the right of the hint
- Better loading state: during `isLocked`, the textarea gets `cursor-wait` (currently just disabled)

#### 6.5 Red flag card pulse on citation click

When a CitationChip or "View on page N" is clicked, the matching RedFlagReport card's active ring should fade in over 200ms, hold ~3.6s, fade out over 200ms — instead of snapping on/off.

Implementation: overlay `motion.div` with `initial={{ opacity: 0 }}` / `animate={{ opacity: 1 }}` / `exit={{ opacity: 0 }}`. Reduced-motion: snap.

#### 6.6 PDF viewer coordination

- Page-position badge for long leases (>10 pages): sticky `Page N of M` indicator top-right of PDF pane
- Confirm `scrollToPage` correctly hits page targets after the `ChatStreamContext` wiring (already works; just verify edge cases like page > 30 or page = 1)

#### 6.7 Mobile workspace

The biggest piece of Sprint 18. Below 1024px, the three-pane layout collapses into a single-pane view with navigation between panes.

Implementation: new `MobileWorkspace.tsx` sibling to `LeaseLensWorkspaceShell`. A `useIsDesktop()` hook (or `useMediaQuery`) picks which to render. The mobile component:

- Header gains a segmented switcher: `[Chat | Lease | Flags]`
- Chat is the default view; switching reveals the other panes full-width below the header
- Switching back to Chat returns to the default view
- Composer sticky at the bottom of the viewport (works on iOS with safe-area-inset)
- Touch targets meet 44×44px minimum
- No horizontal scroll at 375 / 414 / 768px

Decide simplest pattern that ships cleanly. Tabs are more discoverable than drawers; drawers preserve more vertical space. Either works.

#### 6.8 Accessibility polish

- `aria-live="polite"` on TypingIndicator + scan-progress label
- Verify keyboard tab order on mobile (with the segmented switcher)
- axe-core spot check on `/` (mobile + desktop, light + dark)

### Verification

| Check | How |
|---|---|
| Scan progress visible | Top-level "Scanning clause 6 of 15…" renders during a scan |
| ToolCards tenant-friendly | `grade_clause_severity` expanded body renders the severity card, not JSON |
| Raw JSON gone for tenant flows | Verify by clicking through every grade ToolCard during a standard scan |
| Citation/page interactions feel connected | Click a CitationChip → PDF jumps to page + RedFlagReport card pulses |
| Mobile works | At 375px: chat readable, dropzone reachable via segmented switcher, red flags reachable, no horizontal scroll |
| A11y | Lighthouse a11y ≥ 95 on `/` in both schemes at desktop + mobile breakpoints |
| Tests pass, lint, typecheck | ≥ baseline; 0 errors |

### Risk + rollback

Higher risk than Sprint 17. Three changes carry real regression vectors:

1. **ToolCard polished view** — strict `isGradingResult()` typeguard; if a malformed grading result lands, the card falls back to JSON. Test coverage: unit test the typeguard with malformed inputs.
2. **Mobile workspace** — new component, new logic. Mitigation: build as a sibling, NOT a refactor of `LeaseLensWorkspaceShell`. Desktop path is unchanged.
3. **Scan-progress counting logic** — derived from `toolEvents` state; if the count is wrong (e.g. inflight counts include errored grades), the progress label confuses the user. Mitigation: explicit unit test for the count helper.

### 6.9 What's shipped in Sprint 18 so far

**§1 + §2 — Scan progress label + skeleton cards (paired story)**

The two pieces share a "scan in flight" state, so they landed together.

- ✅ New hook [`useScanProgress`](../src/components/lease/use-scan-progress.ts) collapses the `toolEvents` stream into a single phase tag (`idle | extracting | grading | complete`) plus `total`, `attempted`, and a status `label`. Pure derivation — no extra state. Counts by `input.clause_id` (always present on a tool call) rather than `result.clause_id` (missing on error), so errored gradings still tick progress forward. Seven unit tests in [`use-scan-progress.test.ts`](../src/components/lease/use-scan-progress.test.ts) cover the empty case, mid-scan counting, the dedupe (re-grade of the same clause), the re-scan reset, and the success+error mixed regression case.
- ✅ Extracted [`RedFlagsPaneHeader`](../src/components/lease/RedFlagsPaneHeader.tsx) out of the shell. The eyebrow ("Red flags") is unchanged; an inline progress label appears only when the phase is in flight. A spinning ring sits next to the label (static dot under reduced motion). `aria-live="polite"` so screen readers announce phase transitions.
- ✅ New [`RedFlagSkeletonCard`](../src/components/lease/RedFlagSkeletonCard.tsx) mirrors the real card silhouette (left bar + header row + two reasoning lines + citation). Each bar pulses opacity `[0.55, 1, 0.55]` over 1.4 s with a 50–80 ms per-bar stagger; cards in a list get an 80 ms per-card stagger. Severity bar placeholder is neutral grey — does not pre-commit to a severity.
- ✅ [`RedFlagReport`](../src/components/lease/RedFlagReport.tsx) gained two new branches: (a) `phase === 'extracting'` and `gradings.length === 0` renders one skeleton per known clause (replaces the empty-state examples list during a scan); (b) `phase === 'grading'` renders the real graded cards *plus* trailing skeletons for the still-unattempted clauses — `scan.total - scan.attempted`, not `scan.total - gradings.length` — so a clause that errored doesn't leave a permanent ghost placeholder. The truly-idle examples list is preserved for first visits.

**Label transitions actually shipped** (slightly different from the §6.1 spec):

| Phase | Label |
| --- | --- |
| `extracting` | `Scanning lease — N clauses found` |
| `grading` | `Grading M of N…` (M = attempts so far, success + error) |
| `complete` | (label hidden, eyebrow only) |

The spec called out "Parsing lease… → Extracting clauses… → Scanning clause N of M… → Generating summary…" — we didn't emit those four sub-phases because the tool stream only has two boundaries (`extract_clauses` returned / each `grade_clause_severity` returned). Adding parser sub-phases would require new server-side events; deferred until needed.

**Files touched** — 5 added, 1 edited:

- `src/components/lease/use-scan-progress.ts` (new)
- `src/components/lease/use-scan-progress.test.ts` (new)
- `src/components/lease/RedFlagsPaneHeader.tsx` (new)
- `src/components/lease/RedFlagSkeletonCard.tsx` (new)
- `src/components/lease/RedFlagReport.tsx` (edited — phase branches added; behaviour for `idle` and `complete` unchanged)
- `src/components/lease/LeaseLensWorkspaceShell.tsx` (edited — inline header replaced with `<RedFlagsPaneHeader />`)

See the design-system page [Red flags panel §4 — Scanning state](../design-system/pages/red-flags-panel.md#4-scanning-state-sprint-18) for the visual contract.

**§3 — Tenant-friendly ToolCard render for `grade_clause_severity`**

The chat ToolCard previously dumped the raw grading JSON when a user expanded a `grade_clause_severity` row. Per §6.2, the expanded body now renders a polished severity card body — same anatomy as the right-pane RedFlagReport card — while every other tool keeps the existing JSON view.

- ✅ New shared module [`src/components/lease/grading.ts`](../src/components/lease/grading.ts) holds `Severity`, `GradingResult`, the four severity dictionaries (`SEVERITY_BAR`, `SEVERITY_BADGE`, `SEVERITY_LABEL`, `SEVERITY_ORDER`), the clause-type label dictionary, the `isGradingResult` typeguard, and the `clauseLabel` formatter. RedFlagReport was refactored to import from it instead of redefining everything inline. Removes the drift surface that would have produced "Auto-renewal" in one pane and "Automatic renewal" in another the moment a new clause type was added.
- ✅ New component [`src/components/lease/GradingDetailBlock.tsx`](../src/components/lease/GradingDetailBlock.tsx) renders the polished body: left severity bar, severity badge + clause label header row, full reasoning text, citation chip, recommended action under a hairline, and the View-on-page button when `page_number` is set. Reads `pdfViewerRef` + `setActiveClauseId` from ChatStreamContext so the cross-pane highlight + PDF scroll match the right-pane card exactly.
- ✅ [`src/components/chat/ToolCard.tsx`](../src/components/chat/ToolCard.tsx) branches on `invocation.name === 'grade_clause_severity' && isGradingResult(result)`. When the branch fires, the expanded body renders `<GradingDetailBlock />`. Errored gradings (`{ error: '…' }`), malformed payloads, and every non-grading tool fall back to the existing JSON view — reviewers/admins can still debug the raw shape when something goes wrong.
- ✅ Refactor: the expanded body content was duplicated across the motion and reduced-motion wrappers. Extracted into a local `<ExpandedBody />` sub-component so the per-tool branching lives in one place.
- ✅ 13 tests for the shared module (`grading.test.ts`), 7 tests for the new component (`GradingDetailBlock.test.tsx`), and 4 new tests on the ToolCard branch (polished body for valid grading, JSON fallback for non-grading tool, JSON fallback for errored grading, JSON fallback for malformed grading). Existing RedFlagReport tests continue to pass against the shared-module refactor with no changes.

**§4 — CitationChip pulse on click**

The spec called for "fade in over 200 ms, hold ~3.6 s, fade out over 200 ms — instead of snapping on/off." Scope expanded once I looked at the actual code: `CitationChip` was unused dead code (production rendered citations inline with `Paperclip + text` in both the right-pane card and the chat-side `GradingDetailBlock`), used `📎` emoji (violates the design-system anti-emoji rule), and the active-card ring snapped via className-swap. Fixed all three at once:

- ✅ Modernised [`CitationChip.tsx`](../src/components/lease/CitationChip.tsx) — dropped the emoji + monospace pill, mirrored the inline visual (lucide `Paperclip` + accent text), gave it two render modes: real `<button>` when `onClick` is provided, plain `<span>` when omitted. Added hover (`bg-accent-50/60`) + `focus-visible:ring-2 ring-accent-300` for keyboard activation.
- ✅ Replaced inline citation render in [`RedFlagReport.tsx`](../src/components/lease/RedFlagReport.tsx) with `<CitationChip />`. The citation row was lifted out of the expand-toggle button into a sibling div — nested buttons are invalid HTML, and the new layout gives users a one-click jump from the always-visible chip instead of requiring expand-first-then-button.
- ✅ Replaced inline citation render in [`GradingDetailBlock.tsx`](../src/components/lease/GradingDetailBlock.tsx) with `<CitationChip />` driving the same `handleJumpToPage` flow that the chat-side "View on page N" button already used.
- ✅ Extracted [`jumpToClausePage`](../src/components/lease/RedFlagReport.tsx) helper inside the per-card scope so the citation chip and the in-body "View on page N" button share one code path. The chip's onClick is passed in only when `page_number` is set — otherwise the chip falls back to its static-span mode.
- ✅ New `<ActiveRing />` sub-component replaces the old className-swap with an `AnimatePresence`-driven overlay: 200 ms fade-in → 3.6 s hold → 200 ms fade-out. Uses `ring-2 ring-inset` so the overlay's ring isn't clipped by the card's `overflow-hidden`. Reduced-motion path keeps the same on/off behaviour without the fade (`data-motion="off"` for test assertions).
- ✅ Tests: 5 CitationChip variants (button mode, span mode, page-aware aria-label, missing-page aria-label, callback firing), 2 new GradingDetailBlock cases (chip click drives scrollToPage, chip renders as span when page_number absent), 2 new RedFlagReport cases (chip click jumps without expanding the card, chip renders as span when no page). Existing "View on page N" assertion updated to target the new overlay testId.

**Bonus fix — `max_tokens` truncation** ([`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts), [`src/components/chat/ChatMessage.tsx`](../src/components/chat/ChatMessage.tsx))

User surfaced this while sanity-checking the scan-progress UI: a 15-clause scan finished, but the assistant's final summary text ended mid-token at `**✅` with no indication of why. Root cause was a hard-coded `max_tokens: 1024` on both Anthropic call paths in the chat route; the final summary blew past it, Anthropic returned `stop_reason: "max_tokens"`, and the route never checked the field — so the truncated text streamed to the client as if it had ended normally.

- ✅ Introduced `MAX_OUTPUT_TOKENS = 8192` constant — the documented max for Haiku 4.5 (default model). Same value used in the streaming and non-streaming paths so we don't pay attention drift the next time the cap matters. Anthropic only bills tokens actually generated, so raising the ceiling has zero cost impact on shorter turns.
- ✅ Server checks `finalMessage.stop_reason === 'max_tokens'` on the streamed final message, logs a structured warning to the server console, and emits a `{ truncated: true, reason: 'max_tokens' }` NDJSON frame to the client.
- ✅ `parseStreamLine` extended with the new `truncated` variant + tests for the happy path and three null cases (missing reason, unknown reason, `truncated: false`).
- ✅ `ChatUI` flips a `truncated` flag on the in-flight message when the event arrives.
- ✅ `ChatMessage` renders an inline amber notice ("Response was cut short — ask me to continue…") under the bubble when `truncated` is set. Only shows on assistant messages; never on user turns. Reduced-motion safe (it's a static notice, no animation).
- ✅ 5 tests added: 2 parser variants (happy + null cases) and 3 component cases (renders on assistant when truncated, hidden when not, hidden on user even if flagged).

Rollback: each subsection lands in its own commit so partial revert is clean. The most likely revert candidate is the mobile workspace (highest novelty); reverting it returns the three-pane layout at all viewports (slightly broken on mobile but at least consistent with Sprint 17 baseline).

---

## 7. Sprint 19 — Scanned PDF / Paste Text Fallback

### Scope

Add a paste-text fallback when the upload returns `pdf_no_text_layer`. **New ingestion path; new endpoint; new tests.**

#### 7.1 Error state enhancement

When the dropzone error state's status is `pdf_no_text_layer`, swap the generic error UI for the paste-text fallback:

- Headline: "This PDF looks scanned"
- Description: "LeaseLens couldn't read the text directly. You can paste the lease text instead."
- Primary CTA: "Paste text instead"
- Secondary: "Try another PDF"

#### 7.2 Paste-text component

A new `<PasteTextFallback>` component that, when triggered, reveals an inline textarea inside the dropzone area:

```
┌──────────────────────────────────────┐
│ Paste your lease text                │
│ ┌────────────────────────────────┐   │
│ │ (sticky-top textarea, auto-grow│   │
│ │  to 60vh max, monospace)       │   │
│ │                                │   │
│ └────────────────────────────────┘   │
│                                      │
│ Min 200 chars · Max ~50,000 chars    │
│                                      │
│ Privacy: text is processed in this   │
│ session only; not stored after the   │
│ workspace expires.                   │
│                                      │
│         [Cancel]  [Scan text]        │
└──────────────────────────────────────┘
```

#### 7.3 New endpoint — `POST /api/leases/text`

Body: `{ text: string, conversationId?: string }`.

Server-side pipeline (extracted into `src/lib/lease/ingest-text.ts` so it's shared with the existing PDF path):

1. Validate text length (200 ≤ chars ≤ 50,000)
2. Treat each paragraph as a "page" (split on double newlines)
3. Run `segmentClauses` on each pseudo-page
4. Run `classifyClause` on each segment
5. Insert into `leases` + `clauses` with the same shape as a PDF-derived lease
6. `pageCount` = number of pseudo-pages; `originalFilename` = "(pasted text)"

The result is indistinguishable from a parsed PDF as far as the downstream tools are concerned — `extract_clauses` returns the same shape, `grade_clause_severity` works on the same clauses, the chat experience is identical.

#### 7.4 Tests

- Unit test `ingest-text.ts` validation (min, max, empty, non-string)
- Unit test the segmentation on pasted text with various paragraph structures
- Integration test `POST /api/leases/text` with a realistic NJ lease text fixture
- Component test `<PasteTextFallback>` with the textarea + submit flow

#### 7.5 Safety considerations

- Cancel button preserves no state — user starts fresh on next attempt
- Server errors during ingest preserve the user's text (don't blow it away)
- Disclaimer applies — same `LEASELENS_DISCLAIMER` rendered next to the submit button

### Verification

| Check | How |
|---|---|
| Scanned PDF error is understandable | Upload a known scanned-image PDF → error UI shows fallback CTAs |
| Paste-text fallback exists | "Paste text instead" reveals the textarea |
| Pasted text can be processed | Submit a real NJ lease text → /api/leases/text returns 200 with lease_id |
| Pasted text behaves like PDF | Run standard scan → red flags populate as if a PDF was uploaded |
| Error states polished | Both PDF errors and text-ingest errors use `<ErrorState>` |
| Tests cover success + failure | Unit + integration tests for both paths |
| Lint, typecheck | 0 errors, green |

### Risk + rollback

Moderate risk. The new endpoint introduces a parallel ingestion path that COULD diverge from the PDF path over time.

Mitigation:

- Shared `ingest-text.ts` helper is the contract — both endpoints call it
- Integration tests cover the same downstream tools (`extract_clauses`, `grade_clause_severity`) on both PDF-derived and text-derived leases
- The `leases` table row has the same shape regardless of ingestion path — no schema branching

Rollback: `git revert` the Sprint 19 commit. The endpoint disappears; the dropzone reverts to its generic error state for `pdf_no_text_layer`. The user loses the fallback but the rest of the app continues to work.

---

## 8. Definition of done (per sprint)

A sprint is complete when:

- ✅ The intended behaviour is implemented
- ✅ Existing functionality is preserved (regression-tested)
- ✅ Tests are added or updated
- ✅ `npm run lint` 0 errors
- ✅ `npm run typecheck` green
- ✅ `npm run test` ≥ baseline
- ✅ `npm run build` succeeds
- ✅ Accessibility considered (axe-core spot check on changed surfaces)
- ✅ Responsive behaviour checked at 375 / 768 / 1024 / 1440px
- ✅ Reduced motion respected (DOM-swap pattern)
- ✅ Light + dark mode both verified
- ✅ Changes summarised in the commit message + sprint log
- ✅ Risks + follow-ups documented in this file (update the relevant sprint section)

---

## 9. Testing strategy

Layered. Faster tests run first; slower or broader tests gate releases.

| Layer | Tool | Scope | Cadence |
|---|---|---|---|
| Unit | Vitest | Pure functions, typeguards, severity mapping, formatting helpers | Every commit |
| Component | Vitest + happy-dom | Empty/Loading/Error states, ChatComposer, starter cards, severity cards | Every commit |
| Integration | Vitest with in-memory SQLite | Upload flow, scan-progress flow, citation click, red-flag panel update, paste-text flow | Every commit |
| Responsive smoke | Playwright | Layout at 375 / 768 / 1024 / 1440px | Every PR |
| E2E | Playwright | Full standard-scan flow against the deterministic Anthropic mock | Every PR |
| A11y | axe-core (in component tests) | Spot checks on the changed surfaces | Per sprint |
| Manual | browser | Reduced motion, theme toggle, screen reader spot check | Per sprint |

**Responsive smoke first; screenshot snapshots only where the layout is stable.** Screenshot diffs are easy to add but high-maintenance; defer until a layout is stable enough that small visual changes warrant a snapshot update.

**Lighthouse a11y score target:** ≥ 95 on `/` in both schemes. If < 95, document the reason in this file and create a follow-up task.

---

## 10. Risks (cross-sprint)

### Risk A — over-redesigning

The app already has a strong direction. The goal of sprints 16-19 is polish, not replacement.

**Mitigation:**

- Split into small sprints (already done)
- Preserve existing behaviour during visual sprints (no behaviour-change Sprint 17 or 18)
- Behaviour changes go in their own sprint (19) with explicit tests

### Risk B — route regression

Moving `/` to `/app` would create unnecessary risk: middleware logic, cookie redirects, existing user sessions confused.

**Mitigation:**

- The brief is explicit: do NOT migrate routes
- This file (and `MASTER.md`) repeats the decision
- Any future contributor wanting to add `/app` must update this doc first

### Risk C — token drift

Docs and CSS can drift out of sync.

**Mitigation:**

- `globals.css` is the implementation source of truth
- `MASTER.md` documents intent; if a value differs, CSS wins and the doc is updated
- Pre-delivery checklist includes "tokens documented in sync"

### Risk D — legal trust issues

Overconfident copy could make LeaseLens seem like legal advice.

**Mitigation:**

- The single `LEASELENS_DISCLAIMER` constant is the source for every disclaimer surface
- Forbidden phrases enumerated in `MASTER.md` §1 (voice & tone) and §8 (disclaimer rules)
- Sprint 17 adds visible disclaimer; Sprint 18 adds disclaimer-in-cockpit
- The legal copy is reviewed before each PR that touches disclaimer surfaces

### Risk E — UI polish breaking functionality

Component refactors can introduce subtle regressions.

**Mitigation:**

- Sprint 16A: docs only, zero risk
- Sprint 16B: refactor with visual-regression smoke test; each consumer in its own commit
- Sprint 17: additive; minimal-risk
- Sprint 18: highest novelty (mobile workspace); built as sibling, not refactor
- Sprint 19: new endpoint; covered by integration tests on both PDF and text paths

---

## 11. Rollback strategy

Each sprint commits in phases (typically 4-7 commits per sprint). Rollback granularity:

| Scenario | Rollback move |
|---|---|
| One phase breaks tests | `git revert <phase-commit>`; other phases unaffected |
| Whole sprint regresses on a critical user path | `git revert <range>`; product returns to prior sprint baseline |
| A primitive (Sprint 16B) is wrong | Revert just the primitive's commit; consumer commits may continue to use inline patterns until a replacement primitive lands |
| Mobile workspace (Sprint 18.7) is unusable | Revert just that subsection; desktop path unchanged |
| Paste-text endpoint (Sprint 19) has security/validation issue | Revert the whole sprint; dropzone returns to generic error state for `pdf_no_text_layer` |

The git history pattern from Sprint 15 (one commit per phase, descriptive message, no force-pushes) extends here.

---

## 12. What NOT to do (recap)

Repeating the brief's anti-patterns + audit's "do not change yet" list so this file works standalone:

- ❌ Move `/` to `/app`
- ❌ Create middleware redirects on `/`
- ❌ Redesign the cockpit unless explicitly requested
- ❌ Introduce shadcn/ui, cmdk, headless-ui, or Radix beyond what `motion` pulls in
- ❌ Add heavy dependencies
- ❌ Replace the token system
- ❌ Replace Geist + Source Serif 4 + Geist Mono
- ❌ Use glassmorphism, heavy gradients, or shadow bloom
- ❌ Use emoji icons in chrome (use Lucide)
- ❌ Use playful bouncing or `linear` easings
- ❌ Use generic law-firm navy/gold styling
- ❌ Show raw JSON to normal users when a polished view is possible
- ❌ Combine paste-text ingestion with visual polish (Sprint 19 stays its own sprint)
- ❌ Remove tests to make changes pass
- ❌ Change legal grading behaviour as part of UI polish

---

## 13. Safest next step

**Sprint 18** — App / Chat Workspace Polish.

Sprints 16A (docs), 16B (primitives), and 17 (homepage polish) are now complete. The runway for Sprint 18 is:

- Welcome state, dropzone, red-flag empty state, and disclaimer surfaces are all in place. First-time visitor experience is solid.
- 550/550 tests pass; 0 lint errors; typecheck green.
- The mobile layout below `lg` currently hides the side panes — Sprint 18 owns bringing them back via tabs / drawer.
- ToolCard still shows raw JSON for tenant-facing tool results; Sprint 18 §6.2 owns the polished severity-card body for `grade_clause_severity`.
- Scan progress isn't surfaced at the top level yet; Sprint 18 §6.1 owns the "Scanning clause 6 of 15…" header label + skeleton red-flag cards.

Sprint 18's order (start with the smallest visible win, save the higher-novelty mobile work for last):

1. **Scan progress label** in the right-pane header — derive from `toolEvents` count vs `extract_clauses` total. Pure presentation, no new state.
2. **Skeleton red-flag cards** during a scan — uses the existing `<LoadingState>` primitive; one skeleton per inflight grade.
3. **ToolCard tenant-friendly render for `grade_clause_severity`** — strict typeguard + polished card body; falls back to JSON for non-grading tools.
4. **CitationChip pulse on click** — fade-in over 200ms / hold 3.6s / fade-out over 200ms instead of the current snap-on/snap-off ring.
5. **Mobile workspace** (highest-novelty piece) — new `<MobileWorkspace>` sibling component selected by `useIsDesktop()` hook. Tabs or drawer pattern for chat / lease / red-flags.

Detail in §6 of this file (Sprint 18 — App / Chat Workspace Polish).

Each step in its own commit. Visual smoke + dark-mode walk + reduced-motion verification after each commit.

---

**End of UI/UX modernization plan.**
