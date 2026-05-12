# Page Override — App / Chat Workspace (centre pane)

**Inherits:** [`design-system/MASTER.md`](../MASTER.md).
**Surface:** the centre pane of `/` — empty state → composer → transcript → tool activity.
**Implementation source:**

- [`src/components/chat/ChatUI.tsx`](../../src/components/chat/ChatUI.tsx) (orchestrator)
- [`src/components/chat/ChatTranscript.tsx`](../../src/components/chat/ChatTranscript.tsx) (scroll container, message list)
- [`src/components/chat/ChatMessage.tsx`](../../src/components/chat/ChatMessage.tsx) (per-turn rendering)
- [`src/components/chat/ChatEmptyState.tsx`](../../src/components/chat/ChatEmptyState.tsx) (welcome)
- [`src/components/chat/ChatComposer.tsx`](../../src/components/chat/ChatComposer.tsx) (input)
- [`src/components/chat/ToolCard.tsx`](../../src/components/chat/ToolCard.tsx) (tool activity)
- [`src/components/chat/TypingIndicator.tsx`](../../src/components/chat/TypingIndicator.tsx)
- [`src/lib/chat/render-markdown.tsx`](../../src/lib/chat/render-markdown.tsx) (markdown subset)

---

## 1. Chat hierarchy

```
ChatUI
  └─ ChatTranscript                  ← scroll container, owns auto-scroll-to-bottom
       └─ ul.space-y-1
            ├─ ChatMessage (user)
            ├─ ChatMessage (assistant)
            │   ├─ avatar + role label
            │   ├─ ToolCard × N       ← inline tool invocations
            │   ├─ rendered markdown
            │   └─ followUpPrompts? (last message only, after streaming settled)
            └─ ... more messages
  └─ ChatComposer (sticky bottom)
```

Empty state replaces the `ul` when `messages.length === 0`. Welcome state details in [`homepage-workspace.md`](homepage-workspace.md).

---

## 2. Welcome state

See [`homepage-workspace.md` §4](homepage-workspace.md). The welcome state is **owned by `/`**; this override documents how it integrates with the chat workspace's empty-vs-populated transition.

Trigger: `messages.length === 0` AND no active streaming.

Disappears the instant the first user message lands in the transcript (no fade-out animation — abrupt swap is cleaner than half-state).

---

## 3. Prompt card design

Four cards, 2 × 2 grid on `sm:` and up, 1 column below.

```jsx
<motion.button
  className="group flex cursor-pointer items-start gap-3 rounded-lg
             border border-neutral-200 bg-surface-card p-4 text-left
             transition-colors
             hover:border-neutral-300 hover:bg-surface-muted
             focus-visible:ring-2 focus-visible:ring-accent-300
             dark:border-neutral-800 dark:bg-neutral-900
             dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
>
  <motion.span whileHover={{ x: 2 }} className="text-accent-500">
    <Icon className="h-4 w-4" />
  </motion.span>
  <div>
    <div className="text-sm font-semibold text-fg-default">{label}</div>
    <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
      {description}
    </div>
  </div>
</motion.button>
```

Already implemented (Sprint 15 + 15.3 cursor fix). No changes for Sprint 17 unless the card content itself is updated.

---

## 4. Composer design

See [`homepage-workspace.md` §6](homepage-workspace.md) for the full composer spec. Highlights:

- Container has the 120ms focus-within crossfade to `border-accent-400`.
- Send button is `motion.button` with spring hover/tap.
- Attach button switches paperclip → spinner during upload.
- Textarea auto-grows to `max-h-[192px]`.
- Hint is `sr-only` + visual.

**Composer states:**

| State | Treatment |
|---|---|
| Idle (empty input) | Send button disabled (`opacity-35`); attach button enabled |
| Typing | Send button enabled; no other change |
| Sending (after click, before first NDJSON chunk) | Composer becomes `isLocked={true}` — disables textarea + buttons; placeholder unchanged |
| Streaming | `isLocked` stays true; assistant message in transcript shows TypingIndicator until first chunk arrives |
| Tool running | Composer locked; ToolCard in transcript shows pending skeleton |
| Quota exceeded | Inline amber-100 banner above composer ("Demo quota: 2 messages remaining this hour.") — already implemented |

