# Sprint 23d — Risk Radar — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 5. TDD-driven where the change is testable in jsdom (markup, severity-to-icon mapping, severity-sort assertions, example-preview presence).

---

## Phase 0 — Pre-flight

1. `git status` clean apart from `handoff.md` (untracked) and `docs/_specs/sprint-23d-*` (just created).
2. Baseline: `npm test` (expect 780/780), `npm run lint` (0 errors), `npm run build`.
3. Re-read [RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx), [RedFlagsPaneHeader.tsx](../../../src/components/lease/RedFlagsPaneHeader.tsx), [RedFlagSkeletonCard.tsx](../../../src/components/lease/RedFlagSkeletonCard.tsx), [grading.ts](../../../src/components/lease/grading.ts) end-to-end.

## Phase 1 — `SeverityBadge` primitive (new)

**Files touched:**
- NEW: [src/components/lease/SeverityBadge.tsx](../../../src/components/lease/SeverityBadge.tsx)
- NEW: [src/components/lease/SeverityBadge.test.tsx](../../../src/components/lease/SeverityBadge.test.tsx)

**TDD red-green:**

1. RED — write `SeverityBadge.test.tsx` from scratch:
   - Renders an `aria-hidden` icon for each severity (high → AlertOctagon, medium → AlertTriangle, low → Info, ok → CheckCircle).
   - Renders the label text from `SEVERITY_LABEL`.
   - Pill uses `SEVERITY_BADGE[severity]` background+text classes.
   - `size="sm"` produces a smaller pill (e.g. `text-[10px]` vs `text-[11px]`); default is `md`.
   - The icon is rendered with `aria-hidden="true"` (semantic info already carried by the text label).
2. RED — confirm all assertions fail (file doesn't exist).
3. GREEN — implement `SeverityBadge.tsx` as a pure functional component. Use lucide icons; consume `SEVERITY_LABEL` + `SEVERITY_BADGE` from `grading.ts`.
4. REFACTOR — run the test file; all tests pass.

**Verification:** new test file passes. No other test files affected.

## Phase 2 — `RedFlagReport` consumes `SeverityBadge`

**Files touched:** [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx), [src/components/lease/RedFlagReport.test.tsx](../../../src/components/lease/RedFlagReport.test.tsx).

**TDD red-green:**

1. RED — extend `RedFlagReport.test.tsx`:
   - When at least one HIGH-severity grading is in scope, each `red-flag-card` contains a `data-testid="severity-badge"` element (rendered by SeverityBadge) instead of a plain text pill.
   - When the summary row is visible (post-scan, gradings > 0), it contains one `data-testid="severity-badge"` per non-zero severity (e.g. 2 badges if high + medium counts > 0). The badges are `size="sm"`.
2. GREEN — swap the inline severity-pill `<span>` in the card header for `<SeverityBadge severity={g.severity} size="md" />`. Swap the inline dot-text pairs in the summary row for `<SeverityBadge severity={s} size="sm" />`. Keep the count text alongside.
3. REFACTOR — verify severity-sort still works (HIGH cards first). Verify AnimatePresence enter/exit on lease swap.

**Verification:** existing red-flag tests pass. New badge-presence assertions pass.

## Phase 3 — `RedFlagSkeletonCard` mirrors new hierarchy

**Files touched:** [src/components/lease/RedFlagSkeletonCard.tsx](../../../src/components/lease/RedFlagSkeletonCard.tsx). No test file change required (existing tests check structural placeholders; new placeholder is one more visual element).

**Changes (visual only, no TDD red-green):**

- Add a circle placeholder (`h-3 w-3 rounded-full`) where the severity icon will eventually render.
- Existing reasoning + citation pulse-bars stay.
- Pulse stagger preserved.

**Verification:** existing `RedFlagSkeletonCard.test.tsx` (if it exists) passes; running tests confirm no regression.

## Phase 4 — Empty-state example preview card

**Files touched:** [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) (empty-state branch only), [src/components/lease/RedFlagReport.test.tsx](../../../src/components/lease/RedFlagReport.test.tsx).

**TDD red-green:**

1. RED — extend `RedFlagReport.test.tsx`:
   - When no scan is in progress and no gradings exist, the rendered output contains `data-testid="red-flag-empty-preview"`.
   - The preview card contains: SeverityBadge (rendered as severity-badge testid), a clause label, a one-sentence reasoning, and a CitationChip-style row.
   - The preview is decoratively muted (opacity ≤ 0.7 on the wrapper) and carries an "Example" eyebrow.
2. GREEN — inside the empty-state branch, add a fixture mock card with severity `high`, label "Security deposit · §3", a sample reasoning, and a sample NJSA citation. Render it via the same layout as a real card (or close enough to communicate the visual pattern). Add the `Example` eyebrow above.
3. REFACTOR — ensure the bulleted Examples list still renders below the preview for the existing "what we look for" coverage.

**Verification:** new tests pass. Existing empty-state test still works.

## Phase 5 — `RedFlagsPaneHeader` polish

**Files touched:** [src/components/lease/RedFlagsPaneHeader.tsx](../../../src/components/lease/RedFlagsPaneHeader.tsx).

**Changes (visual only, no TDD red-green):**

- Eyebrow letter-spacing tightened (`tracking-[0.14em]` → keep, but verify with the live label).
- No semantic / behavior changes.

**Verification:** existing `RedFlagsPaneHeader.test.tsx` tests pass unchanged.

## Phase 6 — Full smoke + commit sequence

1. `npm test && npm run typecheck && npm run lint && npm run build` — all green.
2. Manual smoke walk per spec §4 AC #1–12 (including the grayscale-emulation check for AC #6).
3. Update `impl-qa.md` with per-phase change ledger, test deltas, commit-log placeholders.
4. **HALT for user smoke walk via `npm run dev`** before any implementation commit.
5. After user approval, commit in the following sequence (NOT pushed):

```txt
feat(s23d.1): SeverityBadge primitive (text + icon + colour)
refactor(s23d.2): RedFlagReport consumes SeverityBadge in cards + summary
refactor(s23d.3): RedFlagSkeletonCard mirrors new card hierarchy
feat(s23d.4): example preview card in RedFlagReport empty state
refactor(s23d.5): RedFlagsPaneHeader polish
docs(s23d): record implementation audit in impl-qa.md
```

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/components/lease/SeverityBadge.tsx` | NEW |
| 1 | `src/components/lease/SeverityBadge.test.tsx` | NEW |
| 2 | `src/components/lease/RedFlagReport.tsx` | Card + summary consume SeverityBadge |
| 2 | `src/components/lease/RedFlagReport.test.tsx` | Badge-presence assertions |
| 3 | `src/components/lease/RedFlagSkeletonCard.tsx` | Icon-placeholder added |
| 4 | `src/components/lease/RedFlagReport.tsx` | Empty-state preview card |
| 4 | `src/components/lease/RedFlagReport.test.tsx` | Preview-card assertions |
| 5 | `src/components/lease/RedFlagsPaneHeader.tsx` | Eyebrow polish |
| 6 | `docs/_specs/sprint-23d-risk-radar/impl-qa.md` | Implementation audit |

## Test impact

- Expected to grow: +6 SeverityBadge (4 severities × icon-present + 1 label + 1 size variant), +2 RedFlagReport (card uses badge + summary uses badge), +2 empty-state preview (testid present + example eyebrow). Net ~+10 tests.
- No deletions.
- After sprint-23d: expected total ≥ 790.
