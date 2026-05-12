# LeaseLens UI/UX Audit — Sprint 16A

**Status:** Sprint 16A documentation, post-Sprint-16B codebase (six shared primitives shipped).
**Cross-references:** [`design-system/MASTER.md`](../design-system/MASTER.md), [`design-system/pages/*`](../design-system/pages/), [`docs/ui-ux-modernization-plan.md`](ui-ux-modernization-plan.md).

This audit captures the current state of LeaseLens's UI/UX, ranks weaknesses by user impact, and bounds what should and should NOT change in upcoming sprints. It exists to anchor the modernization sprints in honesty: most of the foundation is good, a few visible gaps are obvious, and the worst trap would be redoing what already works.

**Sprint history annotations:**

- ✅ Sprint 16A: docs created (this audit + 5 design-system files + modernization plan).
- ✅ Sprint 16B: six shared primitives (`<EmptyState>`, `<LoadingState>`, `<ErrorState>`, `<PageShell>`, `<Container>`, `<Stack>`) + 34 tests. Two consumer refactors (ToolCard pending → `<LoadingState>`; RedFlagReport empty → `<EmptyState>`). Dropzone error refactor deliberately deferred to Sprint 19. 541/541 tests pass.
- ✅ Sprint 16B.1 (patch): PdfViewer dark-mode token sweep (12+ classes), GFM table support in `renderMarkdown` (+ 9 tests). 550/550 tests pass.
- ✅ Sprint 17: welcome-state "How it works" strip + disclaimer trust block, red-flags empty-state examples list, dropzone privacy / not-legal-advice microcopy, composer `inputMode="text"` + autocapitalize/spellcheck, responsive grid (single-column below `lg`, side panes hidden). First-time-visitor context now reads as a calm landing-AND-workspace hybrid. 550/550 tests pass.

---

## 1. Current strengths

Don't break these.

### 1.1 Three-pane structure works

The `20rem 1fr 20rem` grid in [`LeaseLensWorkspaceShell.tsx`](../src/components/lease/LeaseLensWorkspaceShell.tsx) gives the user three simultaneously-visible mental models — what's in the lease (left), what's being asked (centre), what's been flagged (right). Each pane owns its own overflow chain, so users can scroll the PDF and the transcript and the report independently. This is the most-distinctive structural decision in the product and competitive AI legal-tech tools (Harvey, Robin AI) don't generally pair lease + chat + report side-by-side in one viewport.

**Don't:** flatten this into a single-pane chat with a "sidebar" toggle.

### 1.2 Design-token foundation is already in place

Sprint 15 shipped a complete Tailwind v4 `@theme` block: warm-neutral 50→950, accent 50→700 keyed on `#6E5CE6`, semantic success/warning/danger/info, surface + fg aliases, radii, hairline + lift shadows, motion durations, ease-out-soft easing. Dark mode via `:root.dark` overriding the semantic aliases. Manual theme toggle with persistence + no-FOUC inline script.

The token system supports both Tailwind utilities (`bg-surface-card`, `text-fg-muted`, `border-neutral-200`) and `dark:` per-class variants where semantic aliases aren't enough.

**Don't:** replace the token system in any sprint. Document it (Sprint 16A) and consume it (16B onward).

### 1.3 Warm-minimal visual direction is already calibrated

Geist Sans + Source Serif 4 + Geist Mono via `next/font`. Hairline borders. Subtle 2px hover lift. No gradients, no glass. The aesthetic the brief asks for — Claude / Vercel / Linear feel — is largely already in the codebase post-Sprint-15.

**Don't:** swap fonts. Don't introduce gradients or glass cards.

### 1.4 Chat-centered product surface

The user lands on a chat composer with four starter prompts and an editorial H1. The path to "do something useful" is one click. The empty state already explains in plain English what LeaseLens does ("Drop a NJ residential lease in the left pane, then ask me to scan it…").

**Don't:** turn the empty state into a marketing hero with no functional path forward.

### 1.5 Role switcher

Three demo roles (Tenant / Reviewer / Admin) backed by stable demo-user IDs. Animated pill underlay via `motion`'s `layoutId`. Persists via signed cookie + server action. `role="group"` ARIA (semantically correct — no tab panels exist).

**Don't:** convert to `role="tablist"` semantics. The current `role="group"` is correct because the switch changes registry filtering, not panel content.

### 1.6 Red flag panel concept

Severity bar + pill + clause label + reasoning + citation chip + "View on page N" → the structure communicates risk in 2 seconds per card. Coordination with the PDF viewer via `scrollToPage` lets the user jump from a flag to the source clause without losing context.

