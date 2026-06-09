# Sprint 26a — Parser-First Landing (Mode A)

**Status:** Shipped on main (Sprint 26a, 2026-05-17).
**Date:** 2026-05-17.
**Branch:** `feature/cockpit` (continuation; will branch to `feature/parser-first` if PR scoping requires).
**Parent plan:** [agile-hugging-forest plan in ~/.claude/plans/](../../../) — LeaseLens UI Pivot.

---

## 1. Problem

The current LeaseLens homepage is a chat-first three-pane workspace. New users land in [src/components/chat/ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx) — a hero serif headline ("Find what to negotiate, before you sign") wrapped around four prompt cards that all feed `onSelectPrompt(prompt)` → the chat composer. The PDF dropzone sits as a small left-rail affordance. The visual reading is "a chatbot that happens to accept PDFs."

We are pivoting LeaseLens to read as "a PDF parser that happens to have an assistant." Sprint 26a delivers **Mode A only** — the pre-upload landing experience. Post-upload still uses the existing three-pane shell; that swap is Sprint 26b. The FAB is a stub in this sprint; the real assistant lands in Sprint 26c.

Why this sprint, in this order:

- Landing is what every new visitor sees. Shipping Mode A first delivers the headline product-identity change with the smallest blast radius.
- The post-upload three-pane shell continues working unchanged — existing tests and existing users with a rehydrated conversation see no regression.
- The new shells need a router (`WorkspaceRouterShell`) to choose between them; building that router now means Sprint 26b only needs to add the second branch.

---

## 2. Invariants (carried verbatim from the parent plan)

1. **`useReducedMotion()` gate is non-negotiable.** Every new animation has the gate; reduced-motion renders plain DOM, not `duration: 0`.
2. **Severity is communicated by text + icon/shape + layout, never by color alone.** N/A in this sprint but preserved.
3. **`SeverityBadge`, `SEVERITY_BADGE`, `SEVERITY_BAR`, `SEVERITY_LABEL`, `CitationChip`, `GradingDetailBlock`** are reused as-is. No duplicates.
4. **`ChatStreamContext` remains the single source of truth** for `activeLease`, `toolEvents`, `activeClauseId`. New surfaces consume; do not fork.
5. **No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.** Pure UI recomposition.
6. **Verbatim citation validation in `grade_clause_severity` not weakened.**
7. **Disclaimer renders bold at the end of grading messages.**
8. **Public component surface for unchanged components stays frozen.** `LeaseUploadDropzone`, `PdfViewer`, `RedFlagReport`, `ChatUI` exports, paths, and props are unchanged.
9. **Test count never decreases.** Pre-sprint baseline recorded in `impl-qa.md`.
10. **WCAG AA contrast; visible focus states; ≥ 44×44 touch targets; `prefers-reduced-motion` respected.**
11. **Role-gated progressive disclosure preserved** — Tenant / Reviewer / Admin distinctions intact.
12. **Pure UI sprint** — chat NDJSON envelope, `extract_clauses` / `grade_clause_severity` / `draft_negotiation_email` schemas, and `/api/leases` request/response shapes do not change.

---

## 3. Audit (consumers + surface map)

Before any code, the following are confirmed via repo grep and the parent plan's exploration:

**`<LeaseLensWorkspaceShell>` is mounted from exactly one location:**

- [src/app/page.tsx](../../../src/app/page.tsx) line ~201, with these props: `key={workspace.id}`, `initialMessages`, `conversationId`, `workspaceName`, `viewerRole`, `initialToolEvents`, `initialActiveLease`.

**`<ChatEmptyState>` is referenced from:**

- [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) — rendered when `messages.length === 0`. This stays as the chat's own empty state for post-upload (and for the FAB drawer when chat history is empty). The landing's hero copy + trust strip + disclaimer migrate into `ParserLandingShell`; the four prompt cards are removed from the landing path (they become FAB quick-actions in Sprint 26c, sourced from the existing `follow-up-prompts.ts`).

**Tests that touch the workspace shell:**

- [tests/e2e/three-pane-shell.spec.ts](../../../tests/e2e/three-pane-shell.spec.ts) — still passes in 26a (Mode B is unchanged; the post-upload branch in `WorkspaceRouterShell` still mounts `LeaseLensWorkspaceShell`).
- [tests/e2e/workspace-onboarding.spec.ts](../../../tests/e2e/workspace-onboarding.spec.ts) — still passes for the same reason.

**Tests that touch the chat empty state:**

- ChatEmptyState has no colocated `*.test.tsx` (verified by repo listing). Its rendering is exercised indirectly via the chat e2e specs. No tests break by removing the empty state from the landing path.

**Pre-sprint test count baseline:** captured in `impl-qa.md` at the start of the sprint via `pnpm test --reporter=verbose | tail -3` and `pnpm playwright test --list | wc -l`.

---

## 4. Design

### 4a. New components

