# Sprint 26b — Spec QA

Spec review checklist. Resolved before implementation begins.

## Clarity
- [x] Problem statement names the user-visible change (post-upload chat-first → results-first).
- [x] Invariants enumerated and carried verbatim from the parent plan and Sprint 26a.
- [x] Audit lists every current consumer of components being changed.
- [x] Design includes a visual ASCII diagram + a per-component change table.
- [x] Phases are ordered red-test-before-implementation.

## Contracts
- [x] No new external dependencies introduced.
- [x] No route / API / schema changes.
- [x] Tool result shapes (`extract_clauses`, `grade_clause_severity`) are reused, not redefined.
- [x] `pdfViewerRef.scrollToPage(n)` + `setActiveClauseId` pattern reused from `RedFlagReport`.

## Risks identified
- **Risk**: 5 existing Playwright specs target `data-testid="shell-root"`. Swapping to `parser-results-shell` breaks them.
  - **Mitigation**: Update them in Phase 6. The `uploadSampleLease` helper accepts either testid during the transition so dependent specs don't have to land all at once.
- **Risk**: `ClausesList` needs to union clauses from `extract_clauses` AND `grade_clause_severity` (test seeds in `red-flag-interactions.spec.ts` use only gradings — no `extract_clauses` event).
  - **Mitigation**: Union logic explicit in `ClausesList` spec §4e. Verified against seed data shape.
- **Risk**: The temporary chat slot inside `ParserResultsShell` may cause layout-flicker between 26b and 26c. Sprint 26c yanks it out.
  - **Mitigation**: Mount chat inside a clearly-labelled `data-testid="results-chat-slot"` so 26c can grep + remove it cleanly. Card header reads "Ask LeaseLens (temporary)" so it's visually communicated as transitional.
- **Risk**: `useLeftPaneState` couples the dropzone → viewer transition. Mode B's PDF column needs the "loaded" / "restoring" / "reattach" branches; we don't want to fork the state machine.
  - **Mitigation**: Reuse `useLeftPaneState` directly inside `ParserResultsShell` — no fork.

## Open questions
(none)