**Don't:** show all flags expanded by default. The collapse-by-default + expand-on-demand pattern keeps the panel scannable.

### 1.7 PDF upload + viewer concept

Five-state dropzone (idle / dragover / uploading / error / success) with explicit `data-status` for testing. Drag-and-drop OR click-to-browse. Strict client-side filter (`application/pdf` only) before the request is sent. Sprint 15.7 polished the dragover state to solid accent + icon pulse.

**Don't:** add OCR or image-PDF support inside the upload UI. The paste-text fallback (Sprint 19) is the right escape hatch.

---

## 2. Current weaknesses

Ranked by visible user impact.

### 2.1 First-time user context is too light (P0)

The empty state explains LeaseLens in 2 sentences and shows 4 starter prompts. That's enough for a user who already knows AI lease tools exist. It's NOT enough for:

- a tenant who hasn't heard of "AI lease review" before
- a hiring reviewer landing cold from a portfolio link
- anyone who wants to know "is this legit, what's the disclaimer, who built this"

**Impact:** the user can use the tool, but doesn't trust it. Adoption requires trust.

**Sprint:** 17.

### 2.2 `/` feels more like a tool screen than a complete product experience (P0)

The current `/` jumps straight into the three-pane workspace. There's no "what is this", no "how it works in 4 steps", no "who is this for", no visible disclaimer alongside the action surface. A user landing fresh sees a textbox and a dropzone and has to infer.

The brief explicitly rejects splitting into a marketing landing + `/app` workspace. The fix is to make `/` itself **landing-AND-workspace** — the welcome state acts as a contextual hero that disappears once the user starts working.

**Impact:** related to 2.1. Specific user journeys (cold landing → first scan → trust the result → consider negotiation email) lose the contextual scaffolding they need.

**Sprint:** 17.

### 2.3 Center empty state can be more intentional (P1)

The current empty state has:

- Sparkle icon (animated)
- Source Serif H1 (workspace name)
- Subtitle (2 sentences)
- 4 starter cards

It lacks:

- A clear "how it works" visualisation (upload → scan → review → ask)
- The disclaimer line
- An optional "I don't have a lease handy" affordance (use sample)
- Visual rhythm between the heading and the cards (currently feels stacked, not composed)

**Impact:** the user reads the H1, scans the cards, and has to construct the workflow mentally.

**Sprint:** 17.

### 2.4 Upload area can feel more premium (P1)

The current dropzone reads as functional but generic. It works, but doesn't communicate "this is a sophisticated tool". Specifically:

- The "PDF files up to 10 MB" hint is at the bottom, easy to miss
- No copy about privacy ("text stays in your session")
- No copy about what happens after upload ("we'll scan against NJ tenant law")
- The "Choose a file" button is a label, which is correct, but visually it's small and easy to miss

**Impact:** users hesitate to upload a real lease because they don't know what happens to it. Hesitation lowers conversion.

**Sprint:** 17.

### 2.5 Red flags empty state feels passive (P1)

Current copy: "Red flags will appear here as I grade each clause." Functional, but the panel sits visually empty until the scan runs. A first-time user looking at the three-pane shell with no lease uploaded sees:

- Left: dropzone with clear CTA
- Centre: chat with prompts
- Right: an icon and one sentence

The right pane reads as "waiting for something to happen" rather than "here's what the tool will surface for you". Adding 3-4 example bullets ("Security deposit issues, attorney's fees, late fee structure, sublet bans") would set expectations.

**Impact:** the user doesn't know what red flags LeaseLens looks for until after they upload + scan.

**Sprint:** 17.

### 2.6 Scan progress could be clearer (P1)

