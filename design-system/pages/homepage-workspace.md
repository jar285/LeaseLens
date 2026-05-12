# Page Override — Homepage Workspace (`/`)

**Inherits:** [`design-system/MASTER.md`](../MASTER.md).
**Page route:** `/` (the entire LeaseLens experience). Do not migrate to `/app`.
**Implementation source:** [`src/app/page.tsx`](../../src/app/page.tsx) + [`src/components/lease/LeaseLensWorkspaceShell.tsx`](../../src/components/lease/LeaseLensWorkspaceShell.tsx).

> `/` is a landing-page + workspace hybrid. The user lands directly on the product, immediately understands what it does, and can start using it without friction. No separate marketing landing page. No `/app` migration.

---

## 1. Goals

1. **First-time visitor in 5 seconds** can answer "what is this, what do I do, is this for me?" without scrolling beyond the fold.
2. **Returning visitor** sees an unobtrusive welcome state with their workspace context preserved and gets to the chat composer with minimal noise.
3. **Active session** (lease uploaded, scan running, red flags populating) reads as a calm, professional tool surface.

The same `/` route serves all three audiences. State transitions cleanly between them via the empty-state → populated-state transition in the centre pane.

---

## 2. Page anatomy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER (sticky)                                                              │
│ [LeaseLens] · LeaseLens — NJ Tenant Law ↕   ───   [Theme] [Tenant|Rev|Adm]   │
├─────────────────┬──────────────────────────────────────┬─────────────────────┤
│ LEFT PANE       │ CENTER PANE                          │ RIGHT PANE          │
│ ~20rem          │ flex-1                               │ ~20rem              │
│                 │                                      │                     │
│ Dropzone        │   ✦ Empty state OR transcript        │ RED FLAGS header    │
│ (idle)          │     • Source Serif 4 H1              │                     │
│  ↓ drag         │     • 4 starter cards                │ (empty: paperclip   │
│ PdfViewer       │     • subtle "How it works" strip    │  + microcopy)       │
│ (after upload)  │     • disclaimer line                │                     │
│                 │   composer (sticky bottom)           │ (scan: skeleton +   │
│                 │                                      │  progress label)    │
│                 │                                      │                     │
│                 │                                      │ (populated:         │
│                 │                                      │  severity cards)    │
└─────────────────┴──────────────────────────────────────┴─────────────────────┘
```

Three-pane grid (`20rem 1fr 20rem`) is locked at ≥ 1024px. Mobile collapse rules in §7.

---

## 3. Header

Currently in [`src/app/page.tsx`](../../src/app/page.tsx) lines 109-143. Hairline border bottom, `bg-surface-card`, `py-3` height.

| Element | Treatment |
|---|---|
| Logo block | `<ScrollText>` icon in `bg-accent-600` 28×28 rounded square + "LeaseLens" wordmark in `text-[15px] font-semibold tracking-tight` |
| Workspace label | "· LeaseLens — NJ Tenant Law" — `text-sm text-fg-muted`, click opens `WorkspaceMenu` popover |
| Cockpit link | Visible only for Reviewer + Admin; `text-sm text-fg-muted` |
| Theme toggle | 28×28 ghost button; cycles system → light → dark |
| Role tabs | Segmented pill with animated `layoutId` underlay |

**Polish targets for Sprint 17:**

- Vertical balance: ensure header height stays at `py-3` (currently 56px tall). The role tabs at h-7 (28px) need verification they don't crowd at mobile widths.
- Active role state: text in `text-accent-700 dark:text-accent-300`, pill underlay in `bg-accent-50 dark:bg-accent-500/15`. Inactive `text-fg-muted hover:text-fg-default`. (Already implemented in Sprint 15.)
- Icon consistency: every icon h-3.5 w-3.5 except the logo (h-3.5 w-3.5 inside a 28×28 container).
- Responsive: below 640px, hide the workspace label text, keep only the edit pencil. The "Cockpit" link wraps below the role tabs on narrow widths — flagged for mobile work in Sprint 18.

---

## 4. Center pane — welcome state

This is the **most important surface on `/`**. It does three jobs:

1. Tell the visitor what LeaseLens does (product promise).
2. Show them what to ask (starter cards).
3. Tell them what NOT to expect (disclaimer).

### Structure

```
   ✦ (sparkle icon, 4s soft pulse — gated by reduced-motion)

   LeaseLens — NJ Tenant Law         ← Source Serif 4, text-3xl sm:text-4xl
                                        text-fg-default, tracking-tight,
                                        font-semibold

   Understand your lease before you sign.   ← Geist Sans, text-base text-fg-muted

   ┌──────────────┐  ┌──────────────┐
   │ Run scan     │  │ Explain term │   ← 4 starter cards (existing pattern)
   ├──────────────┤  ├──────────────┤
   │ Compare      │  │ Draft email  │
   └──────────────┘  └──────────────┘

   How it works:   Upload → Scan clauses → Review red flags → Ask follow-ups
                                     ^ subtle stepper, text-xs text-fg-subtle

   ⓘ LeaseLens provides informational analysis, not legal advice.
                                     ^ text-xs text-fg-muted, single line
