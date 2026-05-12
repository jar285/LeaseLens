# LeaseLens UI/UX Modernization — Sprint Roadmap

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

**Sprint 17** — Homepage Workspace Modernization.

Sprint 16A (docs) and 16B (primitives) are now complete. The runway for Sprint 17 is:

- The design system is documented in [`design-system/MASTER.md`](../design-system/MASTER.md) + four page overrides.
- The state primitives (`<EmptyState>`, `<LoadingState>`, `<ErrorState>`) are tested and consumed by `ToolCard` + `RedFlagReport` — ready for `ChatEmptyState`'s Sprint 17 redesign.
- The layout primitives (`<PageShell>`, `<Container>`, `<Stack>`) are tested and ready for any new welcome-state sections that need consistent rhythm.
- All 541 tests pass; 0 lint errors; typecheck green.

Sprint 17's surfaces (welcome-state polish, upload microcopy, red-flag examples, trust block) build naturally on top of the primitives. Start with the smallest visible win:

1. **Welcome-state "How it works" strip** — four-step inline (Upload → Scan → Review → Ask). Pure presentation; no behaviour change.
2. **Disclaimer trust block** — uses `LEASELENS_DISCLAIMER` constant in a token-driven Info icon container under the starter cards.
3. **Red-flag empty-state examples** — four bullets ("Security deposit issues, attorneys' fees, late fees, sublet bans") under the existing copy via the primitive's `actions` slot.
4. **Upload-area microcopy refinements** — privacy line + "informational analysis, not legal advice" line.
5. **Composer `inputMode="text"`** — explicit mobile keyboard hint.

Detail in §5 of this file (Sprint 17 — Homepage Workspace Modernization).

Each step in its own commit. Manual visual smoke after each commit.

---

**End of UI/UX modernization plan.**
