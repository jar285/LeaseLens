# Sprint 48 — Evidence-layer polish (calm + gutter + focus)

> Branch: `feature/pdf-highlight` · commits `feat(s48.x): …` (second premium pass on the highlighter).
> Methodology: refine-in-place (no rebuild) → TDD per slice → gate sweep → browser visual pass.

## Goal
Keep the hybrid model (passive inline marks + computed evidence frame + floating label) but lower the visual
weight further so the PDF no longer feels "covered in red", and make the *selected* red flag create a focused
connection between card, PDF text, and explanation. Passive = quiet; active = premium; one issue at a time.

## Why now
After Sprint 47 the highlights were still heavier than a professional document-review layer: high-severity tints
dominated, passive highlights competed with the text, and there was no way to scan a long lease without
highlights everywhere. The architecture is correct — this is purely a visual/interaction refinement.

## Decisions (carried from the user's brief)
- **Do not rebuild.** Keep inline marks (passive) + evidence-frame overlay (active/hover) + floating label.
- **Keep the controls** (master toggle + severity chips). No tri-mode segment. Style only.

## Scope (the eight tasks)
1. **Calmer passive tints** — high .18→.14, med .20→.13, low .16→.12, ok .14→.10; lighter inset edge; text
   readability first. Low/OK still hidden by default.
2. **State hierarchy** — passive (soft) < hover (subtle) < active (frame + halo + label); not all equal.
3. **Softer active frame** — warmer, lower-intensity halo + glow (no red flash); cohesive rounded region for
   multi-line clauses (already from 47.2, intensities dialed down).
4. **Richer label** — "Late fee · §3 · High concern"; severity in TEXT, not colour alone; warm glass pill.
5. **Evidence gutter markers** (NEW) — small severity-shaped studs in the right gutter, one per VISIBLE
   red-flagged clause, clickable to focus the clause. Scan aid that reduces the need for heavy highlights.
6. **Selected-evidence focus** (NEW) — while a clause is active, non-active passive marks recede (`ll-focus-mode`).
7. **Controls** — kept; pressed chips already carry a ring (47.5), dynamic aria-label on the toggle.
8. **Accessibility** — severity never colour-alone (glyph + concern text + card badge + aria-labels); keyboard
   (gutter markers are buttons); reduced-motion gated; text stays readable over the quieter tints.

## Governing power-words
| Power word | Decision | Verification |
|---|---|---|
| **Dieter Rams** | Lower passive opacity; calm the glow; markers over blanket highlights. | Passive alphas ↓; active glow intensities ↓; gutter lets users scan without dense fills. |
| **Apple HIG** | Focused selection (dim the rest), short purposeful motion, reduced-motion honored. | `ll-focus-mode` recedes non-active marks; pulse once; `@media (prefers-reduced-motion)` gates all motion. |
| **Wathan / Schoger** | Premium label + marker chrome from existing tokens. | Glass pill (`--shadow-popover` + blur); markers use severity tint + glyph + focus ring. |
| **WCAG** | Severity by shape + text, not colour; keyboard; readable text. | Marker glyph (▲◆●✓) + "Jump to … High concern" aria-label; label carries "High concern"; quieter tints. |
| **Page Anchoring** | The gutter + frame + label tie the card to the exact lease text. | Click card OR gutter marker → same active clause focus + scroll. |

## Invariants
- No rebuild; the Sprint 46 matching engine and the 47 hybrid are untouched structurally.
- Gutter markers + frame are content-space children of the scroll section (scroll with pages; no viewport pin).
- Focus-dim + gutter respect `showHighlights` / `severityFilter` (hidden severities have no marker, no dim bypass).
- Reduced motion → static states, no transitions/pulse/reveal.

## Out of scope
Tri-mode controls; ≥44px gutter touch targets (markers are intentionally small scan studs — the cards remain the
primary large target); stored coordinates / OCR / export (Phase 5).

## Definition of Done
TDD per slice; lint + typecheck + full test + build green; gutter/focus/label behaviors covered by tests; QA note
in `impl.md`; browser visual pass (calm tint, soft frame, glass label, gutter alignment) in `npm run dev`.