| Path | Responsibility |
|---|---|
| [src/components/lease/LeaseHeroDropzone.tsx](../../../src/components/lease/LeaseHeroDropzone.tsx) | Hero-sized presentational wrapper around the existing `LeaseUploadDropzone`. Owns the editorial headline ("Find what to negotiate, before you sign"), the subhead, and a quiet trust-strip below the dropzone. Pure rendering — no upload logic of its own; delegates to `LeaseUploadDropzone` for file handling. |
| [src/components/lease/ParserLandingShell.tsx](../../../src/components/lease/ParserLandingShell.tsx) | Mode-A composition root. Mounts: `LeaseHeroDropzone` (centered, max-width), a 5-step flow strip below ("Upload → Parse → Extract → Flag → Review"), the trust-metric strip, the disclaimer card, and the FAB mount slot. Wraps everything in `ChatStreamProvider` so the FAB can dispatch into the same context downstream sprints will use. |
| [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) | Pure client-side switch. If `initialActiveLease == null`, renders `ParserLandingShell`. Otherwise renders the existing `LeaseLensWorkspaceShell` (unchanged). Forwards all other props (`initialMessages`, `conversationId`, `workspaceName`, `viewerRole`, `initialToolEvents`). |
| [src/components/chat/AssistantFab.stub.tsx](../../../src/components/chat/AssistantFab.stub.tsx) | Stub for Sprint 26c's real FAB. Renders a closed 56×56 pill in `bottom-6 right-6` with `aria-label="Open assistant"`. Clicking it console-logs a TODO. Keyboard-reachable; reduced-motion-safe. Replaced wholesale by the real `AssistantFab` in Sprint 26c. |

### 4b. Modified components

| Path | Change |
|---|---|
| [src/app/page.tsx](../../../src/app/page.tsx) | Replace `<LeaseLensWorkspaceShell ... />` (line ~201) with `<WorkspaceRouterShell ... />`. Identical prop forwarding. Header above stays unchanged. |

### 4c. Unchanged

- `LeaseUploadDropzone`, `ChatEmptyState` (still used by `ChatTranscript`), `LeaseLensWorkspaceShell` (still used by router shell post-upload branch), `ChatStreamContext` provider.

### 4d. Visual spec

