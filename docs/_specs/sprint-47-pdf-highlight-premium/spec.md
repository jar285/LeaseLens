# Sprint 47 — Premium refinement of the PDF highlighter

> Branch: `feature/pdf-highlight` · commits `feat(s47.x): …` (polish pass on the Sprint 46 highlighter).
> Methodology: spec → spec-QA → TDD red→green per slice → gate sweep → browser visual pass.

## Goal
Keep the Sprint 46 product goal (red-flag card → exact PDF text → explanation → action) but make the execution
feel **calm, refined, Apple-like** instead of a debug overlay: lower the visual weight, distinguish passive /
hover / active states, and let motion guide the eye rather than alarm. LeaseLens *quietly showing evidence*.

## Why now
The shipped highlighter read as heavy: dense tints, noisy per-severity underlines, every line equally alarming,
and passive vs hover vs active barely distinct. The feature is correct; it needs design refinement.

## Decisions confirmed with the user
- **Hybrid rendering.** Passive highlights stay as the Sprint 46 inline `customTextRenderer` marks (calm,
  readable, zoom/scroll alignment free). A thin **computed "evidence frame" overlay** — one element for the
  active clause (+ one for hovered) — draws the cohesive halo + glow + floating label. Avoids per-fragment
  boxiness on multi-line clauses and the per-highlight realignment cost of a full overlay rework.
- **Keep the current controls** (master show/hide + four severity chips, High+Med default). Style polish only.

## Governing power-words
| Power word | Decision it governs | Verification |
|---|---|---|
| **Dieter Rams** (less, but better) | Quieter tints, drop the noisy underline, no hard bloom; emphasis only where it aids comprehension. | Passive opacity ↓ (high .24→.18 etc.); underline removed; severity still non-colour via glyph + label. |
| **Apple HIG** (motion explains, restraint) | One soft focus pulse (not a 2× loop), short fade-ins, reduced-motion honored. | Frame pulse runs once; `@media (prefers-reduced-motion)` gates reveal/pulse/fade. |
| **Wathan / Schoger** (practical polish) | Layered halo + warm popover shadow + glass label using existing tokens. | Frame `box-shadow` (1px ring + 4px halo + soft glow); label reuses `--shadow-popover` + backdrop blur. |
| **React / Dan Abramov** (state ownership) | Reuse the existing split selection state; don't add a competing object; hover never re-renders `<Page>`. | `activeClauseId` (LeaseParser) + `hoveredClauseId`/filters (PdfHighlightContext); overlay reads, marks unchanged. |
| **WCAG** | Severity never by colour alone; keyboard + reduced-motion; readable text. | Glyph (▲◆●✓) + card badge + mark `aria-label`; controls `aria-pressed` + dynamic label; pulse gated. |
| **Addy Osmani** (perf) | At most 1–2 overlay elements; recompute via rAF only while a clause is emphasized. | Scroll listener attaches only when active/hovered; union-box measured on demand. |

## Approach
- **Passive (CSS):** tint driven by `--ll-color` + `--ll-alpha` custom props so hover/active are clean alpha
  bumps; quieter base opacities; `radius 3px`; faint inset edge; per-severity underline dropped (severity now
  carried by the leading `::before` glyph + the card SeverityBadge + the mark aria-label).
- **Evidence frame overlay (`PdfEvidenceOverlay`):** computes the union bounding box of the active/hovered
  clause's `mark[data-clause-id]` rects in the scroll section's content space and renders ONE fill-less rounded
  frame (ring + halo + glow) per emphasized clause. Direct child of the scroll `<section>` (its containing block
  + scroll container) so it scrolls with the pages; recomputed on selection change, zoom (`effectivePageWidth`),
  and scroll (rAF-throttled, listener only while emphasized).
- **Floating label:** a warm glass caption pill (`clauseLabel`, e.g. "Late fee · §3") just above the clause's
  first line, shown for the emphasized clause(s) only; replaces the old top sticky callout.
- **Motion:** one-shot opacity reveal of passive marks on the scan's 0→N transition (`<mark>` is inline, so
  opacity-only); single soft focus pulse on the frame (the element mounts on selection → plays once); frame
  fades in via `@starting-style`; all gated under `prefers-reduced-motion: no-preference`.

## Invariants
- No change to the Sprint 46 matching engine, the data pipeline, or `ChatStreamContext`.
- The frame is fill-less → no double-tint with the inline marks.
- Reveal fires once per lease (count 0→N), never on zoom/filter.
- Reduced motion → static states only (resting halo, instant frame, opacity-1 marks), direct scroll.

## Out of scope
Full-overlay rework (rejected — discards the zoom-free engine), tri-mode controls (chips already cover it),
stagger/ink-sweep reveal (optional; deferred), Phase-5 items (export/OCR/stored coordinates).

## Definition of Done
TDD per slice; lint + typecheck + full test + build green; reduced-motion + frame/label behaviors covered by
tests; QA note in `impl.md`; browser visual pass (the premium feel is judged in `npm run dev`, not happy-dom).
