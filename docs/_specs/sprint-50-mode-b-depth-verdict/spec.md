# Sprint 50 — Mode B depth + verdict moment

> Branch: `feature/pdf-highlight` · commits `feat(s50.x): …` (post-upload workspace depth pass).
> Methodology: spec → spec-QA → small TDD slices → gate sweep → browser visual pass.

## Goal

Give the post-upload workspace (Mode B, `ParserResultsShell`) the same warmth and dimensionality the
Mode A landing already has, and turn the scan result from a flat list into a felt **outcome**. The fix is
**depth and a verdict moment**, not more colour: carry the landing's terracotta glow across the seam, give
the verdict a tier-tinted halo, lift the red-flag cards off their tray so they read as paper, and repair the
one real contrast gap. Calm system preserved; "severity is never colour alone" preserved.

## Why now

Mode A (`ParserLandingShell`) reads as a designed, dimensional surface: an ambient terracotta field
(`LeaseHeroAmbientBlob`), paper grain, staggered entrance, glass medallions. After upload the user lands in
Mode B, which is flat cream: the red-flag cards are `bg-surface-card` (#efe7d2) sitting inside a section that
is *also* `bg-surface-card` on a `bg-surface-base` (#f5eedc) page — the card surface is identical to its own
container, so there is no figure-ground. The verdict (`red-flag-verdict`), which exists specifically to answer
"is this lease bad?", is plain text with no outcome cue. The result feels lifeless next to the landing.

This is a **visual/interaction refinement** on top of correct architecture (Sprint 33.B verdict, Sprint 43
motion, Sprint 46–48 highlights). No data, schema, or state-ownership changes.

## Decisions (carried from the user's brief + the design review)

- **Carry the glow, do not center it.** Reuse the `--accent-ambient-*` tokens, but anchor a quieter wash at
  the *top* of the workspace as **page atmosphere** (visible in the top margin + grid gutters), fading out
  before the results grid — never under the dense card text or the PDF body. It does not penetrate the opaque
  panels; the verdict halo (below) owns the behind-headline tint. (Spec-QA M2.)
- **Verdict as outcome.** A soft tier-tinted halo behind the headline + a tier glyph, mapped to the semantic
  severity tokens (`ok`→success, `low`→info, `medium`→warning, `high`→danger). Colour **reinforces**; the
  headline words + glyph carry the meaning.
- **Object quality from elevation, not fill tint.** Lift the red-flag cards to `surface-elevated` with a
  **warm** shadow (the `rgb(40 28 16 …)` brown already in `--shadow-popover`, not the cold grey
  `--shadow-lift`). **No per-card severity fill tint** — that contradicts the documented "no full-card
  tinting" rule (CLAUDE.md) and re-introduces the "covered in colour" effect Sprint 48.1 dialled down.
  Severity stays on the existing left bar + `SeverityBadge`. (User decision, 2026-06-16.)
- **Lean on shipped motion.** Sequence the existing beats (verdict settle → count → card stagger → PDF
  paint-on) into one scan-complete reveal rather than independent firings.
- **Fix the real contrast gap.** Measured: card body `text-fg-muted` is 6.46:1 (passes AA — the "washed out"
  look is figure-ground, fixed by elevation). The genuine AA failure is `text-fg-subtle` (#a8997e) at
  ~2.26:1 used for *exposed* text (the results-header meta). Repair that; do not darken the body text.

## Scope (the five slices)

1. **S50.1 — Warm depth tokens** (`globals.css`, no component change). Add a warm card shadow token
   (`--shadow-card`, light/dark) reusing the warm-brown of `--shadow-popover`; keep `--shadow-lift` for
   existing non-card callsites. Pure token addition.
2. **S50.2 — Verdict moment** (`RedFlagReport.tsx`). Wrap `red-flag-verdict` in a region carrying a soft
   tier halo + a tier glyph beside the headline. Add `data-tier` (pinnable). Preserve the existing testid +
   `font-serif`/`font-bold`/`tracking-tight` classes on the `<p>`. Reduced-motion → static halo. The glyph
   reuses `SEVERITY_ICON` exported from `SeverityBadge.tsx` (one source of truth; spec-QA M1).
3. **S50.3 — Card object quality** (`RedFlagReport.tsx` card class + `ParserResultsShell.tsx` section). Lift
   cards to `surface-elevated` + warm `--shadow-card` (stronger on hover). Let the red-flags + clauses
   sections shed their panel border so they read as quiet titled regions and the cards are the only objects
   (also clears the nested-card smell). Left bar + badge untouched.
4. **S50.4 — Mode B masthead glow** (`ParserResultsShell.tsx`). Add `relative isolate` to the shell root;
   mount a top-anchored, `-z-10`, `aria-hidden`, `pointer-events-none` terracotta wash (page atmosphere)
   reusing `--accent-ambient-*` at lower intensity than the landing, fading before the grid. Visible in the
   top margin + gutters, not behind opaque panels. Static under reduced motion (pure CSS).
5. **S50.5 — Contrast + coordinated reveal** (`ParserResultsShell.tsx`, `RedFlagReport.tsx`). Move exposed
   `text-fg-subtle` (results-header meta) to `text-fg-muted`. Then, conservatively, let the existing beats
   share one curve — verdict + first (highest-severity) card stay immediate; only trailing-card stagger +
   PDF paint-on ride the bounded `STAGGER`/`DURATION` tokens. No new waits (spec-QA M3). If coordination would
   add latency, ship contrast-only.
6. **S50.6 — One smooth glide on clause jump** (`PdfViewer.client.tsx`; added 2026-06-16 after a browser
   review). Clicking a red flag fired two competing scrolls (the card's `scrollToPage` page-scroll + the
   Sprint 46.5 active-clause mark-scroll), reading as a janky/instant jump. Make the `activeClauseId` effect
   the single animated scroll (highlight-centre if a mark exists, else a recorded page fallback); the
   imperative `scrollToPage` records the page instead of scrolling. Preserves the `scrollToPage(N)` call
   contract; page navigation is untouched.

## Governing power-words

| Power word | Decision | Verification |
|---|---|---|
| **Dieter Rams** | Depth via elevation + one quiet glow, not more colour; no fill tint. | Cards lift on `surface-elevated` + warm shadow; glow ≤ landing intensity; no per-card tint. |
| **Wathan / Schoger** | Figure-ground + warm shadow do the work before decoration. | Card surface ≠ container surface; `--shadow-card` warm-brown; section border dropped. |
| **Jakob Nielsen** | The scan answers "is this lease bad?" as a visible outcome, not a tally. | Tier halo + glyph behind the verdict headline; `data-tier` reflects `computeScanVerdict`. |
| **WCAG** | Severity never colour-alone; repair the real AA failure; reduced-motion honoured. | Verdict glyph + words carry tier; halo is decoration; exposed `fg-subtle`→`fg-muted`; motion gated. |
| **Apple HIG** | One coordinated, purposeful scan-complete reveal; depth that feels native. | Sequenced verdict→count→cards→paint-on; static under reduced motion. |

## Invariants (carry into every slice)

- **Severity colour is never the only signal.** The verdict tier and cards keep text + icon/shape channels;
  the halo/glow are reinforcement only (`aria-hidden`).
- **No full-card severity fill tint.** Documented in CLAUDE.md; reaffirmed by the user this sprint.
- Preserve `red-flag-verdict` testid and its editorial classes (`font-serif`, `font-bold`, `tracking-tight`).
- Decorative layers are `aria-hidden` + `pointer-events-none` + behind content (`-z`), and static under
  `prefers-reduced-motion: reduce`.
- No parser/chat state-ownership changes; the three-provider order is untouched.
- Reuse existing tokens/recipes (`--accent-ambient-*`, the warm-brown shadow); do not invent parallel ones.

## Out of scope

Per-card severity fill tint; the clause-list card redesign beyond surface/border parity; PDF viewer chrome;
new dependencies; dark-mode-only effects; the masthead/brand badge (Sprint 49 owns that).

## Definition of Done

TDD per behavioural slice (S50.2–S50.5); `npm run lint` + `npm run typecheck` + `npm test` + `npm run build`
all green; new verdict-tier, card-surface, glow, and contrast behaviours covered by tests; sprint-qa.md QA
note; docs updated (history.md, README sprint history, CLAUDE.md tokens); browser visual pass against the
seeded sample lease (`npm run dev`) for the warm depth, verdict halo, and masthead glow.
