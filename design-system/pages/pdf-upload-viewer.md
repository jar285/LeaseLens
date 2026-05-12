# Page Override — PDF Upload / Viewer (left pane)

**Inherits:** [`design-system/MASTER.md`](../MASTER.md).
**Surface:** left pane of `/`, ~20rem fixed width on desktop.
**Implementation source:**

- [`src/components/lease/LeaseUploadDropzone.tsx`](../../src/components/lease/LeaseUploadDropzone.tsx) — five-state dropzone (idle / dragover / uploading / error / success)
- [`src/components/lease/PdfViewer.tsx`](../../src/components/lease/PdfViewer.tsx) — react-pdf rendering once a lease loads
- [`src/components/lease/LeaseLensWorkspaceShell.tsx`](../../src/components/lease/LeaseLensWorkspaceShell.tsx) — toggles between dropzone and viewer based on `activeLease`

---

## 1. State machine

```
   ┌─────────┐  drag PDF onto pane     ┌────────────┐
   │  idle   │ ──────────────────────► │  dragover  │
   └─────────┘                         └────────────┘
       │  click "Choose a file"             │  release
       │                                    ▼
       │   ┌──────────────────────────┐
       └─► │       uploading          │
           └──────────────────────────┘
                │                  │
        success │                  │ error
                ▼                  ▼
           ┌─────────┐         ┌─────────┐
           │ success │         │  error  │ ──┐
           └─────────┘         └─────────┘   │ "Try another file"
                │                            │
                ▼                            ▼
       ┌────────────────┐               (back to idle)
       │   PdfViewer    │
       └────────────────┘
```

All five dropzone states expose `data-status="..."` on the root `<section>` so tests can assert without reading classNames.

---

## 2. Dropzone state — idle

```
┌──────────────────────────────────────┐
│ ╲    border: dashed neutral-200      │
│  ╲                                   │
│   ╲       [FileUp icon]              │
│    ╲                                 │
│                                      │
│  Drop your NJ residential lease      │
│                                      │
│  or click to browse. We'll scan it   │
│  against NJ tenant law and surface   │
│  red flags in seconds.               │
│                                      │
│       [Choose a file]                │
│                                      │
│       PDF files up to 10 MB          │
│                                      │
│ ╲                                    │
│  ╲                                   │
└──╲───────────────────────────────────┘
```

Treatment:

- `border-2 border-dashed border-neutral-200 dark:border-neutral-800`
- Background: `bg-surface-card`, hover transitions to `hover:border-accent-300 hover:bg-surface-muted`
- Icon: `FileUp` from lucide, 56 × 56px container `bg-neutral-100 text-fg-subtle`, hover → `group-hover:bg-accent-50 group-hover:text-accent-500`
- Headline: `text-[15px] font-semibold tracking-tight text-fg-default`
- Subtext: `text-xs leading-relaxed text-fg-muted`
- CTA: `<label htmlFor>` masking a hidden file input — `border border-neutral-200 px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer`. Already has `cursor-pointer`.
- Footer hint: `text-[11px] text-fg-subtle` — "PDF files up to 10 MB"

### Sprint 17 polish targets

- Add a secondary line: "Informational analysis, not legal advice." — `text-[10px] text-fg-subtle`, below the upload size hint.
- The icon container's hover state currently goes `accent-50` background; on dark mode that reads slightly washed. Verify in dark + bump to `accent-500/15` if needed.

---

## 3. Dropzone state — dragover

Triggered when a `dragenter` event fires on the section (with dragDepth tracking to avoid flicker on child elements).

Treatment:

- Border becomes **solid** accent: `border-2 border-solid border-accent-400 bg-accent-50/60 ring-2 ring-accent-100`. Dark: `dark:border-accent-400 dark:bg-accent-500/10 dark:ring-accent-500/15`.
- Icon container: `bg-accent-100 text-accent-600` (`dark:bg-accent-500/25 dark:text-accent-200`).
- Icon pulses once via `motion.div` `animate={{ scale: [1, 1.08, 1] }}` over 400ms (`key={isDragOver}` re-mounts the animation on each entry).
- Copy swaps: **"Drop to scan"** + subtitle **"Release to start parsing"**.

