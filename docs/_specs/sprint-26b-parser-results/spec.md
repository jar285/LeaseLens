# Sprint 26b — Parser-First Results Layout (Mode B)

**Status:** Draft, awaiting human QA.
**Date:** 2026-05-17.
**Branch:** `feature/cockpit` (continuation from Sprint 26a).
**Parent plan:** [agile-hugging-forest plan in ~/.claude/plans/](../../../) — LeaseLens UI Pivot.
**Predecessor:** [Sprint 26a — Parser-First Landing](../sprint-26a-parser-landing/spec.md).

---

## 1. Problem

Sprint 26a delivered Mode A (the parser-first landing). After upload, the user still lands in the legacy three-pane workspace ([LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx)) — chat in the center, PDF on the left, red flags on the right. That post-upload screen still reads as "chat plus side panels," not "parser results."

Sprint 26b promotes the parser results to the visual core: a two-pane results layout where the PDF anchors the left and a stacked results column on the right shows Scan Timeline → Red Flags → Clauses. Chat moves out of the center but stays reachable (mounted temporarily as the bottom card of the results column). Sprint 26c then extracts chat into a Floating Action Button and removes it from the main layout entirely.

The state model needs zero changes — [ChatStreamContext](../../../src/components/chat/ChatStreamContext.tsx) already owns `activeLease`, `toolEvents`, and `activeClauseId`. The new shells are pure consumers. The parser pipeline (POST `/api/leases` → `parsePdf` → `segmentClauses` → `extract_clauses` tool → `grade_clause_severity` tool) is untouched.

---

## 2. Invariants (carried verbatim from the parent plan and Sprint 26a)

1. **`useReducedMotion()` gate is non-negotiable.**
2. **Severity communicated by text + icon/shape + layout, never by color alone.**
3. **`SeverityBadge`, `SEVERITY_BADGE`, `SEVERITY_BAR`, `SEVERITY_LABEL`, `CitationChip`, `GradingDetailBlock`** are reused as-is. No duplicates.
4. **`ChatStreamContext` remains the single source of truth.**
5. **No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.**
6. **Verbatim citation validation in `grade_clause_severity` not weakened.**
7. **Disclaimer renders bold at the end of grading messages.**
8. **Public component surface for unchanged components stays frozen.** `LeaseUploadDropzone`, `PdfViewer`, `RedFlagReport`, `ChatUI`, `ScanTimeline` keep their signatures.
9. **Test count never decreases.** Recorded in `impl-qa.md`.
10. **WCAG AA contrast; visible focus states; ≥ 44×44 touch targets; `prefers-reduced-motion` respected.**
11. **Role-gated progressive disclosure preserved.**
12. **Pure UI sprint** — no schema or tool-contract changes.

---

## 3. Audit (consumers + surface map)

**`<LeaseLensWorkspaceShell>` is mounted from exactly one location:** [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) (the post-upload branch added in 26a). This sprint replaces that branch with `<ParserResultsShell>`. The legacy shell stays in the tree until Sprint 26d's cleanup pass — its tests still cover the same behaviors and we keep it as a fallback during the rollout.

**Components reused by `ParserResultsShell`:**
- [PdfViewer.tsx](../../../src/components/lease/PdfViewer.tsx) — left pane, unchanged.
- [ScanTimeline.tsx](../../../src/components/lease/ScanTimeline.tsx) — promoted into the results column header.
- [RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) — moved from right rail into the results column; same data flow.
- [RedFlagsPaneHeader.tsx](../../../src/components/lease/RedFlagsPaneHeader.tsx) — reused as the Red Flags section header.
- [ResizableSplitLayout.tsx](../../../src/components/layout/ResizableSplitLayout.tsx) — now used in two-pane mode (left + right; no center).
- [ChatUI.tsx](../../../src/components/chat/ChatUI.tsx) — temporarily mounted inside the results column as a third stacked section. Sprint 26c removes it.

**Data shapes (confirmed by exploration of source):**

- `ToolEvent` (from `ChatStreamContext.tsx`): `{ tool_name, input, result, audit_id }`.
- `extract_clauses` result: `{ lease_id, page_count, clauses: Array<{ clause_id, clause_index, clause_type, text, page_number }> }`. `text` truncated to 1200 chars in `src/lib/tools/lease-tools.ts`.
- `grade_clause_severity` result: `GradingResult` from `src/components/lease/grading.ts` — `{ clause_id, clause_type, clause_index, page_number, severity, statute_citation, chunk_id, reasoning, recommended_action }`. Typeguard `isGradingResult`.
- `clauseLabel(g)` returns `"Security deposit · §3"`-style labels from `src/components/lease/grading.ts`.
- `pdfViewerRef.scrollToPage(n)` is the existing PDF jump; the canonical wrap is in `RedFlagReport.tsx` `jumpToClausePage` with a 4000ms highlight clear (`HIGHLIGHT_DURATION_MS`).