**Landing layout** (1024px+):

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER (unchanged: LeaseLensMark, NJSA anchor, Live, Theme, RoleSwitcher) │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│         [eyebrow] WORKSPACE NAME                             │
│         [badge]  LeaseLensMark                               │
│                                                              │
│         Find what to **negotiate**, before you sign.         │
│         (serif, 700wt, italic on "negotiate" via the         │
│         loaded italic face)                                  │
│                                                              │
│         Drop your NJ residential lease. We'll parse it,      │
│         extract clauses, and flag terms that may deserve a   │
│         closer look.                                         │
│                                                              │
│         ┌────────────────────────────────────────────────┐   │
│         │   (LeaseUploadDropzone, hero-sized)            │   │
│         │   Drop your NJ residential lease here          │   │
│         │   or click to browse                           │   │
│         │   PDF · up to 10 MB · text-layer required      │   │
│         └────────────────────────────────────────────────┘   │
│                                                              │
│         Upload → Parse → Extract clauses → Flag risks → Review│
│         (flow strip — small, mono caps, separators)          │
│                                                              │
│         01 · 15+ clauses checked    02 · Every flag cites NJSA│
│         03 · Plain-English explanations                      │
│                                                              │
│         [disclaimer card with Info icon]                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                                            [💬]  ← FAB stub (closed pill, bottom-6 right-6)
```

**Below 1024px**: same vertical stack, but max-width drops to `max-w-md`. The FAB target stays ≥ 44×44 with safe-area-inset padding (true mobile-friendliness is Sprint 26d; 26a just ensures the layout doesn't break).

**Reused visual tokens**: all from the existing design system — `font-serif`, `font-mono` (Geist Mono), `text-fg-default`, `text-fg-muted`, `text-fg-subtle`, `bg-surface-base`, `bg-surface-card`, accent palette. No new tokens, no new color values.

### 4e. Flow strip copy + accessibility

Five stages, equal width on wide viewports, wrap on narrow:

```
Upload  →  Parse  →  Extract clauses  →  Flag risks  →  Review
```

- Each stage is a `<span>` (not a button) — purely informational.
- Separators are `<span aria-hidden="true">→</span>` for visual; screen readers read the stage text only.
- Mono caps, low-contrast (`text-fg-subtle`), tracking `tracking-[0.14em]`.

---

## 5. Phases (TDD order)

Each phase: red test commit → implementation commit. CI runs `pnpm test` so the cadence is verifiable from `git log`.

### Phase 1 — Audit (✅ already complete; recorded in §3 above)

### Phase 2 — `LeaseHeroDropzone`

1. **Red test** — `src/components/lease/LeaseHeroDropzone.test.tsx`:
   - Renders the headline ("find what to negotiate") and subhead.
   - Mounts an inner `LeaseUploadDropzone` (asserted by its existing `data-testid="lease-upload-dropzone"`).
   - Forwards `onUploaded` to the inner dropzone.
   - Has `data-testid="lease-hero-dropzone"` on the root section.
   - No chat composer in the DOM (asserts `data-testid="chat-composer"` is absent).
2. **Green** — implement `LeaseHeroDropzone.tsx`.

### Phase 3 — `ParserLandingShell`

1. **Red test** — `src/components/lease/ParserLandingShell.test.tsx`:
   - Renders `<LeaseHeroDropzone>`.
   - Renders the flow strip with 5 stages ("Upload", "Parse", "Extract clauses", "Flag risks", "Review").
   - Renders the trust-metric strip (3 metrics).
   - Renders the disclaimer (`LEASELENS_DISCLAIMER`).
   - Renders a FAB mount with `data-testid="assistant-fab-stub"`.
   - No `ChatComposer` in the DOM (`getByTestId('chat-composer')` throws).
   - Wraps children in `ChatStreamProvider` (asserted indirectly: a child consuming `useChatStream` does not throw).
2. **Green** — implement `ParserLandingShell.tsx`.

### Phase 4 — `WorkspaceRouterShell`

1. **Red test** — `src/components/lease/WorkspaceRouterShell.test.tsx`:
   - With `initialActiveLease == null`, renders `ParserLandingShell` (asserted by `data-testid="parser-landing-shell"`).
   - With `initialActiveLease != null` (a minimal `ActiveLeaseRef`), renders `LeaseLensWorkspaceShell` (asserted by `data-testid="shell-root"` from `ResizableSplitLayout`).
   - Forwards `workspaceName`, `viewerRole`, `initialMessages`, `conversationId`, `initialToolEvents` unchanged.
2. **Green** — implement `WorkspaceRouterShell.tsx`.

### Phase 5 — Wire into `src/app/page.tsx`

1. **Red check** — existing tests that hit `/` with no active lease should fail because they expected the old chat empty state copy. (If none exist, this step is a no-op; the Playwright spec below acts as the red gate.)
2. **Green** — swap the JSX in `src/app/page.tsx`.

### Phase 6 — `AssistantFab.stub`

1. **Red test** — `src/components/chat/AssistantFab.stub.test.tsx`:
   - Renders a `<button>` with `aria-label="Open assistant"` and `data-testid="assistant-fab-stub"`.
   - Is positioned `fixed` bottom-right.
   - Click handler is invoked on click (asserted via `vi.fn` spy passed through).
   - Has `type="button"` (not implicit submit).
2. **Green** — implement `AssistantFab.stub.tsx`.

### Phase 7 — Playwright e2e

1. **Red spec** — `tests/e2e/parser-landing.spec.ts`:
   - Visits `/`.
   - Sees the hero headline ("Find what to negotiate").
   - Does NOT see the chat composer (`data-testid="chat-composer"` absent).
   - Uploads a PDF using `tests/e2e/helpers/upload-sample-lease.ts` (helper introduced in this sprint, reused by 26b/c/d).
   - After upload, the post-upload three-pane shell appears (`data-testid="shell-root"` present). This validates the router shell's branching.
2. **Green** — already passes after Phase 5; the spec just witnesses it.

---

## 6. Acceptance criteria

- [ ] `/` with no rehydrated active lease renders `ParserLandingShell`. No `ChatComposer` in the DOM.
- [ ] Hero headline preserved: "Find what to negotiate, before you sign." (italic on "negotiate")
- [ ] Hero dropzone is the visual focus (≥ 50% of fold height on 1024px viewport).
- [ ] Uploading a PDF transitions to the existing three-pane shell (Mode B is unchanged in this sprint).
- [ ] `AssistantFab.stub` is visible in `bottom-6 right-6` on the landing page, keyboard-reachable, `aria-label="Open assistant"`.
- [ ] All new components colocated with passing `*.test.tsx` files.
- [ ] `tests/e2e/parser-landing.spec.ts` passes.
- [ ] `pnpm test` — green.
- [ ] `pnpm typecheck` — green.
- [ ] `pnpm lint` — green (biome).
- [ ] Test count post-sprint ≥ pre-sprint baseline.

---

## 7. Out of scope (explicit non-goals)

- **No mobile redesign.** Layout collapses gracefully but full mobile is Sprint 26d.
- **No real FAB.** The stub button does not open chat; that's Sprint 26c.
- **No Mode B changes.** The existing three-pane shell is untouched.
- **No chat empty-state deletion.** `ChatEmptyState` remains for use by `ChatTranscript` (chat's own empty state for when no messages exist in a conversation).
- **No `/api/leases` changes.** Pure UI.
- **No new dependencies.** Existing `motion`, `lucide-react`, `next/font` cover all needs.
