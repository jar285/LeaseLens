# Sprint 23d — Risk Radar (Right Pane Redesign)

> **STATUS: SHELVED** — Designed on the `feature/ui` branch and never merged. The parser-first pivot in Sprint 26b (`RedFlagReport` inside `ParserResultsShell`'s results stack) superseded the Risk Radar right-pane direction. Kept here as historical design exploration; do not implement.

**Status:** Shelved (not merged; superseded by Sprint 26b).
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Parent handoff:** [handoff.md](../../../handoff.md) §14 (right pane direction), §19 (accessibility), §6 (visual direction to preserve).
**Predecessors:** [sprint-23a](../sprint-23a-ui-foundation/spec.md), [sprint-23b](../sprint-23b-document-dock/spec.md), [sprint-23c](../sprint-23c-conversation-workspace/spec.md).

---

## 1. Problem

The right pane is the risk map — where a tenant sees, at a glance, what about their lease is risky and where the risk lives. Today it works: cards stream in, sort by severity, expand on click, jump to the cited page. But three concrete weaknesses prevent it from reading as a *risk-intelligence panel* rather than a list of findings:

1. **Severity is communicated by color + text, but not by icon/shape.** [grading.ts:41-54](../../../src/components/lease/grading.ts#L41-L54) maps severity to `SEVERITY_BAR` (background colour for the left bar) and `SEVERITY_BADGE` (pill background + text colour); `SEVERITY_LABEL` provides the text. There is no icon. Handoff §19 is explicit: "Severity must be communicated by text + icon/shape + layout, never by color alone." For a tenant with red/green colour-blindness, today's card communicates "this clause has a label that says 'High' in red-tinted text". With icons, the same card communicates severity in a third channel (shape) so the colour is one redundant cue among three.

2. **Empty state is informative but static.** [RedFlagReport.tsx:108-168](../../../src/components/lease/RedFlagReport.tsx#L108-L168) renders an icon + "Red flags will appear here…" line + a bulleted Examples list ("Security-deposit overcharges", "One-way attorney's-fee clauses", …). It tells the user what LeaseLens looks for. But it doesn't show the user what a real card *looks like* — so the first time a card appears, it's a visual surprise. Handoff §14 calls for "Optional example preview card" — a mock card rendered with low emphasis so the tenant can pre-visualise the output.

3. **Summary row reads as four equal segments.** [RedFlagReport.tsx:171-209](../../../src/components/lease/RedFlagReport.tsx#L171-L209) renders `9 HIGH · 1 MEDIUM · 1 LOW` as a uniform run of dot-text pairs in tracking-wide uppercase. The eye doesn't know to read "9 high" before "1 low". Tightening the typography hierarchy (high gets primary weight; low/ok stay muted) makes the summary scan as a risk meter, not a tally.

This sprint introduces no behavioral changes to the scan pipeline, grading logic, severity tiers, or `scrollToPage` flow. It does not touch the left pane (23b done) or the center pane (23c done). All visual layer plus one small extracted component (`SeverityBadge`).

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen — paths, exported names, props signatures unchanged unless the redesign explicitly requires a new prop, and even then no renames.
2. No new runtime dependencies.
3. `useReducedMotion()` gate is non-negotiable.
4. **Severity is communicated by text + icon/shape + layout, never by color alone** (load-bearing here — the central design move of this sprint).
5. Disclaimer renders bold at the end of grading messages (system-prompt-driven; not touched).
6. Synthetic scan-summary suppression preserved.
7. PDF focus dialog sizing preserved.
8. **Verbatim citation validation in `grade_clause_severity` not weakened** — the right pane reads `g.statute_citation` directly; nothing about that validation changes.
9. Role-gated progressive disclosure preserved.
10. Test count never decreases.
11. No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.
12. WCAG AA contrast in both color schemes; visible focus states; minimum 44×44 touch targets; respect `prefers-reduced-motion`.

Sprint-23d-specific invariants:

13. **Severity-sort behavior preserved.** Cards are sorted by `SEVERITY_ORDER` (high → medium → low → ok), then by `clause_index`. The `useMemo` at [RedFlagReport.tsx:57-70](../../../src/components/lease/RedFlagReport.tsx#L57-L70) is not changed.
14. **`scrollToPage` jump-to-PDF flow preserved.** `jumpToClausePage()` at [RedFlagReport.tsx:232-240](../../../src/components/lease/RedFlagReport.tsx#L232-L240) and the `activeClauseId` 4-second highlight stay as-is.
15. **`AnimatePresence` enter/exit animations preserved.** Cards still slide in from the right (8px offset, spring); skeleton cards still mirror their dimensions.
16. **`ActiveRing` overlay preserved.** The 200ms fade-in / 3.6s hold / 200ms fade-out across `HIGHLIGHT_DURATION_MS` works identically.
17. **`SEVERITY_ORDER`, `SEVERITY_LABEL`, `SEVERITY_BAR`, `SEVERITY_BADGE`, and `CLAUSE_TYPE_LABEL` exports in [grading.ts](../../../src/components/lease/grading.ts) stay public-surface-frozen.** New entries are additive only.

---

## 3. Design system

### 3a. Token consumers

Sprint-23d does not add tokens. The new `SeverityBadge` consumes existing accent + semantic tokens (`bg-danger-*`, `bg-warning-*`, `bg-info-*`, `bg-success-*`, `text-fg-*`). The example preview card consumes `bg-surface-elevated` from 23a for the card chrome and `bg-surface-sunken` for a "this is an example, not a real card" treatment.

### 3b. New shared module

**`SEVERITY_ICON`** — addition to [src/components/lease/grading.ts](../../../src/components/lease/grading.ts). Maps each `Severity` to a `lucide-react` icon component so consumers don't import icons from grading.ts (keeping it a pure types/constants module). Instead, the icon name is the dictionary value and consumers pick it up by passing through `SeverityBadge`.

Actually — the lucide icons are React components. The cleanest place for the icon map is **inside `SeverityBadge.tsx` itself**, not `grading.ts` (which is intentionally a pure module with no JSX). Keep `grading.ts` JSX-free; the icon mapping lives in the new component.

### 3c. Component refactor scope

| Component | Path | Phase | What changes |
|---|---|---|---|
| `SeverityBadge` (NEW) | [src/components/lease/SeverityBadge.tsx](../../../src/components/lease/SeverityBadge.tsx) | 1 | Reusable primitive: `severity: Severity` + optional `size?: 'sm' \| 'md'`. Renders a pill containing icon (AlertOctagon high / AlertTriangle medium / Info low / CheckCircle ok) + severity label text + colour. text + icon + colour triple — never colour alone. |
| `RedFlagReport` | [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | 2 | Card header swaps inline severity-pill span for `<SeverityBadge>`. Summary row swaps inline dot-text pairs for `<SeverityBadge size="sm">` chips. Severity-sort + AnimatePresence + ActiveRing logic untouched. |
| `RedFlagSkeletonCard` | [src/components/lease/RedFlagSkeletonCard.tsx](../../../src/components/lease/RedFlagSkeletonCard.tsx) | 3 | Skeleton mirrors the new card hierarchy (icon-shaped placeholder where the severity icon lives + slightly tighter rhythm). |
| `RedFlagReport` empty state | [RedFlagReport.tsx:108-168](../../../src/components/lease/RedFlagReport.tsx#L108-L168) | 4 | Replaces the bulleted Examples list with an example-preview red-flag *card* — same layout as a real card (SeverityBadge + clause label + reasoning + citation), rendered at lower opacity with an "Example" eyebrow so a tenant knows what a real card will look like. The original bulleted list of categories is preserved below the preview as a quick reference. |
| `RedFlagsPaneHeader` | [src/components/lease/RedFlagsPaneHeader.tsx](../../../src/components/lease/RedFlagsPaneHeader.tsx) | 5 | Visual polish only: tighter eyebrow spacing, no semantic changes. Live progress label preserved. |

### 3d. State coverage matrix (right pane)

| State | Trigger | Renders |
|---|---|---|
| Idle (no scan yet) | `gradings.length === 0 && scan.phase !== 'extracting'` | EmptyState + new **example preview card** + bulleted Examples |
| Scanning (extracting) | `scan.phase === 'extracting' && scan.total > 0` | `RedFlagSkeletonCard` × `scan.total` |
| Scanning (grading) | partial gradings + skeletons for the rest | Real cards (with new `SeverityBadge`) + trailing skeletons |
| Complete | scan finished | All real cards |

### 3e. Acceptance walk per phase

Per-phase definitions of done live in [sprint.md](./sprint.md).

---

## 4. Acceptance criteria

Manual walk via `npm run dev` at `http://localhost:3000/`, sample lease loaded.

1. **AC #1 — SeverityBadge primitive.** Render an isolated `<SeverityBadge severity="high" />` in a test fixture (or live in a Storybook-style demo if convenient): pill renders with `AlertOctagon` icon + "High" label + danger-tinted background. Same for medium (AlertTriangle), low (Info), ok (CheckCircle).
2. **AC #2 — Cards use SeverityBadge.** Run the standard scan on the sample lease. Each red-flag card header shows an icon + severity label inside a pill, **not** a plain text pill. Sorting by severity preserved (HIGH cards first).
3. **AC #3 — Summary row uses SeverityBadge.** Post-scan, the summary strip at the top of the right pane shows the count + a `<SeverityBadge size="sm">` for each severity present (e.g. `9 [⚠ High] · 1 [△ Medium]`). The dot-only treatment is gone.
4. **AC #4 — Empty state preview card.** Pre-scan (or before any lease upload), the right pane shows: existing eyebrow + "Red flags will appear here…" + a **mock example card** rendered at ~70% opacity with an "Example" eyebrow + the bulleted category list below. The mock card uses the same layout as a real card.
5. **AC #5 — Skeleton card alignment.** Run a scan. The skeleton cards have a circle placeholder (where the severity icon will be) in addition to the existing reasoning/citation placeholders.
6. **AC #6 — Severity not color-alone.** DevTools → emulate grayscale rendering (Rendering → "Emulate vision deficiencies" → "Achromatopsia"). Cards still legibly communicate severity via icon + label.
7. **AC #7 — Severity-sort preserved.** Cards still sort high → medium → low → ok, then by `clause_index`. AnimatePresence enter/exit still works on lease swap.
8. **AC #8 — Jump-to-page preserved.** Click a citation chip on a high-severity card. PDF scrolls to the cited page; active-card ring fades in over ~200ms, holds for 3.6s, fades out.
9. **AC #9 — Test sweep.** `npm test` ≥ 780/780 pass; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.
10. **AC #10 — Reduced motion.** Pulse + slide-in + ring-fade all suppressed under `prefers-reduced-motion: reduce`.
11. **AC #11 — Dark mode.** Severity badges, example preview card, skeleton placeholders all flip cleanly.
12. **AC #12 — Keyboard.** Tab through cards: severity badge (decorative, no focus) → toggle button → citation chip → expand body → view-on-page button. All focus rings visible.

---

## 5. Out of scope

- New legal grading rules / corpus / classifier changes.
- Severity-tier additions or rewordings (still `high | medium | low | ok`).
- Confidence indicator on cards (handoff §14 conditional — only if existing data supports it; current `GradingResult` doesn't carry confidence).
- Right-pane header renaming to "Risk Radar" (handoff §14 leaves this open; keep "Red flags" to avoid code churn).
- Re-architecting `useScanProgress` or the `ToolEvent` shape.
- Mobile-responsive treatment.
- Center pane / left pane (23b done, 23c done).

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged.
- **§6 simplicity:** the new `SeverityBadge` is a small presentational component (props in, JSX out, no state). The example preview card is a sibling fixture inside `RedFlagReport.tsx`'s empty branch, not a new component.
- **§7 spec-first:** this spec ships before any code edits.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** no library API changes.

---

## 7. Cross-references

- Parent handoff: [handoff.md](../../../handoff.md) §14 (right pane), §19 (accessibility), §6 (visual direction).
- Predecessors: [sprint-23a/spec.md](../sprint-23a-ui-foundation/spec.md), [sprint-23b/spec.md](../sprint-23b-document-dock/spec.md), [sprint-23c/spec.md](../sprint-23c-conversation-workspace/spec.md).
- Design-system source: [design-system/MASTER.md](../../../design-system/MASTER.md).
- Token implementation: [src/app/globals.css](../../../src/app/globals.css).
- Downstream: none — this is the last sprint in the 23-series.

---

**End of spec.**