Sprint 17 adds `inputMode="text"` to the textarea for explicit mobile keyboard.

---

## 5. Tool activity design

ToolCards render inline within the assistant's message bubble. They communicate three things at a glance:

1. **What ran** — the tool name in `font-mono text-fg-default`, prefixed by `<Wrench>` icon.
2. **How it went** — status pill on the right (Running… / Done / Error / Rolled back).
3. **What it returned** — collapsed by default; click to expand body (JSON pretty-print today; tenant-friendly render is Sprint 18 work for `grade_clause_severity`).

Card root:

```jsx
<motion.div
  whileHover={{ y: -2 }}
  className="my-2 overflow-hidden rounded-lg
             border border-neutral-200 bg-surface-card
             shadow-hairline
             dark:border-neutral-800 dark:bg-neutral-900"
>
  ...
</motion.div>
```

Hover lift via `motion.div` (already shipped Sprint 15.6); reduced-motion drops to plain div.

### Status pills

| Status | Token classes |
|---|---|
| Running… | `bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300` |
| Done | `bg-success-100 text-success-600 dark:bg-success-600/15 dark:text-success-100` |
| Error | `bg-danger-100 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100` |
| Undo (Sprint 8 mutating tools) | `bg-warning-100/60 text-warning-600 + border-warning-100` |
| Rolled back | `bg-neutral-100 text-fg-muted` |
| Retry undo | `bg-danger-100/60 text-danger-600 + border-danger-100` |

### Pending shimmer

When the tool hasn't returned yet, the card body shows three `animate-pulse` bars. Not a spinner — calmer.

### Sprint 18 polish

For `grade_clause_severity` results specifically, the expanded body should render a polished card (severity badge + clause label + plain-English issue + citation chip + recommended action) instead of pretty-printed JSON. JSON fallback stays for tools that don't have a polished view (`search_corpus`, `list_documents`, `render_workflow_diagram`).

Detail in Sprint 18 of [`docs/ui-ux-modernization-plan.md`](../../docs/ui-ux-modernization-plan.md).

---

## 6. Streaming response behaviour

When the assistant streams text, the chat route emits NDJSON `{ chunk: "..." }` events. `ChatUI` accumulates into the current message's `content`.

### Indicator hierarchy

1. **No content yet, no toolInvocations yet** → TypingIndicator (3 dots, `animate-bounce`, accent-400 colour, role=status, aria-label="Assistant is composing")
2. **Has content, isStreaming === true** → render content as plain markdown; a tiny soft caret block at the end is the "still streaming" cue (Sprint 18 polish — currently no visible cue once first chunk arrives)
3. **Streaming complete** → render full markdown; followUpPrompts appear under the message

### Per-token fade — deferred

Sprint 15 attempted per-token fade-in on streamed assistant text. It conflicts with the markdown renderer (every chunk re-renders the full tree, which would re-trigger the fade on every character). Sprint 18 alternative: instead of fading characters in, append a subtle blinking caret block at the end of the streaming text. Disappears when settled.

Implementation note: render the caret as a `motion.span` with `animate={{ opacity: [1, 0.3, 1] }}` looping at 800ms intervals. Gated by reduced-motion.

---

## 7. Markdown rendering rules

The `renderMarkdown` function at [`src/lib/chat/render-markdown.tsx`](../../src/lib/chat/render-markdown.tsx) handles a subset designed for assistant chat output:

