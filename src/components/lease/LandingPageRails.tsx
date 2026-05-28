// Sprint 29.13 — viewport-fixed editorial rails for the landing page.
//
// Replaces the Sprint 29.x in-grid sticky `ParserLandingSideRail`
// component. After Sprint 29.12 made sticky behave correctly the
// labels still read as hero decoration (split into 3 vertical
// columns per side, nested inside the hero grid). Open Design's
// reference treats rails as permanent viewport metadata attached
// to the outer page frame — a `position: fixed` concept.
//
// What changed structurally:
//   - One continuous caption per side (`PARSER-FIRST · NJ LEASES ·
//     TENANT LAW` on the left; `NJSA · CLAUSES · RED FLAGS` on the
//     right) instead of three separate spans.
//   - `position: fixed` instead of `position: sticky` — rails are
//     always visible regardless of scroll, drawer state, or layout.
//   - Mounted at the page-shell root, not inside the hero grid.
//   - Hidden on mobile (`hidden md:block`) — vertical text never
//     crowds a 375px viewport.
//   - `aria-hidden + pointer-events: none` so SR users skip them
//     and the upload card / FAB pill remain fully reachable.
//
// Positioning math: rails sit at `left-3 / right-3` (12px from the
// page edge). The FAB pill sits at `right-6 / bottom-6` (24px from
// each edge) — the right rail is OUTSIDE the FAB. Vertical text
// at 11px + 0.22em tracking + a 28-character caption spans ~400px;
// centered on a 900px viewport that's y=250–650 — well clear of
// the FAB's y=820–876 footprint.
//
// Power-words check:
//   - Don Norman (predictable interaction): rails are decorative
//     metadata; pointer-events-none ensures they never intercept
//     a click meant for content underneath.
//   - Dieter Rams (less but better): one caption per side replaces
//     three separate spans — less, clearer.
//   - WCAG: aria-hidden because the same information is already
//     in the brand strip + body copy. SR users don't get a
//     duplicate.

import {
  LEASELENS_LEFT_RAIL_LINES,
  LEASELENS_RIGHT_RAIL_LINES,
} from '@/lib/lease/landing-rails';

const RAIL_SEPARATOR = ' · ';

function toCaption(lines: readonly string[]): string {
  return lines.map((line) => line.toUpperCase()).join(RAIL_SEPARATOR);
}

const RAIL_CAPTION_CLASS =
  'fixed top-1/2 z-base -translate-y-1/2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-fg-subtle/55';

export function LandingPageRails(): React.JSX.Element {
  const leftCaption = toCaption(LEASELENS_LEFT_RAIL_LINES);
  const rightCaption = toCaption(LEASELENS_RIGHT_RAIL_LINES);
  return (
    <div
      data-testid="landing-page-rails"
      className="pointer-events-none hidden md:block"
    >
      <span
        data-testid="landing-page-rails-left"
        aria-hidden="true"
        className={`${RAIL_CAPTION_CLASS} left-3 [writing-mode:vertical-rl]`}
      >
        {leftCaption}
      </span>
      <span
        data-testid="landing-page-rails-right"
        aria-hidden="true"
        className={`${RAIL_CAPTION_CLASS} right-3 [writing-mode:vertical-lr]`}
      >
        {rightCaption}
      </span>
    </div>
  );
}