**Tests that touch the post-upload layout (must remain green):**

- [tests/e2e/three-pane-shell.spec.ts](../../../tests/e2e/three-pane-shell.spec.ts) — T1 / T2 / T3 / T4 all depend on `data-testid="shell-root"` to confirm the post-upload shell mounted. After this sprint, the post-upload shell is `parser-results-shell`, not `shell-root`. Selectors need updating.
- [tests/e2e/red-flag-interactions.spec.ts](../../../tests/e2e/red-flag-interactions.spec.ts) — works against `red-flag-card` testids inside `RedFlagReport`. The component is reused, so the cards still render; only the surrounding shell changes.
- [tests/e2e/chat-tool-use.spec.ts](../../../tests/e2e/chat-tool-use.spec.ts), [tests/e2e/role-flows.spec.ts](../../../tests/e2e/role-flows.spec.ts), [tests/e2e/stream-control.spec.ts](../../../tests/e2e/stream-control.spec.ts) — all hit chat after upload. Chat remains mounted in 26b inside the results column; these specs should keep working after the helper resolves `shell-root` → either `shell-root` or `parser-results-shell`.

**Resolution**: Update the shared `uploadSampleLease` helper to wait for either `parser-results-shell` (preferred, new) or `shell-root` (legacy, fallback during transition). Sprint 26c later collapses this to one.

---

## 4. Design

### 4a. New components

| Path | Responsibility |
|---|---|
| [src/components/lease/ClausesList.tsx](../../../src/components/lease/ClausesList.tsx) | Standalone list of extracted clauses. Reads `useChatStream().toolEvents`; builds a union of clauses (from `extract_clauses` results) and graded clauses (from `grade_clause_severity` results, when extract is missing or partial). Each row: severity chip (if graded) + clause label + `p. N` + "View in PDF" button. Empty state when nothing is extracted yet. |
| [src/components/lease/ParserResultsShell.tsx](../../../src/components/lease/ParserResultsShell.tsx) | Mode-B composition root. Owns the page header strip (filename · pages · clauses · Replace), the two-pane `ResizableSplitLayout` (PDF on left, results stack on right), and the FAB stub. The right column stacks: `ScanTimeline` → `RedFlagsPaneHeader` + `RedFlagReport` → `ClausesList` → temporary chat slot. Wraps in `ChatStreamProvider` with rehydrated `initialEvents` + `activeLease`. |

### 4b. Modified components

| Path | Change |
|---|---|
| [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) | Post-upload branch routes to `<ParserResultsShell>` instead of `<LeaseLensWorkspaceShell>`. Forwards the same props the legacy shell consumed. |
| [tests/e2e/helpers/upload-sample-lease.ts](../../../tests/e2e/helpers/upload-sample-lease.ts) | Wait for `parser-results-shell` OR `shell-root` (whichever appears first) so the helper works across the transition. Sprint 26d removes the fallback. |
| [tests/e2e/three-pane-shell.spec.ts](../../../tests/e2e/three-pane-shell.spec.ts) | Re-targeted selectors: `shell-root` → `parser-results-shell`; `shell-left-pane[data-left-pane-state="loaded"]` → `results-pdf-pane[data-state="loaded"]`. Same scenarios, new shell. The file is renamed to `results-shell.spec.ts` in Sprint 26d; in 26b the rename stays a follow-up. |

### 4c. Unchanged

- `LeaseUploadDropzone`, `LeaseHeroDropzone`, `ParserLandingShell`, `WorkspaceRouterShell` (Mode A path), `AssistantFab.stub`, `ChatStreamContext` provider, `ChatUI`, `ChatComposer`, `ChatTranscript`, `ChatEmptyState`, all tools (`extract_clauses`, `grade_clause_severity`, `draft_negotiation_email`), `/api/leases`, `/api/chat`.

### 4d. Visual spec

