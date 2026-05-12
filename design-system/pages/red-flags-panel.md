# Page Override — Red Flags Panel (right pane)

**Inherits:** [`design-system/MASTER.md`](../MASTER.md).
**Surface:** right pane of `/`, ~20rem fixed width on desktop.
**Implementation source:**

- [`src/components/lease/RedFlagReport.tsx`](../../src/components/lease/RedFlagReport.tsx) — severity stream + cards
- [`src/components/lease/CitationChip.tsx`](../../src/components/lease/CitationChip.tsx) — clickable statute citation
- [`src/components/chat/ChatStreamContext.tsx`](../../src/components/chat/ChatStreamContext.tsx) — provides the `toolEvents` stream + `activeClauseId` highlight state

---

## 1. State summary

```
   ┌────────────────┐
   │  RED FLAGS     │  ← static header, always visible
   ├────────────────┤
   │                │
   │   empty   ◄─────────  no grade_clause_severity events yet
   │                │
   │   scanning ◄────────  grade_clause_severity in flight (Sprint 18)
   │                │
   │   populated ◄───────  one or more severity cards
   │                │
   │   lease swap ◄──────  AnimatePresence exits old cards left
   │                │
   └────────────────┘
```

The panel listens to the `toolEvents` array from `ChatStreamContext`. Each successful `grade_clause_severity` event becomes (or updates) a card keyed by `clause_id`.

---

## 2. Panel header

```
┌──────────────────────────────────┐
│ RED FLAGS                        │
└──────────────────────────────────┘
```

Treatment:

- `text-[11px] font-semibold tracking-[0.14em] uppercase text-fg-muted`
- Padding: `px-4 py-3`
- Border-bottom: `border-b border-neutral-100 dark:border-neutral-800`
- Background: `bg-surface-card` (slightly lighter than the panel container `bg-surface-base`)

Sticky at top of pane. Owns:

1. The "RED FLAGS" label.
2. The count badge (visible when cards exist) — `tabular-nums`, rendered inline like "4 flags".
3. The pulse animation on count growth (Sprint 15.8 already shipped).
4. **Sprint 18 addition:** during a scan, a small inline progress label "Scanning clause 6 of 15…" replaces the count.

---

## 3. Empty state

```
   ┌────────────────────┐
   │                    │
   │      [📎 icon]      │  ← paperclip in fg-subtle, 40×40
   │                    │
   │  Red flags will    │
   │  appear here as    │
   │  I grade each      │
   │  clause.           │
   │                    │
   └────────────────────┘
```

Treatment:

- Icon container: `h-10 w-10 rounded-full bg-neutral-100 text-fg-subtle`; dark: `dark:bg-neutral-800 dark:text-neutral-500`
- Body text: `text-[12px] text-fg-muted leading-relaxed`, max 3-line height
- Vertical centred in the available pane height (`flex flex-col items-center justify-center`)

### Sprint 17 polish (recommended)

Add a short list of examples below the empty-state body so a first-time visitor knows what to expect:

```
   ┌────────────────────┐
   │      [📎 icon]      │
   │                    │
   │  Red flags will    │
   │  appear here as    │
   │  I grade each      │
   │  clause.           │
   │                    │
   │  EXAMPLES:         │
   │  • Security deposit│
   │  • Attorneys' fees │
   │  • Late fees       │
   │  • Sublet ban      │
   │                    │
   └────────────────────┘
```

`EXAMPLES:` label as `text-[10px] uppercase tracking-wider text-fg-subtle`. Bullets as `text-[11px] text-fg-muted leading-tight`. Four max.

### What the empty state is NOT