```

### Microcopy

| Element | Copy |
|---|---|
| H1 | `{workspaceName}` (resolves to "LeaseLens — NJ Tenant Law" for the sample) |
| Subtitle | "Drop a NJ residential lease in the left pane, then ask me to scan it. I'll extract clauses, grade each against NJ tenant-law sources, and draft negotiation emails for any red flags." |
| Card 1 | **Run the standard scan** — "Extract clauses and grade each against NJ tenant law." |
| Card 2 | **Explain a lease term** — "Plain-English breakdown grounded in NJ statutes." |
| Card 3 | **Compare to NJ statute** — "Cite the supporting NJ statute for any clause." |
| Card 4 | **Draft a negotiation email** — "Polite landlord email; you review before sending." |
| How-it-works strip | "Upload lease · Scan clauses · Review red flags · Ask follow-ups" |
| Disclaimer | "LeaseLens provides informational lease analysis, not legal advice. Consult a tenant attorney or NJ legal-aid clinic before acting." |

Already implemented (Sprint 15) for H1 + subtitle + cards. Sprint 17 adds the how-it-works strip + disclaimer line.

### Motion (welcome state)

- **Sparkle icon**: 4s loop, `scale: [1, 1.04, 1]`, `opacity: [0.9, 1, 0.9]`, `ease-in-out`. Gated — reduced-motion renders plain icon.
- **H1 + subtitle**: fade-up 250ms ease-out-soft on first paint.
- **Starter cards**: parent `staggerChildren: 0.06`, each card `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}` over 240ms.
- **Card hover**: `border-neutral-300` (darker edge), icon `motion.span` nudges `x: 2` via spring (300/28).
- **How-it-works strip + disclaimer**: fade in 350ms ease-out-soft after the cards' stagger completes.

### Anti-patterns (welcome state)

- ❌ Hero illustration / hero video / 3D mockup
- ❌ Testimonial carousel (we have no testimonials; placeholder testimonials read as dishonest for a legal-tech tool)
- ❌ Email-capture form (this isn't a waitlist; the product works immediately)
- ❌ "Watch a demo" video modal (uses runtime; we don't need to demo what they're already inside)
- ❌ Visible scroll cues / "scroll for more" affordances (the page doesn't scroll on desktop)

---

## 5. Center pane — active session (lease uploaded, asking questions)

When the transcript has messages OR a scan is in progress, the welcome state hides and the transcript renders in the centre pane. Composer sticks to the bottom.

Override notes for this state live in [`app-chat-workspace.md`](app-chat-workspace.md) — this file documents `/`'s overall composition; the chat surface itself has its own override.

---

## 6. Composer (sticky bottom of center pane)

| Property | Treatment |
|---|---|
| Background | `bg-surface-card` with `border-t border-neutral-100 dark:border-neutral-800` |
| Padding | `px-6 pb-4 pt-3.5` |
| Container | `max-w-2xl mx-auto`, `rounded-xl border border-neutral-200`, focus-within crossfade to `border-accent-400 ring-2 ring-accent-100` over 120ms |
| Textarea | `min-h-[38px]`, auto-grows to `max-h-[192px]`, `placeholder:text-fg-subtle` |
| Placeholder copy | "Ask about a lease clause, NJ tenant law, or upload a lease to start a scan…" |
| Hint | "shift + enter for new line" — `text-[10px] text-fg-subtle font-mono`, centred |
| sr-only hint | `<span id="composer-hint">Press Shift plus Enter to insert a new line.</span>`; textarea `aria-describedby="composer-hint"` |
| Attach button | h-8 w-8, `text-fg-muted`, paperclip icon → switches to `Loader2` spinner during parse |
| Send button | h-8 w-8 `bg-accent-600`, `whileHover scale 1.05` spring, `whileTap scale 0.97`, `disabled:opacity-35` |

Already implemented (Sprint 15.4). Sprint 17 may add an `inputMode="text"` hint for mobile keyboards.

---

## 7. Responsive layout

### Desktop (≥ 1024px) — locked

Three-pane grid `20rem 1fr 20rem`. Header sticky. Each pane owns its own overflow chain (`min-h-0 overflow-hidden` on the section; child decides scroll).

### Tablet (768px – 1024px)

The center pane should dominate. Two options for the side panes (decision in Sprint 17):

**Option A — narrower side panes.** Reduce `20rem` to `14rem`. Tight but preserves all surfaces.

**Option B — collapsible side panes.** Side panes become drawer-overlays with a chevron toggle in the header. Center stretches to fit.

Recommendation: A for the first pass (lower risk, no new components). Revisit in Sprint 18 if real users find side panes cramped.

### Mobile (< 768px)

Center pane (welcome state or transcript) becomes the primary view. Left + right panes become accessible via the header.

```
┌─────────────────────────────┐
│ HEADER                      │
│ [LL] [Workspace] [Lease|Flags|···] │  ← segmented switcher
├─────────────────────────────┤
│                             │
│ Welcome / Transcript        │
│                             │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│ COMPOSER                    │
└─────────────────────────────┘
```

Header gains a small segmented switcher (Chat default, Lease, Flags). Switching reveals the matching pane full-width below the header; chat returns to default on send.

Sprint 18 owns the mobile layout — Sprint 17 explicitly leaves mobile usable but not yet beautiful. Detail in [`docs/ui-ux-modernization-plan.md`](../../docs/ui-ux-modernization-plan.md).

---

## 8. State transitions on `/`

| Trigger | Result |
|---|---|
| First page load, no lease, no messages | Welcome state in center; idle dropzone left; empty paperclip right |
| User uploads lease | Left flips to PdfViewer; centre stays welcome until first message; right stays empty |
| User sends first message | Centre flips to transcript view; welcome hidden until conversation cleared |
| Standard scan running | Right pane shows skeleton red-flag cards + "Scanning clause N of M…" progress label (Sprint 18); centre shows live tool-card stream |
| Scan complete | Right pane shows populated severity cards; centre shows the assistant's summary |
| Lease swap (user uploads a new PDF) | AnimatePresence exits red-flag cards left; new scan starts; transcript persists |

---

## 9. Reduced-motion + dark-mode contract

- Welcome state: sparkle loop disabled; cards appear in plain DOM, no fade-up.
- Composer: focus border still crossfades (it's a 120ms colour swap, not a movement); send button spring disabled.
- Dark mode: all token-driven surfaces flip automatically. The header's accent icon background stays accent-600 (slight desaturation handled by token override in `:root.dark`).

---

## 10. What this page should NOT do

- ❌ Show a "Sign in" CTA (auth is demo cookies; we don't have real auth)
- ❌ Show a pricing panel (no pricing; portfolio piece)
- ❌ Show a "Trusted by…" social-proof logo strip (we have no enterprise users)
- ❌ Show a hero illustration of a lease (cheesy; the product IS the lease viewer)
- ❌ Auto-play any video, GIF, or scroll-triggered animation
- ❌ Open a modal on first visit
- ❌ Track or fingerprint the visitor

---

**End of homepage-workspace override.**

Cross-references: chat-surface details in [`app-chat-workspace.md`](app-chat-workspace.md). Left-pane in [`pdf-upload-viewer.md`](pdf-upload-viewer.md). Right-pane in [`red-flags-panel.md`](red-flags-panel.md).