**Results layout** (1024px+):

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (unchanged: LeaseLensMark, NJSA anchor, Live, Theme, RoleSwitcher) │
├──────────────────────────────────────────────────────────────┤
│ 📄 sample-nj-residential-lease.pdf · 18 pages · 13 clauses   │
│                                              [ ↺ Replace ]   │
├──────────────────────┬───────────────────────────────────────┤
│                      │  ┌─────────────────────────────────┐  │
│                      │  │ Scan Timeline                   │  │
│                      │  │ ✓ Reading lease (18 pp)         │  │
│      PDF Viewer      │  │ ✓ Extracting clauses            │  │
│   (focused scroll)   │  │ ⟳ Checking NJ tenant law …      │  │
│                      │  └─────────────────────────────────┘  │
│   page 3 of 18       │                                       │
│   ───────────        │  ┌─────────────────────────────────┐  │
│   [§3 Security …]    │  │ Red flags  3 ●HIGH  2 ●MED  1   │  │
│   …                  │  │ ┌────────────────────────────┐  │  │
│                      │  │ │ [HIGH] §3 Security deposit │  │  │
│                      │  │ │ Two months exceeds NJ's 1. │  │  │
│                      │  │ │ Citation: NJ Stat 46:8-19  │  │  │
│                      │  │ │ [View in PDF]              │  │  │
│                      │  │ └────────────────────────────┘  │  │
│                      │  └─────────────────────────────────┘  │
│                      │                                       │
│                      │  ┌─────────────────────────────────┐  │
│                      │  │ Clauses (13)                    │  │
│                      │  │ ▸ §1 Parties        —           │  │
│                      │  │ ▸ §2 Term           —           │  │
│                      │  │ ▸ §3 Security depos ●HIGH       │  │
│                      │  │ …                               │  │
│                      │  └─────────────────────────────────┘  │
│                      │                                       │
│                      │  ┌─────────────────────────────────┐  │
│                      │  │ Ask LeaseLens (temporary)       │  │
│                      │  │ [ChatTranscript + Composer]     │  │
│                      │  └─────────────────────────────────┘  │
└──────────────────────┴───────────────────────────────────────┘
                                            [💬]  ← FAB stub (Sprint 26c replaces)