- ❌ A "click to scan" CTA (the scan happens via the chat; the panel observes)
- ❌ An animated illustration of a magnifying glass scanning a document
- ❌ A "try the demo" link (we're already in the demo)

---

## 4. Scanning state (Sprint 18)

While a standard scan is in flight, the panel shows skeleton cards instead of the static examples list, and the header carries a live progress label so the user knows work is happening even before any real cards arrive.

**Implementation files**

- [`src/components/lease/use-scan-progress.ts`](../../src/components/lease/use-scan-progress.ts) — derived state hook; reads `toolEvents` and returns `{ phase, total, graded, label }`
- [`src/components/lease/RedFlagsPaneHeader.tsx`](../../src/components/lease/RedFlagsPaneHeader.tsx) — pane header with eyebrow + in-flight progress label
- [`src/components/lease/RedFlagSkeletonCard.tsx`](../../src/components/lease/RedFlagSkeletonCard.tsx) — placeholder card

**Phase machine**

The hook counts **attempts**, not successes — a `grade_clause_severity` tool_result that *errored* still ticks progress forward, because the work for that clause is done (just unsuccessful). Counting only successes would leave the rail stuck whenever the corpus failed on some clauses; the user-reported "Grading 8 of 15 with 5 ghost skeletons after the scan finished" bug came from exactly that.

| Phase        | Trigger                                                                  | Label                                          | Rail content                                          |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `idle`       | No `extract_clauses` tool_result yet                                     | (no label, eyebrow only)                       | Empty state + examples list                           |
| `extracting` | `extract_clauses` returned; zero `grade_clause_severity` attempts        | `Scanning lease — N clauses found`             | N skeleton cards                                      |
| `grading`    | M attempts so far (success + error), M < N                               | `Grading M of N…`                              | (M − errors) real cards + (N − M) trailing skeletons  |
| `complete`   | Every clause has at least one `grade_clause_severity` tool_result        | (no label, eyebrow only)                       | Real cards for successes only — no skeletons          |

A re-scan (`extract_clauses` fires again with a new clause set) resets the counter: tool_results from prior scans no longer count toward the current phase. The hook handles this by finding the *last* extract event and only counting attempts that came after it.

**Counting rule (important)**

Count by `event.input.clause_id`, **not** `event.result.clause_id`. The input is always populated on tool calls; the result lacks the grading shape when the tool errored. If we counted by result, errored gradings would invisibly skip the progress bar and leave skeletons behind permanently.

```
┌──────────────────────────────────┐
│ RED FLAGS         ◐ Grading 6/15 │  ← header eyebrow + spinner + label
├──────────────────────────────────┤
│ ▌ [HIGH] Security deposit · §3   │  ← real card (graded)
│   exceeds NJ statutory cap…      │
├──────────────────────────────────┤
│ ┃ ░░░░  ░░░░░░░░░░░░             │  ← skeleton card (ungraded)
│   ░░░░░░░░ ░░░░░░░░              │
└──────────────────────────────────┘
```

**Skeleton card structure**

- Same outer silhouette as a real card (`rounded-lg border bg-surface-card shadow-hairline`)
- Severity bar placeholder: `bg-neutral-200 dark:bg-neutral-700` (neutral — doesn't promise a severity)
- Badge + clause-label placeholders: small `bg-neutral-200` bars (8 px + 12 px tall) on the header row
- Reasoning placeholders: two `bg-neutral-150 dark:bg-neutral-800` bars (`w-full` then `w-3/4`)
- Citation placeholder: short `bg-neutral-150` bar (`w-20`)
- Each bar pulses opacity `[0.55, 1, 0.55]` over 1.4 s with a 50–80 ms stagger across bars and an 80 ms stagger across cards in the list — gentle "this is alive" cue without a hard shimmer.
- `aria-hidden="true"` on the card and every bar — the progress label in the header already announces state via `aria-live="polite"`.

**Reduced motion**

The `useReducedMotion()` hook is consulted in both the header and the skeleton card:

- Header swaps the spinning ring for a static accent dot.
- Skeleton bars drop the opacity pulse and render at a fixed `opacity-60`.
- The label text still updates as the phase advances, so screen-reader users hear the count progress regardless of motion preference.

---

## 5. Populated severity card

```
┌──────────────────────────────────┐
│ ▌ [HIGH]  Security deposit · §3  │  ← severity bar, pill, clause label
│                                  │
│   This clause requires a deposit │
│   of $4,800 (2 months' rent),    │
│   which exceeds the NJ 1.5-month │
│   statutory cap of $3,600.       │
│                                  │
│   📎 NJ Stat 46:8-19             │  ← citation chip in accent
│                              [˅] │  ← expand chevron
└──────────────────────────────────┘
```

Card root:

```jsx
<motion.article
  initial={{ opacity: 0, x: 8 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -8 }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  className={`relative overflow-hidden rounded-lg border bg-surface-card
              shadow-hairline transition-shadow hover:shadow-lift
              dark:bg-neutral-900 ${activeClasses}`}
>
  <span className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[severity]}`} />
  <button onClick={toggle}>...header content...</button>
  {isExpanded && <div>...recommended action + View on page N...</div>}
</motion.article>
```

### Severity bar (1px coloured strip on the left edge)

| Severity | Token class |
|---|---|
| `high`   | `bg-danger-600` |
| `medium` | `bg-warning-600` |
| `low`    | `bg-info-600` |
| `ok`     | `bg-success-600` |

### Severity badge (inline pill)

| Severity | Classes |
|---|---|
| `high`   | `bg-danger-100/80 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100` |
| `medium` | `bg-warning-100/80 text-warning-600 dark:bg-warning-600/15 dark:text-warning-100` |
| `low`    | `bg-info-100/80 text-info-600 dark:bg-info-600/15 dark:text-info-100` |
| `ok`     | `bg-success-100/80 text-success-600 dark:bg-success-600/15 dark:text-success-100` |

Labels: `High` / `Med` / `Low` / `OK`. **Always paired with the colour**, never colour-alone.

### Clause label

Format: `{ClauseTypeLabel} · §{clause_index + 1}`

Examples:

- "Security deposit · §3"
- "Late fee · §7"
- "Subletting · §5"

Label set defined in [`RedFlagReport.tsx`](../../src/components/lease/RedFlagReport.tsx) `CLAUSE_TYPE_LABEL` constant.

### Body text (collapsed)

The `reasoning` field from the grading result. Truncated to 2 lines via `line-clamp-2` when card is collapsed; full when expanded.

### Citation chip

Single source: [`src/components/lease/CitationChip.tsx`](../../src/components/lease/CitationChip.tsx). Used by both the right-pane RedFlagReport card and the chat-side `GradingDetailBlock` so the citation visual never drifts between surfaces.

Renders the `statute_citation` string with a lucide `Paperclip` icon. Two modes:

- **Clickable** — when `onClick` is provided (parent passes a `jumpToClausePage` handler), the chip renders as a real `<button>` with hover + focus-visible affordances. Activates with mouse or keyboard; calls `setActiveClauseId` + `scrollToPage` (parent-supplied).
- **Static** — when `onClick` is omitted (e.g. clause has no `page_number`), the chip renders as a `<span>` with the same visual but no interaction. Aria-label drops the "jump to page N" suffix.

Treatment:

- `text-[12px] font-medium text-accent-600 dark:text-accent-300`
- Paperclip icon `h-3 w-3` in accent-500
- Hover (button mode only): `bg-accent-50/60 dark:bg-accent-500/10`
- Focus-visible: 2 px accent-300 ring with 1 px offset

`pageNumber` is informational only — it enriches the aria-label (`"NJ Stat 46:8-19, jump to page 4"`). The actual scroll is fired by the parent's onClick handler.

### Expanded body

Shown when `isExpanded === true`:

```
┌──────────────────────────────────┐
│ RECOMMENDED ACTION               │  ← eyebrow label
│ Demand the deposit cap be        │
│ reduced to $3,600 and interest   │
│ held on your behalf.             │
│                                  │
│  [↗ View on page 1]              │
└──────────────────────────────────┘
```

- Background: `bg-surface-muted/40 dark:bg-neutral-800/30` (subtle inset)
- "RECOMMENDED ACTION" label: `text-[10px] font-semibold uppercase tracking-wider text-fg-muted`
- Body: `text-[12px] leading-relaxed text-fg-default`
- "View on page N" button: `border-neutral-200` + `text-fg-default`, hover `border-accent-300 text-accent-700`

Sprint 18 may add a secondary action ("Draft a response") that pre-fills the composer with a tone-matched prompt to call `draft_negotiation_email` for this clause.

---

## 6. Active-card highlight (citation jump) — Sprint 18 §4 shipped

Two entry points trigger the same flow:

1. **Citation chip click** — the always-visible `<CitationChip />` in the card header (a real `<button>` when `page_number` is set), OR the citation chip inside the chat-side [`GradingDetailBlock`](../../src/components/lease/GradingDetailBlock.tsx).
2. **"View on page N" button** — inside the expanded body of the right-pane card.

Both call the same per-card helper `jumpToClausePage(grading)` which:

1. `setActiveClauseId(clauseId)` fires.
2. `pdfViewerRef.current.scrollToPage(pageNumber)` fires.
3. `setTimeout(..., HIGHLIGHT_DURATION_MS)` clears `activeClauseId` back to `null` after 4 s.

**Two real-button affordances on one card.** The citation row is a sibling of the expand toggle — not a nested button — so the user can click the chip for a one-click jump without expanding the card, OR click the rest of the card to expand and then use "View on page N". The chip stops short of triggering the toggle; the toggle stops short of stealing the chip's click.

### Ring animation (the shipped version)

Replaces the className-swap snap with a real cross-fade overlay. The card always carries a neutral border; an `<ActiveRing />` sub-component renders an absolutely-positioned `motion.span` overlay when `isActive` is true:

```tsx
<AnimatePresence>
  {isActive ? (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-lg
                 ring-2 ring-inset ring-accent-300
                 dark:ring-accent-400/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    />
  ) : null}
</AnimatePresence>
```

**Timing math.** `HIGHLIGHT_DURATION_MS` (4000 ms) decomposes as: 200 ms fade-in (motion entry) + ~3600 ms hold + 200 ms fade-out (AnimatePresence exit when `activeClauseId` clears). The 200 ms duration is fixed in the component; the hold + fade-out are gated by the parent's setTimeout.

**`ring-inset`** is important — without it, the ring would extend outward from the overlay's box and get clipped by the card's `overflow-hidden`. Inset draws the ring inside the overlay box, flush with the card's content area.

**Reduced motion** — the overlay still mounts/unmounts on the same `isActive` flag, but the fade is skipped. `data-motion="off"` distinguishes the path in test assertions.

---

## 7. Summary header pulse (count growth)

When a new severity card is added to the panel, the header "RED FLAGS · 4 flags" label pulses once:

```js
animate={{ opacity: [1, 0.7, 1] }}
transition={{ duration: 0.35, ease: 'easeInOut' }}
```

Already implemented (Sprint 15.8).

Reduced-motion: skip; just update the count silently.

---

## 8. Sort order

Cards sort by:

1. Severity (high → medium → low → ok)
2. Then `clause_index` ascending within each severity bucket

Re-runs of the same clause (e.g. user asks to re-grade) replace the existing card with the new result (keyed by `clause_id` so React diffs cleanly).

---

## 9. Accessibility

| Element | Treatment |
|---|---|
| Section | `aria-label="Red-flag report"` |
| Severity pill | text content is the severity label; not colour-only |
| Card toggle button | `aria-expanded={isExpanded}`, `data-testid="red-flag-card-toggle"` |
| Citation chip | native `<button>`; Tab navigates; Enter activates |
| "View on page N" | native `<button>` with `data-testid="red-flag-jump-to-page"` |
| Active card | `data-active="true"` attribute for testing + screen-reader detection |
| Severity colour | reinforced by text label every time |
| Scan progress (Sprint 18) | `aria-live="polite"` so screen readers announce "Scanning clause 6 of 15" without explicit focus |

---

## 10. Anti-patterns (right pane)

- ❌ Severity communicated by colour alone (always pair with the label)
- ❌ Auto-expanding the most severe card (overwhelming; user chooses)
- ❌ Auto-scrolling the panel to the latest card (loses position for users reading earlier ones)
- ❌ Sorting by chronological order of grading (severity is more useful — high concerns first)
- ❌ Hiding the "ok" severity cards (informational completeness > clean visual; user knows we checked)
- ❌ Showing a red-flag toast for new items (the panel IS the surface; toasts would be redundant)
- ❌ Hover-only expand affordance (must be Tab-reachable + click-to-toggle)

---

**End of red-flags-panel override.**
