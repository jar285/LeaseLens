# Sprint 26c — Assistant FAB Extraction

**Status:** Shipped on main (Sprint 26c, 2026-05-17).
**Date:** 2026-05-17.
**Branch:** `feature/cockpit` (continuation from Sprint 26b).
**Parent plan:** [agile-hugging-forest plan in ~/.claude/plans/](../../../) — LeaseLens UI Pivot.
**Predecessors:** [26a — Parser-First Landing](../sprint-26a-parser-landing/spec.md), [26b — Parser-First Results](../sprint-26b-parser-results/spec.md).

---

## 1. Problem

Sprint 26b promoted the parser results to the visual core, but the chat assistant still lives as a stacked card inside `ParserResultsShell`'s right column (the "Ask LeaseLens (temporary)" slot). That card competes for attention with the Red Flags and Clauses sections, and it's still a heavy bundle on the main route.

Sprint 26c moves chat into a Floating Action Button:

- A small pill anchors the bottom-right of every layout. Click → quick-action menu. Click an action → drawer with the full chat (transcript + composer).
- Red-flag cards and clause rows gain "Explain" and "Draft email" affordances that open the FAB drawer with the prompt pre-filled and the clause as context.
- The temporary chat slot is removed. The main layout no longer mounts `ChatComposer` or `ChatTranscript` directly.
- The FAB component is dynamically imported (`next/dynamic` with `ssr: false`) so its bundle loads on first open, not on landing.

The chat NDJSON envelope, tool registry, and `/api/chat` route are unchanged.

---

## 2. Invariants (carried verbatim from the parent plan and earlier sub-sprints)

1. **`useReducedMotion()` gate is non-negotiable.** FAB open/close animation is skipped when `prefers-reduced-motion: reduce`.
2. **Severity communicated by text + icon/shape + layout, never by color alone.**
3. **Existing `SeverityBadge`, `CitationChip`, `GradingDetailBlock`, `ScanTimeline`, `RedFlagReport`, `ClausesList`** are reused. The new wiring on red-flag cards and clause rows is **additive** — existing tests stay green.
4. **`ChatStreamContext` remains the single source of truth.** The FAB consumes it; it does not fork.
5. **No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.**
6. **Verbatim citation validation in `grade_clause_severity` not weakened.**
7. **Disclaimer renders bold at the end of grading messages.**
8. **Public component surface for unchanged components stays frozen.** `LeaseUploadDropzone`, `PdfViewer`, `ChatUI` keep their props; the only addition is an optional `initialComposerText?: string` on `ChatUI` (and its forwarded `ChatComposer.initialText`) so the FAB can pre-fill the textarea on open.
9. **Test count never decreases.** Recorded in `impl-qa.md`.
10. **WCAG AA contrast; visible focus states; ≥ 44×44 touch targets; `prefers-reduced-motion` respected.** Drawer is `aria-modal`, focus-trapped, Escape-dismissable.
11. **Role-gated progressive disclosure preserved.** The FAB drawer renders ChatUI which already honors role-gated tool rendering.
12. **Pure UI sprint** — chat NDJSON envelope and `/api/chat` request/response shapes do not change.

---

## 3. Audit (consumers + surface map)

**Components that need updating:**

- [src/components/lease/ParserResultsShell.tsx](../../../src/components/lease/ParserResultsShell.tsx) — replace `<AssistantFabStub />` with the real `<AssistantFab />` (dynamic). Delete the inline `<ChatSlot>` and `<ChatUI>` mount. The `pushToolEvent` handler moves into the FAB's ChatUI wrapper because tool events still need to land in `ChatStreamContext`.
- [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) — each card gains "Explain" + "Draft email" buttons that fire `useAssistantFab().openWith(...)` with a clause-specific prompt.
- [src/components/lease/ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) — each row gains an "Explain" affordance (small button at the end of the row) that opens the FAB with the clause as context.
- [src/components/chat/ChatUI.tsx](../../../src/components/chat/ChatUI.tsx) — adds optional `initialComposerText?: string` that forwards to `ChatComposer`.
- [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx) — adds optional `initialText?: string` used to seed local textarea state on mount.

