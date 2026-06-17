# QA Report — Sprint 50 Spec: Mode B depth + verdict moment

**Date:** 2026-06-16
**Reviewer:** Claude (self-QA per methodology step 2)
**Artifact:** `docs/_specs/sprint-50-mode-b-depth-verdict/spec.md`
**Status:** ✅ Resolved — spec amended inline; clear to proceed to TDD slices.

---

## Summary

The spec is sound and intentionally narrow: a visual/interaction refinement on correct architecture, no
data/state changes. It is grounded in measured facts (contrast ratios, the actual token values, the existing
`LeaseHeroAmbientBlob` and warm-shadow recipe) rather than assertion, and it reaffirms the two load-bearing
invariants (severity-never-colour-alone; no full-card fill tint). QA found **5 issues**: 0 HIGH, 3 MEDIUM,
2 LOW. None require redesign; all are resolved by localized clarifications, applied to the spec.

---

## Issues

### 🟠 MEDIUM

#### M1. Tier-glyph source would duplicate the SeverityBadge icon map
The verdict moment (S50.2) needs a tier glyph as its non-colour channel. The lucide icon-per-severity map
lives privately in `SeverityBadge.tsx` (`SEVERITY_ICON`), and `grading.ts` is a deliberately JSX-free module,
so the icon map cannot move there. Re-declaring the map in `RedFlagReport.tsx` would violate the
"no duplicated logic" invariant and risk drift (a tenant seeing a different glyph for "high" in the verdict vs
the card).
**Resolution:** Export `SEVERITY_ICON` from `SeverityBadge.tsx` and consume it in the verdict. One source of
truth for severity→glyph across the badge and the verdict. (Applied to spec S50.2.)

#### M2. The masthead glow cannot sit *behind* the verdict text, and should not try to
The spec's phrase "behind header + verdict" is imprecise: the header and the red-flags section are opaque
`surface-card`, so a `-z-10` page-background glow does not show through them. Making the section translucent
to let it through would put a terracotta wash under readable card text (contrast + "covered in colour" risk).
**Resolution:** Two distinct jobs, no overlap. The **masthead glow (S50.4)** is page-level atmosphere, visible
in the top margin and grid gutters, that ties Mode B to the landing. The **verdict halo (S50.2)** owns the
behind-headline tint, *inside* the section. The glow never needs to penetrate an opaque surface. (Spec S50.4
wording tightened to "behind the masthead region / visible in the page background".)

#### M3. A coordinated reveal must not withhold high-severity content
`motion/presets.ts` `STAGGER` carries an explicit constraint: "Kept small and bounded so a long list never
withholds high-severity content behind a reveal." A new "coordinated scan-complete reveal" (S50.5) could
regress this if it adds waits before the verdict or the first (highest-severity) card.
**Resolution:** S50.5 stays conservative: reuse the already-bounded `STAGGER`/`DURATION` tokens, keep the
verdict and first card immediate, and only let the existing trailing-card stagger and PDF paint-on ride the
same curve. No new delays. If coordination cannot be done without adding latency, ship contrast-only and drop
the reveal change (it is the lowest-value slice). (Applied to spec S50.5.)

### 🟡 LOW

#### L1. `surface-elevated` is documented as "hover/floating chrome", not a resting card surface
Using `surface-elevated` (#faf3de light / #2d241a dark) as the cards' resting surface (S50.3) reinterprets the
token's stated purpose. It is the correct value (the only surface lighter than base — exactly "paper that
lifts"), and no Mode B hover state competes for it, so this is an extension, not a conflict.
**Resolution:** Proceed; document the reinterpretation in the CLAUDE.md token note. If strict token purity is
wanted later, add a dedicated `--color-surface-raised` alias pointing at the same value (out of scope now).

#### L2. `low` tier halo is blue (info-600), adjacent to the citation ink-blue
Mapping `low`→`info-600` keeps the verdict halo in lock-step with the card bar/badge language, but info-blue
sits near the `--color-citation` ink-blue used for statute references.
**Resolution:** Keep the semantic mapping for consistency, but hold the halo alpha low (it is a wash, not a
fill) so it never reads as a citation chip. The verdict word ("low risk") + glyph disambiguate regardless.
(No spec change; noted for the implementer.)

---

## Verification of resolutions

- M1, M2, M3 applied to `spec.md` (S50.2, S50.4, S50.5 wording).
- L1 deferred to the CLAUDE.md token note in the docs slice; L2 is an implementation note.
- No issue touched the invariants or the slice boundaries; the sprint plan stands.