| Markdown | Renders as | Notes |
|---|---|---|
| `# Heading` | `<h2 class="text-lg font-bold text-fg-default">` | Offset by 1 (page owns h1) |
| `## Heading` | `<h3 class="text-base font-bold text-fg-default">` | |
| `### Heading` | `<h4 class="text-sm font-bold text-fg-default">` | |
| `#### Heading` | `<h5 class="text-sm font-semibold text-fg-default">` | Sprint 15.3 added |
| `##### / ######` | `<h6 class="text-xs font-semibold uppercase tracking-wider text-fg-muted">` | Eyebrow label style |
| `- item` / `* item` | `<ul><li>` with `list-disc` + `space-y-1` | |
| `1. item` | Same `<ul>` (we don't distinguish ordered/unordered visually) | |
| `---` (alone on line) | `<hr class="my-3 border-neutral-200 dark:border-neutral-800">` | |
| `**bold**` | `<strong>` | |
| `` `code` `` | `<code class="bg-surface-muted text-accent-600 dark:bg-neutral-800 dark:text-accent-300">` | |

**Not supported (intentionally):**

- Tables (rare in assistant output; would need wider markdown lib)
- Block quotes (use lists or just paragraphs)
- Links (assistant cites statutes by ID, not URLs)
- Images (no image input from the model)
- Nested lists

If the assistant emits unsupported syntax, it renders as plain text (visible artefacts on the page). This is acceptable — surfaces a content-quality issue we can adjust in the system prompt.

---

## 8. Scan progress expectations

When the user runs a standard scan, the model emits multiple `tool_use` blocks in sequence across iterations:

1. `extract_clauses` (returns N clauses)
2. `grade_clause_severity` × N (one per clause)
3. Final assistant text summary

The chat composer is locked the whole time. ToolCards stream into the assistant message one at a time. The right-pane RedFlagReport populates as `grade_clause_severity` results land.

### What needs to change in Sprint 18

Today, the user sees ToolCards but no top-level progress indicator. Sprint 18 adds:

- **Right-pane header** shows `Scanning clause 6 of 15…` while `grade_clause_severity` calls are in flight. Derived from counting tool events vs total clauses.
- **Skeleton red-flag cards** stand in for grading-in-progress slots so the right pane fills visibly as work proceeds rather than jumping from empty → full.
- **Optional**: in the centre pane, a slim progress bar above the composer during the scan loop. (Decide in Sprint 18 — may be redundant given the right-pane indicator.)

---

## 9. Keyboard + accessibility

| Surface | Keyboard contract |
|---|---|
| Composer textarea | Enter sends; Shift+Enter newline; Esc unfocuses |
| Prompt cards | Tab navigates between cards; Enter/Space activates |
| ToolCard expand | Tab to chevron; Enter/Space toggles |
| Undo button on ToolCard | Tab in tab order; Enter/Space triggers rollback |
| Citation chip on assistant message | Tab; Enter triggers scrollToPage |
| Follow-up prompt chips | Tab; Enter sends |

ARIA:

- `<ul role="list">` on the transcript (motion library sometimes strips the implicit role when wrapping).
- `<TypingIndicator role="status" aria-label="Assistant is composing">`.
- ToolCard expand button: `aria-expanded={isExpanded}`, `aria-label="Expand tool details"` / "Collapse tool details".
- Composer textarea: `aria-describedby="composer-hint"` pointing to the sr-only hint.

Sprint 18 audit: verify the TypingIndicator becomes an `aria-live="polite"` region so screen readers actually announce "Assistant is composing" without manual focus.

---

## 10. Final response state

When streaming completes, the assistant's message becomes "settled":

1. `isStreaming` flips to false.
2. Caret block (Sprint 18) disappears.
3. `followUpPrompts` chips appear under the message body (3 chips, accent-bordered, suggest a logical next question).
4. Auto-scroll un-pins (user can scroll up freely; next message re-pins).

`followUpPrompts` are defined in [`src/lib/chat/follow-up-prompts.ts`](../../src/lib/chat/follow-up-prompts.ts) — three generic chips today; Sprint 18 may make them context-aware (e.g. "Explain the security deposit clause" after a scan that found a deposit issue).

---

## 11. Anti-patterns (chat-specific)

- ❌ Typewriter effect (per-character delay rendering) — feels dated and adds no value
- ❌ Streaming spinner that doesn't match TypingIndicator placement
- ❌ Auto-expanding ToolCards (overwhelming; user opts in)
- ❌ Showing raw JSON to a Tenant user when a tenant-friendly view is possible (Sprint 18 target)
- ❌ Showing tool_use_id values in the UI (they're internal identifiers; emit them only in audit logs)
- ❌ Modal popovers for follow-up prompts (chips inline are calmer)

---

**End of app-chat-workspace override.**