**Components to delete (clean-up at end of sprint):**

- [src/components/chat/AssistantFab.stub.tsx](../../../src/components/chat/AssistantFab.stub.tsx) + its test — replaced wholesale by the real FAB.

**Specs that depend on the in-layout chat composer:**

- `tests/e2e/chat-tool-use.spec.ts` — currently locates the composer via `getByRole('textbox')`. After 26c, the composer is inside the FAB drawer; the spec must open the FAB first.
- `tests/e2e/stream-control.spec.ts` T7 — same.
- `tests/e2e/three-pane-shell.spec.ts` T1, T2, T3, T4 — T1 fills the chat textbox; T3/T4 need a chat message to bind `active_lease_id`. All four need to open the FAB before chat.
- `tests/e2e/role-flows.spec.ts` T15 — uses `new-conversation-btn` (chat-toolbar internal). After 26c the toolbar lives inside the drawer.
- `tests/e2e/red-flag-interactions.spec.ts` — interacts with red-flag cards only; the new "Explain" / "Draft email" buttons are additive (the existing toggle + jump-to-page buttons stay). Spec doesn't strictly need updates, but new tests cover the new buttons.

---

## 4. Design

### 4a. New components

| Path | Responsibility |
|---|---|
| [src/components/chat/AssistantFabContext.tsx](../../../src/components/chat/AssistantFabContext.tsx) | Provider + `useAssistantFab()` hook. Owns FAB state machine (`closed`/`menu`/`drawer`), the pending prompt, and the selected-clause context. Exposes `open()`, `openMenu()`, `openWith({ initialPrompt, clauseId?, severity?, statuteCitation? })`, `close()`. |
| [src/components/chat/AssistantFab.client.tsx](../../../src/components/chat/AssistantFab.client.tsx) | The real implementation. Renders the closed pill, the quick-action menu chips, and the drawer (mounting `ChatUI`). Reads state from `useAssistantFab()`. Focus trap via a `<dialog>` element; Escape closes; reduced-motion guard. |
| [src/components/chat/AssistantFab.tsx](../../../src/components/chat/AssistantFab.tsx) | Thin wrapper: `next/dynamic(() => import('./AssistantFab.client'), { ssr: false })`. Keeps the heavy chat bundle out of the landing-page initial-load chunk. |

### 4b. Modified components