Reduced-motion: skip the icon pulse; render plain div.

Already implemented (Sprint 15.7).

---

## 4. Dropzone state — uploading

Triggered after `handleFile()` validates content-type and begins the POST.

Treatment:

- Border: `border-2 border-solid border-accent-200 bg-accent-50/30` (dark equivalents).
- Icon container: same as idle, but icon swaps to `Loader2` with `animate-spin`.
- Copy: "Parsing your lease…" + the filename below (so the user knows which file is being processed).
- CTA hidden (no "Choose a file" — the upload is already in flight).
- Size hint hidden.

The animation: `Loader2` uses Tailwind's `animate-spin` (1s linear infinite rotation). This is the **only place** the design system tolerates `linear` easing — it's a loading indicator, not UI transition.

---

## 5. Dropzone state — error

Triggered when:

- `file.type !== 'application/pdf'` → "Please upload a PDF (application/pdf)."
- HTTP error from `/api/leases` → server-supplied error message
- `pdf_no_text_layer` → "This PDF has no text layer (scanned PDF). Paste the text instead?" (Sprint 19)
- Generic catch → `err.message` or "Upload failed"

Treatment:

- Border: `border-2 border-solid border-danger-100 bg-danger-100/40`. Dark: `dark:border-danger-600/40 dark:bg-danger-600/5`.
- Icon container: `bg-danger-100/60 text-danger-600`. Icon: `AlertTriangle`.
- Headline: "Upload failed".
- Subtext: the error message verbatim, `text-xs text-fg-muted`.
- CTA: **"Try another file"** — label styled with danger tokens (`border-danger-100 bg-surface-card text-danger-600`).
- Sprint 19: for `pdf_no_text_layer` specifically, the CTA becomes **"Paste text instead"** + secondary "Try another file" link.

State exits when the user picks a new file (state flips back to uploading).

---

## 6. Dropzone state — success

Triggered after `/api/leases` returns `{ lease_id, page_count, clause_count }`.

Treatment:

- Border: `border-2 border-solid border-success-100 bg-success-100/40`. Dark: `dark:border-success-600/40 dark:bg-success-600/5`.
- Icon container: `bg-success-100/60 text-success-600`. Icon: `CheckCircle2`.
- Headline: "Lease ready".
- Subtext: `"N page · M clause"` (pluralised — already implemented).

The success state is brief — the parent `LeaseLensWorkspaceShell` immediately swaps the dropzone for the `PdfViewer` since `activeLease` is now set. The success render exists primarily for the brief window before the swap (and for the test that asserts `data-status="success"`).

---

## 7. PdfViewer (post-upload)

When `activeLease` is set, the left pane swaps from the dropzone to the PDF viewer.

```jsx
<PdfViewer
  pdfUrl={activeLease.pdfUrl}            // Blob URL from URL.createObjectURL
  filename={activeLease.filename}
  pageCount={activeLease.page_count}
  clauseCount={activeLease.clause_count}
/>
```

Visual structure:

```
┌──────────────────────────────────────┐
│  filename.pdf  · N pages · M clauses │  ← compact header bar
├──────────────────────────────────────┤
│                                      │
│  [PDF page 1 rendered via react-pdf] │
│                                      │
│  [scrollable, page-by-page render]   │
│                                      │
└──────────────────────────────────────┘
```

The viewer renders each page on `<canvas>` via `react-pdf`. The pane scrolls vertically; the viewer doesn't paginate its own UI — it's one tall stack.

### Citation / page-jump behaviour

`PdfViewer` exposes a `scrollToPage(pageNumber)` method via a ref. Called by:

- `CitationChip` clicks in the chat (when the user clicks a statute citation, scroll to the cited clause's page)
- `RedFlagReport` "View on page N" button clicks
- Programmatic: any future "scroll to clause" feature

The viewer's scroll container should target the matching `<canvas>` page element (each page renders with a `data-page-number` attribute for the lookup).

### Page-position indicator (long-lease enhancement)

For leases > 10 pages, the viewer should show a sticky "Page N of M" badge in the top-right of the pane, updated on scroll. Sprint 18 work — not in Sprint 17 scope.

Treatment:

- Badge: `text-[11px] font-mono tabular text-fg-muted bg-surface-card/80 backdrop-blur-sm rounded-full px-2 py-0.5`
- Position: `absolute top-2 right-2`
- The only place we permit a soft backdrop-blur — the badge sits over PDF content and needs to stay legible. Limit to this surface.

---

## 8. Scanned-PDF limitations + paste-text fallback (Sprint 19)

When `parsePdf` returns no text (every page below `MIN_PAGE_TEXT_CHARS = 30`), the server responds with `422 { error: 'pdf_no_text_layer' }`.

### Today (pre-Sprint-19)

The dropzone shows the generic error state with the error message inline. The user can pick another file but has no path forward if their lease is image-only.

### Sprint 19 fallback

When the error code is `pdf_no_text_layer` specifically, the error state changes:

```
┌──────────────────────────────────────┐
│ [AlertTriangle icon, danger tone]    │
│                                      │
│ This PDF looks scanned                │
│                                      │
│ LeaseLens couldn't read the text     │
│ directly. You can paste the lease    │
│ text instead.                        │
│                                      │
│  [Paste text instead]  Try again     │
└──────────────────────────────────────┘
```

Clicking "Paste text instead" expands an inline textarea:

```
┌──────────────────────────────────────┐
│ Paste your lease text                │
│ ┌────────────────────────────────┐   │
│ │                                │   │
│ │  (sticky-top textarea, auto-   │   │
│ │   grow to 60vh max)            │   │
│ │                                │   │
│ └────────────────────────────────┘   │
│  Privacy: text is processed in       │
│  this session only; not stored after │
│  the workspace expires.              │
│                                      │
│           [Cancel]  [Scan text]      │
└──────────────────────────────────────┘
```

Submitting POSTs to a new `/api/leases/text` endpoint that runs the same segment-clauses → classify-clause pipeline as the PDF path but with raw text input. Server-side it's the same `leases` + `clauses` table insertion.

Sprint 19 owns the implementation. This page override documents the intended UI surface.

---

## 9. Accessibility

| Element | Treatment |
|---|---|
| Section root | `aria-label="Lease PDF upload area"`, `data-status` attribute reflects state |
| Drag events | Prevent default on `dragover` to allow drop; track `dragDepth` to avoid flicker |
| "Choose a file" label | `<label htmlFor={inputId}>` — keyboard reaches via Tab; Enter triggers file picker |
| Status message | `<span className="sr-only" data-testid="lease-upload-status">{statusMsg}</span>` — screen readers announce status text via the implicit `aria-live` of an updating sr-only span |
| Error state | Should add `role="alert"` so screen readers announce errors immediately (Sprint 17 polish — currently not declared) |
| PdfViewer canvas | Each page should have `role="img"` with `aria-label="Lease page N of M"` since rendered PDF pages aren't natively accessible (Sprint 18 polish) |

---

## 10. Anti-patterns (left pane)

- ❌ Auto-scrolling the PDF on every citation click (gives whiplash on a long lease) — use `scrollToPage` only on explicit user action
- ❌ Highlighting via opacity overlays that obscure text — use a 4-second accent ring on the matching `<canvas>` page instead (Sprint 18)
- ❌ Showing a download button on the uploaded PDF (the user uploaded it; they have the file already)
- ❌ Persisting the PDF binary anywhere server-side (we keep it as a Blob URL client-side; spec H4)
- ❌ Allowing > 10 MB or > 30-page uploads (server enforces; UI mirrors with the hint copy)

---

**End of pdf-upload-viewer override.**
