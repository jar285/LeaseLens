# Sprint 51 — Mode B premium pass

> Branch: `feature/pdf-highlight` · commits `feat(s51.x): …`
> Master plan: `~/.claude/plans/sounds-good-use-plan-sharded-lynx.md` (approved 2026-06-17).
> Methodology: spec → spec-QA → TDD slices → gate sweep → browser visual pass.

## Goal

Turn the audit-approved premium-touch clusters into the post-upload workspace (Mode B). This folder tracks the
whole pass (S51 + the downstream slices S52–S55 land here as they ship), grounded in the screenshot-driven
audit (impeccable `critique`, Nielsen 30/40) and the project ui-ux-philosophy. "Premium" = depth, craft, and
hierarchy, not flash (Dieter Rams).

## Hard invariants (every slice)

1. Severity = text + icon/shape AND colour, never colour alone.
2. No full-card severity fill tint. HIGH emphasis via elevation/spacing/border-weight only.
3. WCAG-AA contrast.
4. `prefers-reduced-motion` honoured at every animation site.
5. Calm/editorial restraint; reuse house tokens.
6. No silently-broken tests; update pinned tests deliberately in the red→green cycle.

## Slices

- **S54-prep — `topClauseId` on `ScanVerdict`** (`scan-verdict.ts`). Pure-function shape change landed first
  (Martin Fowler: refactor before feature) so S54's verdict anchor is a pure-UI sprint. `topClauseId` returns
  `inTier[0].clause_id` for high/medium/low, `null` for ok/idle — same pick as `topClauseTitle`, so they can't
  disagree. **Shipped.**
- **S51 — Severity-grouped card sections** (`RedFlagReport.tsx`). The uniform card wall becomes severity
  groups with counted dividers (`GroupDivider`, reusing the SeverityBadge + count idiom); HIGH cards rest at
  the deeper warm `--shadow-card-hover` + a one-step-heavier neutral border (depth/edge only, no fill); OK
  clauses roll up behind a collapsed `OkRollup` ("N clauses look standard", `aria-expanded`). Dividers + rollup
  are keyed siblings inside the existing `AnimatePresence` (flat-children model preserved via `flatMap`).
  **Shipped.**
- **S52 — Designed PDF recovery card** (`ParserResultsShell.tsx`, reattach branch). Visual card whose button
  triggers the existing destructive Replace flow; copy stays honest (does NOT claim the review is preserved).
  **Shipped.**
- **S53 — De-gradient FAB (flat `accent-700` + `shadow-popover`), document-weight header + always-on metadata,
  pills merged into one segmented "Explain" control + accent-primary "Draft email".** **Shipped.**
- **S54 — Verdict "biggest concern" click anchor, em-dash removed, "Highlight on PDF" control label, clauses
  "full inventory" identity.** **Shipped.**
- **S55 — Polish: "p. N" contrast (`fg-muted`), masthead-glow visibility (0.7), citation credential chip.**
  **Shipped.** (Empty-state preview surface alignment deferred — cosmetic.)

## Deferred (with reason)

- **S51 grouped-reveal stagger.** The plan included a `staggerChildren` reveal gated on `isReviewReady`. It is
  deferred: layering a parent-variant stagger onto the existing `AnimatePresence` + `popLayout` + per-card
  `initial/animate` (which streams cards in during live grading) is fragile and risks re-staggering every
  grading tick. The existing per-card entrance already animates the reveal; the *visible hierarchy* (grouping +
  HIGH emphasis + OK roll-up) is the core premium win and is shipped. A coordinated stagger can be a careful
  follow-up (same posture as the S50.5 reveal deferral).

## Governing power-words

| Slice | Power-words |
|---|---|
| S54-prep | Martin Fowler, Page Anchoring |
| S51 | Wathan/Schoger, IBM Carbon, Material Design, Dieter Rams, Don Norman, Steve Krug, WCAG, Kent C. Dodds |
| S52 | Don Norman, Jakob Nielsen, Dieter Rams, WCAG |
| S53 | Dieter Rams, Apple HIG, WCAG, Steve Krug, Don Norman, Kent C. Dodds |
| S54 | Page Anchoring, Don Norman, Jakob Nielsen, Steve Krug, WCAG |
| S55 | WCAG, Dieter Rams, Wathan/Schoger |

## Definition of Done

TDD per slice; lint + typecheck + full test + build green; new behaviours tested; `impl.md` QA note;
`history.md` + README sprint row updated; browser visual pass against the seeded sample lease.