| Path | Change |
|---|---|
| [src/components/lease/ParserResultsShell.tsx](../../../src/components/lease/ParserResultsShell.tsx) | Wrap subtree in `<AssistantFabProvider>`. Remove `<ChatSlot>` (the temporary chat card) and its `handleToolEvent` plumbing. Replace `<AssistantFabStub />` with `<AssistantFab />` (dynamic). The FAB mounts ChatUI internally with `onToolEvent={pushToolEvent}` so streaming continues to land in `ChatStreamContext`. |
| [src/components/lease/ParserLandingShell.tsx](../../../src/components/lease/ParserLandingShell.tsx) | Same: wrap in `<AssistantFabProvider>`, swap stub for real FAB. The drawer on the landing page has no active lease, so the "Explain this clause" chip is disabled; the "What does LeaseLens do?" chip is enabled. |
| [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | Add Explain + Draft email buttons on each expanded card. Wire to `useAssistantFab().openWith(...)` with clause-specific prompt copy that references the citation + severity. |
| [src/components/lease/ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) | Each row gets a small "Explain" affordance (icon button at the right) wired the same way. The row's primary action remains "scroll PDF to page" via the whole-row button. |
| [src/components/chat/ChatUI.tsx](../../../src/components/chat/ChatUI.tsx) | New optional prop `initialComposerText?: string` forwarded to `ChatComposer`. |
| [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx) | New optional prop `initialText?: string` used as the initial value of the textarea state. |

### 4c. Deleted

- `src/components/chat/AssistantFab.stub.tsx`
- `src/components/chat/AssistantFab.stub.test.tsx`

### 4d. FAB state machine

```
                  ┌───────────────────────────────────────┐
                  │ closed: only the pill is visible      │
                  └────────────────┬──────────────────────┘
                                   │ click pill
                                   ▼
                  ┌───────────────────────────────────────┐
                  │ menu: quick-action chips fan out      │
                  └────────────────┬──────────────────────┘
                                   │ click chip (or Explain/Draft email on a card/row)
                                   ▼
                  ┌───────────────────────────────────────┐
                  │ drawer: ChatUI mounted with prefill   │
                  │  - Escape / X / backdrop click closes │
                  └────────────────┬──────────────────────┘
                                   │ close
                                   ▼
                                closed
```

Direct transition: `openWith(...)` jumps from any state into `drawer` (skipping `menu`).

### 4e. Quick-action chips (in `menu` state)

Four contextual chips, in this order:

1. **Explain this clause** — enabled only when `activeClauseId` is set on `ChatStreamContext`. Pre-fills: `"Explain the highest-risk concern with the clause I'm looking at and cite the supporting NJ statute verbatim."`
2. **Draft a negotiation email** — enabled only after at least one grading event. Pre-fills: `"Draft a polite negotiation email to the landlord about the most concerning clause."`
3. **Summarize lease risks** — enabled only after at least one grading event. Pre-fills: `"Summarize the red flags in this lease in plain English."`
4. **Help me understand a citation** — always enabled. Pre-fills: `"How do I read an NJ statute citation like NJ Stat 46:8-19?"`

Sources: prompts are derived from `src/lib/chat/follow-up-prompts.ts` (`SCAN_COMPLETE_PROMPTS`); the exact mapping is documented inline in `AssistantFab.client.tsx`.

### 4f. Drawer dimensions

- Default: `min(440px, 100vw)` wide × `min(560px, 60vh)` tall, anchored bottom-right with `right: 24px; bottom: 24px`.
- The drawer renders inside a `<dialog>` element for built-in focus-trap and Escape semantics.
- Reduced-motion: open animation is skipped (instant mount); close is instant too.
- `aria-modal`, `aria-labelledby` pointing at the drawer header.

### 4g. Card / clause-row action wiring

- **Red-flag card** "Explain" button: `useAssistantFab().openWith({ initialPrompt: explainPromptFor(grading), clauseId: grading.clause_id, severity: grading.severity, statuteCitation: grading.statute_citation })`.
- **Red-flag card** "Draft email" button: `openWith({ initialPrompt: draftPromptFor(grading), clauseId: ..., severity: ..., statuteCitation: ... })`. Where the prompt template is:
  - Explain: `"Explain the {severity} concern with clause §{n} ({clauseLabel}). Reference {statuteCitation} verbatim."`
  - Draft email: `"Draft a polite negotiation email to the landlord about clause §{n} ({clauseLabel}). Cite {statuteCitation}."`
- **Clauses list** row "Explain" button (icon-only, with `aria-label`): `openWith({ initialPrompt: explainPromptForClause(clause), clauseId: clause.clause_id })`. Prompt: `"Explain clause §{n} ({clauseLabel}) in plain English."`

These calls set the FAB state to `drawer`, set `pendingPrompt`, and trigger the ChatUI mount with the prefill.

---

## 5. Phases (TDD order)

### Phase 1 — `AssistantFabContext`

1. Red test — `src/components/chat/AssistantFabContext.test.tsx`:
   - Default state is `closed`.
   - `openMenu()` → `menu`.
   - `openWith({ initialPrompt })` → `drawer` and `pendingPrompt` is set.
   - `close()` returns to `closed` and clears `pendingPrompt`.
   - `useAssistantFab()` throws when called outside the provider.
   - Selection (`clauseId`, `severity`, `statuteCitation`) is exposed when set via `openWith`.
2. Green — implement.

### Phase 2 — `ChatComposer.initialText` + `ChatUI.initialComposerText`

1. Red tests — update `ChatComposer.test.tsx` (if present; otherwise add a small test) to assert: when `initialText` is provided, the textarea reflects it on mount; Submit drains the textarea normally.
2. Green — add the prop + thread through `ChatUI`.

### Phase 3 — `AssistantFab.client`

1. Red test — `src/components/chat/AssistantFab.client.test.tsx`:
   - Renders a closed pill with `aria-label="Open assistant"`.
   - Clicking the pill transitions to `menu` (quick-action chips visible).
   - Clicking a quick-action chip transitions to `drawer` and pre-fills the composer.
   - Drawer renders ChatUI; Escape closes; focus returns to the trigger.
   - Reduced-motion bypass: when `useReducedMotion` returns true, no motion variants are applied (no `motion.div`).
2. Green — implement.

### Phase 4 — Card / row action wiring

1. Red tests:
   - `RedFlagReport.test.tsx` — clicking the new Explain button calls `useAssistantFab().openWith` with the right clause_id + statute citation + severity.
   - `ClausesList.test.tsx` — clicking the row's new Explain icon button calls `openWith` with clause_id + clause label.
2. Green — add the buttons; thread them through.

### Phase 5 — `ParserResultsShell` / `ParserLandingShell` rewire

1. Red tests:
   - `ParserResultsShell.test.tsx` — `data-testid="results-chat-slot"` is no longer in the DOM; the AssistantFab pill is mounted; the temporary chat heading is gone.
   - `ParserLandingShell.test.tsx` — Mode A also mounts the real FAB; the stub testid (`assistant-fab-stub`) is gone.
2. Green — swap providers + components; delete the stub + its test.

### Phase 6 — Integration test

1. `AssistantFab.integration.test.tsx` — mount the FAB inside an `AssistantFabProvider` + `ChatStreamProvider`, call `openWith({ initialPrompt: "Test prompt" })`, find the drawer's textarea, assert the prefill, dispatch a fake submit, assert `onToolEvent` (mocked) is called as the NDJSON stream rolls.

### Phase 7 — Playwright

1. New `tests/e2e/fab-assistant.spec.ts`:
   - Upload a sample lease → wait for results shell.
   - Click FAB pill → quick-action chips appear → click "Summarize lease risks" → drawer opens with prefill.
   - Submit → assistant streams a reply inside the drawer.
   - Press Escape → drawer closes; pill is focused.
   - Click a red-flag card's "Explain" → drawer opens with a clause-specific prompt.
2. Update existing chat-dependent specs to open the FAB drawer before interacting with the composer:
   - `chat-tool-use.spec.ts`
   - `stream-control.spec.ts` T7
   - `three-pane-shell.spec.ts` T1, T3, T4
   - `role-flows.spec.ts` T15

### Phase 8 — Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test` all green.

---

## 6. Acceptance criteria

- [ ] No `ChatComposer` or `ChatTranscript` mounted in the main layout. Both live exclusively inside the FAB drawer.
- [ ] The FAB pill is keyboard-reachable from any layout; Escape closes the drawer; focus returns to the pill.
- [ ] "Explain" on every red-flag card opens the FAB drawer with a clause-specific prompt referencing the citation + severity.
- [ ] "Draft email" on every red-flag card opens the FAB drawer with a draft-email prompt referencing the clause.
- [ ] "Explain" on every clause row opens the FAB drawer with a clause-specific prompt.
- [ ] FAB drawer is `aria-modal`, focus-trapped, Escape-dismissable, reduced-motion-safe.
- [ ] `AssistantFab.stub` deleted (file + colocated test); `assistant-fab-stub` testid no longer present.
- [ ] All new components have passing colocated tests + the integration test passes.
- [ ] Playwright suite green including `fab-assistant.spec.ts`.
- [ ] Existing chat-dependent specs updated to drive chat via the FAB.
- [ ] Test count post-sprint ≥ pre-sprint baseline.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test` all green.

---

## 7. Out of scope

- **Mobile polish.** Sprint 26d.
- **`LeaseLensWorkspaceShell` deletion.** Sprint 26d.
- **Bundle delta measurement.** Sprint 26d runs the build once for the combined report.
- **Lighthouse / axe a11y audit.** Sprint 26d.
- **FAB "expand to full-right-sheet" affordance.** The drawer at default dimensions is enough for 26c; the optional full-sheet mode lands in 26d if it earns its keep.