```

The "Ask LeaseLens (temporary)" card is the visible-but-demoted chat — same `ChatUI` component, just in a stacked card rather than the center pane. Sprint 26c removes it and wires the FAB.

The header strip's "Replace" affordance resets the active lease (clearing `activeLease` and `toolEvents`) so the user can start over. Implemented via `useChatStream().resetConversation()`.

Below 1024px (mobile): both panes wrap, results column stacks above the PDF. Full mobile polish is Sprint 26d.

### 4e. `ClausesList` row design

Each row is a `<button>` (keyboard reachable) that calls the same `pdfViewerRef.scrollToPage(page)` + `setActiveClauseId` flow that `RedFlagReport` uses. Visual:

```
▸ §3 · Security deposit            ●HIGH    p. 2  [View in PDF]
▸ §4 · Early termination           ●MED     p. 3  [View in PDF]
▸ §5 · Subletting                  —        p. 4  [View in PDF]
```

- "—" placeholder when no grading exists yet (parse complete but grading still streaming, or grading errored).
- Severity chip uses `SeverityBadge size="sm"`.
- Whole row is a `<button>` (semantic, keyboard-reachable). The visible "View in PDF" text is part of the row label, not a nested button (Sprint 26c will add an "Explain" action chip on each row — that becomes a sibling button).

---

## 5. Phases (TDD order)

### Phase 1 — Audit (✅ recorded in §3)

### Phase 2 — `ClausesList`

1. **Red test** — `src/components/lease/ClausesList.test.tsx`:
   - Empty state when `toolEvents` is empty.
   - Renders one row per clause from a synthesized `extract_clauses` event.
   - When a `grade_clause_severity` event is present for a clause, the row shows the severity chip; otherwise "—".
   - Clicking a row calls `pdfViewerRef.scrollToPage(page_number)` and sets `activeClauseId` to the clause's id.
   - Latest-wins for repeated `grade_clause_severity` on the same clause (mirrors `RedFlagReport`).
   - Each row is a real `<button>` (keyboard reachable, `type="button"`).
2. **Green** — implement `ClausesList.tsx` consuming `useChatStream()`.

### Phase 3 — `ParserResultsShell`

1. **Red test** — `src/components/lease/ParserResultsShell.test.tsx`:
   - Mounts inside `ChatStreamProvider` with `initialActiveLease` set.
   - Renders `data-testid="parser-results-shell"`.
   - Left pane (`data-testid="results-pdf-pane"`) mounts `PdfViewer` when activeLease has a `pdfUrl`; falls back to a "reattach" state when the URL is missing (reuse `useLeftPaneState` logic).
   - Right pane (`data-testid="results-stack"`) contains `ScanTimeline`, `RedFlagReport`, `ClausesList`, in order.
   - Header strip (`data-testid="results-header"`) shows filename + meta + Replace button.
   - Renders the temporary chat slot (`data-testid="results-chat-slot"`).
   - Renders the `AssistantFab.stub` (carried from 26a).
   - "Replace" button calls `resetConversation`.
2. **Green** — implement `ParserResultsShell.tsx`.

### Phase 4 — Integration test

1. **Test** — `src/components/lease/ParserResultsShell.integration.test.tsx`:
   - Mounts with rehydrated `initialToolEvents` containing one `extract_clauses` result (3 clauses) plus one `grade_clause_severity` result (HIGH for clause 1).
   - Asserts: `RedFlagReport` renders 1 card, `ClausesList` renders 3 rows including one with the HIGH chip.
   - Asserts: clicking the View in PDF on the HIGH clause row matches the same flow as the red-flag card (sets `activeClauseId` and calls `scrollToPage`).
   - Asserts: `RedFlagReport` and `ClausesList` agree on the same clause/severity (no divergent state).
2. **Implementation already complete** from Phases 2-3; this is a regression-style integration assert.

### Phase 5 — Wire `WorkspaceRouterShell`

1. **Red test** — update `WorkspaceRouterShell.test.tsx`: with `initialActiveLease` provided, expect `parser-results-shell` (the new Mode B), not `shell-root` (the legacy).
2. **Green** — swap the legacy import for `ParserResultsShell` inside the router.

### Phase 6 — Playwright e2e

1. **New spec** — `tests/e2e/parser-results.spec.ts`:
   - Visits `/`, lands on Mode A.
   - Uploads sample lease.
   - Sees `parser-results-shell` mount.
   - Sees `results-pdf-pane[data-state="loaded"]`.
   - Sees `scan-timeline` and `clauses-list` testids.
   - Triggers the e2e mock chat to fire `extract_clauses` so clauses appear in `ClausesList`.
   - Clicks "View in PDF" on a clause row → expects the PDF active-clause ring.
2. **Update existing specs** — `three-pane-shell.spec.ts`, `red-flag-interactions.spec.ts` (if it depends on legacy-shell testids), `chat-tool-use.spec.ts`, `role-flows.spec.ts`, `stream-control.spec.ts` — adjust selectors that pointed at `shell-root` / `shell-left-pane` / `shell-center-pane` / `shell-right-pane` to the new `parser-results-shell` / `results-pdf-pane` / `results-stack` / `results-chat-slot`.

### Phase 7 — Verification

- `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test` all green.

---

## 6. Acceptance criteria

- [ ] `/` with a rehydrated active lease renders `ParserResultsShell` (Mode B). `LeaseLensWorkspaceShell` is no longer reached from `src/app/page.tsx`.
- [ ] PDF on the left; Scan Timeline + Red Flags + Clauses + temporary chat slot on the right.
- [ ] `ClausesList` shows one row per extracted clause with severity chip when graded.
- [ ] "View in PDF" works from both `RedFlagReport` cards and `ClausesList` rows. Both sets the active-clause highlight + scrolls the PDF.
- [ ] Header strip "Replace" affordance resets the conversation (clears `activeLease` and `toolEvents` so Mode A returns).
- [ ] `AssistantFab.stub` still visible in `bottom-6 right-6`.
- [ ] All new components colocated with passing `*.test.tsx` files; integration test for the shell green.
- [ ] `tests/e2e/parser-results.spec.ts` passes.
- [ ] Existing e2e specs updated and green.
- [ ] Test count post-sprint ≥ pre-sprint baseline.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test` all green.

---

## 7. Out of scope

- **Real FAB.** Sprint 26c. The stub stays.
- **Removing the temporary chat slot from `ParserResultsShell`.** Sprint 26c.
- **Mobile polish.** Sprint 26d.
- **`LeaseLensWorkspaceShell` deletion.** Sprint 26d. It stays in the tree so any spec that imports it directly (none currently, but defensively) doesn't error.
- **`Explain` / `Draft email` actions on clause rows and red-flag cards.** Sprint 26c — they depend on the FAB.
