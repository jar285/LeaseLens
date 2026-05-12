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

When a `grade_clause_severity` tool starts but hasn't returned yet, the panel shows skeleton cards so the user understands work is in progress.

```
┌──────────────────────────────────┐
│ RED FLAGS · Scanning 6 of 15…    │
├──────────────────────────────────┤
│ ┃ ░░░░  ░░░░░░░░░░░░             │  ← skeleton card 1
│   ░░░░░░░░ ░░░░░░░░              │
├──────────────────────────────────┤
│ ┃ ░░░░  ░░░░░░░░░░░░             │  ← skeleton card 2
│   ░░░░░░░░ ░░░░░░░░              │
├──────────────────────────────────┤
│   ┊  ╲    /                      │
│       ╲  /                       │  ← real cards land in place
│        ╲/                        │
└──────────────────────────────────┘
```

Skeleton card structure:

- Same layout as a real card (severity bar, badge, label, body text positions)
- Each placeholder text region: `animate-pulse rounded bg-neutral-100 dark:bg-neutral-800`
- Severity bar: `bg-neutral-200 dark:bg-neutral-700` (neutral placeholder; doesn't promise a severity)
- Count: derived from `toolEvents` filter (`grade_clause_severity` tool_use without matching tool_result) vs total expected clauses (passed from the most-recent `extract_clauses` result)

Reduced-motion: keep the layout but drop `animate-pulse` (replace with static muted background). Users with motion sensitivity still see "something is happening here" via the count label.

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

Renders the `statute_citation` string. Click → scrolls the PdfViewer to the cited clause's page AND pulses the matching card.

Treatment:

- `text-[11px] font-medium text-accent-600 dark:text-accent-300`
- Paperclip icon `h-3 w-3` to the left
- Hover: cursor-pointer; subtle underline

The chip is its own focusable button (Tab in the keyboard order). Keyboard activate triggers the same `scrollToPage` + active-card pulse as a mouse click.

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

## 6. Active-card highlight (citation jump)

When a CitationChip is clicked (in chat OR in the panel itself) or "View on page N" is pressed:

1. `setActiveClauseId(clauseId)` fires.
2. `pdfViewerRef.current.scrollToPage(pageNumber)` fires.
3. The matching card gets `border-accent-300 ring-2 ring-accent-200 dark:border-accent-400/40 dark:ring-accent-500/20`.
4. The ring stays for `HIGHLIGHT_DURATION_MS = 4000` (4 seconds).
5. A timer clears `activeClauseId` back to `null`.

### Sprint 18 polish — pulse animation

Currently the ring appears + disappears abruptly. Sprint 18 adds a `motion.div` overlay that fades the ring in over 200ms, holds 3.6s, fades out over 200ms:

```jsx
{isActive && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: 'easeOut' }}
    className="pointer-events-none absolute inset-0 ring-2 ring-accent-300 rounded-lg"
  />
)}
```

Reduced-motion: skip fade; ring snaps on/off.

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