Today the user sees ToolCards stream into the assistant message during a standard scan, but no top-level "we are scanning 6 of 15 clauses, halfway done" indicator on the right pane. The user has to count ToolCards (which is hard because they're stacked and require scrolling within the chat).

**Impact:** during the 30-60 second standard scan, the user can't tell if it's making progress, stuck, or nearly done. Bad UX during the most important workflow.

**Sprint:** 18.

### 2.7 ToolCard details may feel too technical (P1)

Click-to-expand on a ToolCard reveals the raw input/result JSON. For developer-style tools (`search_corpus`, `list_documents`) this is fine. For `grade_clause_severity` — a tenant-facing result — exposing raw JSON undermines the calm professional tone.

**Impact:** when a user clicks a severity grading expecting more detail, they get something that looks like a system trace.

**Sprint:** 18 (replace JSON view with a polished severity-card body for `grade_clause_severity` specifically).

### 2.8 Mobile behaviour needs more polish (P2)

The three-pane layout doesn't gracefully collapse below 1024px. At 768px the panes are too narrow; at 375px the layout breaks entirely (horizontal scroll). No mobile-optimised navigation between panes.

**Impact:** a tenant trying to review a lease on their phone (a common case for renters under time pressure) can't use the product.

**Sprint:** 18.

### 2.9 Legal disclaimer should be more visible (P2)

The `LEASELENS_DISCLAIMER` constant is wired into the system prompt and the README, but the UI surfaces it only in the chat empty state as a single subtitle line. There's no dedicated trust block, no disclaimer near the upload CTA, no disclaimer in the cockpit panels (where Reviewer/Admin make decisions on tenant data).

**Impact:** a user who skims past the empty state never sees the disclaimer until they read a negotiation-email draft (which has it baked in). Legal-tech trust principle: disclaimer near every action surface.

**Sprint:** 17 (add a visible trust block on the empty state) + 18 (add disclaimer footer on cockpit).

### 2.10 Inline citation behaviour (P3)

When the assistant emits an inline statute citation in chat text (e.g. "NJ Stat 46:8-19"), it renders as plain text — not a clickable chip. The RedFlagReport panel makes citations clickable, but inline citations in the chat transcript do not.

**Impact:** small UX inconsistency. Users notice that some citations are clickable and some aren't, and can't predict which.

**Sprint:** 18 (lower priority; the render-markdown component would need to detect statute patterns).

---

## 3. Priority ranking

| Priority | Issue | Sprint | Status |
|---|---|---|---|
| P0 | First-time user context too light | 17 | ✅ Sprint 17 — How-it-works strip + disclaimer trust block |
| P0 | `/` feels like a tool screen, not a product | 17 | ✅ Sprint 17 — welcome state now reads as landing+workspace hybrid |
| P0 | Disclaimer visibility (UI-side, beyond the empty state) | 17 | ✅ Sprint 17 — visible trust block under starter cards |
| P1 | Empty state lacks "how it works" + sample + rhythm | 17 | ✅ Sprint 17 — How-it-works strip added |
| P1 | Upload area feels generic; missing privacy/process copy | 17 | ✅ Sprint 17 — privacy + legal microcopy added |
| P1 | Red flags empty state is passive | 17 | ✅ Sprint 17 — examples list added |
| P1 | Scan progress not visible at top-level | 18 | 🟡 Pending |
| P1 | ToolCard raw JSON for tenant-facing tools | 18 | 🟡 Pending |
| P2 | Mobile layout broken below 1024px | 17 + 18 | 🟡 Sprint 17 hid the side panes (no horizontal scroll); Sprint 18 brings them back via tabs/drawer |
| P2 | Disclaimer in cockpit | 18 | 🟡 Pending |
| P3 | Inline citation chips in chat transcript | 18 | 🟡 Pending |
| P3 | Scanned-PDF fallback (paste text) | 19 | 🟡 Pending |
| P3 | PDF page-position indicator on long leases | 18 | 🟡 Pending |
| P3 | RefreshButton focus rings (cockpit only) | 18 | 🟡 Pending |

P0 = first-time-user-blocking. P1 = active-use-friction. P2 = cross-device or admin-surface. P3 = polish.

---

## 4. Implementation risks

### 4.1 Token drift

The implementation source is `globals.css`. The documentation source is `design-system/MASTER.md` (Sprint 16A). If a future sprint adds or changes a token in CSS without updating the docs (or vice versa), they fall out of sync and the docs become unreliable.

**Mitigation:** every PR that touches `@theme` in `globals.css` MUST update the corresponding section in `MASTER.md` in the same commit. The pre-delivery checklist (`MASTER.md` §10) includes "tokens documented" as an item.

### 4.2 Regression on the welcome ↔ transcript swap

The welcome state shows when `messages.length === 0`. Adding more content to the welcome state (Sprint 17) increases the visual delta when the user sends their first message and the workspace flips to transcript view. If the swap feels jarring, users perceive the tool as choppy.

**Mitigation:** keep the swap an abrupt unmount (not a fade-out). The user is taking an action; abrupt cleaner than half-state. Tests at `app/page.test.tsx` already assert the empty state renders when messages are empty — extend to cover the new welcome blocks.

### 4.3 ToolCard polished view that doesn't cover all tool result shapes

Sprint 18 replaces the JSON view for `grade_clause_severity` with a polished severity card. The risk: another tool (existing or future) might emit a result shape close enough to `grade_clause_severity` that the polished view triggers incorrectly. Or worse, `grade_clause_severity` returns an error shape (just `{ error: "..." }`) that the polished view doesn't handle.

**Mitigation:** strict `isGradingResult(value)` typeguard. If the result doesn't match, fall back to the JSON view. Sprint 18 must include unit tests for malformed grading results.

### 4.4 Mobile layout introduces a new pattern not tested elsewhere

The three-pane → stacked layout (or tabs) for mobile is new ground. Most of the codebase assumes desktop-grid. Refactoring `LeaseLensWorkspaceShell` to support mobile breakpoint switching introduces a risk of breaking the existing desktop layout.

**Mitigation:** Sprint 18 mobile work introduces a `<MobileWorkspace>` component sibling, not a refactor of `LeaseLensWorkspaceShell`. The desktop component uses a media-query-derived `useIsDesktop()` hook to decide which to render. No changes to the desktop path.

### 4.5 Paste-text fallback creates a parallel ingestion path

Sprint 19 adds `/api/leases/text` that runs the same `segmentClauses` + `classifyClause` pipeline against raw text input. The risk: the two paths drift (e.g. PDF path validates file size, text path needs to validate character count; they could end up with different limits).

**Mitigation:** extract the shared ingestion logic into `src/lib/lease/ingest-text.ts` that both endpoints call. Sprint 19 spec explicitly calls this out.

### 4.6 Legal disclaimer wording drift

`LEASELENS_DISCLAIMER` is a single constant today. Adding more visible disclaimer surfaces (trust banner, cockpit footer) tempts contributors to write situational variants. Once we have multiple wordings, legal review (when it happens) has to verify each one.

**Mitigation:** every disclaimer surface must import `LEASELENS_DISCLAIMER` directly from `src/lib/lease/disclaimer.ts`. No paraphrasing inline. If a surface needs shorter copy (e.g. a single line under a button), add a `LEASELENS_DISCLAIMER_SHORT` constant alongside.

---

## 5. What NOT to change yet

Sprint 16A and the work that follows must NOT do any of the following.

### 5.1 Route migration

- ❌ Move `/` to `/app`
- ❌ Add a separate marketing landing route
- ❌ Add middleware redirects from `/` based on cookie state
- ❌ Split workspace into multiple routes (e.g. `/lease/[id]`)

The brief's explicit decision: `/` remains the full LeaseLens experience.

### 5.2 Core lease-analysis behaviour

- ❌ Change the citation-grounding invariant in `grade_clause_severity` (must validate chunk_id + statute string before returning)
- ❌ Change the `prepare`-step pattern in `draft_negotiation_email`
- ❌ Change the RAG retrieval (vector + BM25 + RRF) or the corpus content
- ❌ Change the severity taxonomy (high / medium / low / ok) or the clause type list
- ❌ Modify the system prompt — UI-side polish only, not model behaviour

### 5.3 Token system replacement

- ❌ Replace Geist + Source Serif 4 with another font pair
- ❌ Replace the warm-neutral palette with a different neutral
- ❌ Replace `#6E5CE6` accent with a different brand colour
- ❌ Remove the dark-mode infrastructure
- ❌ Switch from Tailwind v4 to another styling solution

### 5.4 Dependencies

- ❌ Adopt shadcn/ui
- ❌ Adopt cmdk, headless-ui, or Radix beyond what `motion` already pulls in
- ❌ Replace `motion` with framer-motion (we're on v12 already)
- ❌ Replace `lucide-react` with another icon library
- ❌ Add a heavy diagramming, charting, or animation library

The Sprint 15 brief was clear: no new heavy deps. Sprint 16A's only addition is `next/font/google` Geist + Source Serif 4 + Geist Mono, which are first-party Next.js framework features (not deps).

### 5.5 Cockpit redesign

The cockpit (`/cockpit`) is functional and visually consistent post-Sprint-15.2. It's not the user-facing surface — Reviewer + Admin only — so polish ROI is lower. Sprint 17 + 18 explicitly skip the cockpit unless a token regression appears.

### 5.6 Legal grading rules

- ❌ Change the wording of `LEASELENS_DISCLAIMER`
- ❌ Add new severity levels
- ❌ Change which clause types are considered "high" vs "medium" vs "low" by default
- ❌ Modify the negotiation-email template's tone palette (polite / firm / formal)
- ❌ Add LeaseLens-asserted legal positions ("this clause is illegal") anywhere in the UI

### 5.7 Audit and rollback

- ❌ Change the audit-row schema
- ❌ Change the rollback compensating-action contract
- ❌ Remove the Undo button on mutating ToolCards
- ❌ Allow non-Admin / non-actor users to roll back another user's mutations

---

**End of UI/UX audit.**

The modernization roadmap that addresses these P0-P3 issues lives in [`docs/ui-ux-modernization-plan.md`](ui-ux-modernization-plan.md).
