// Sprint 29.x — Open Design-inspired editorial frame for the landing page.
//
// Sprint 29.13 — the in-grid sticky side rails (ParserLandingSideRail
// + ParserLandingRailLabelStack helpers) were removed when the rails
// were lifted into the page-shell-level `LandingPageRails` (fixed-
// positioned, single continuous caption per side). The vertical
// hairlines that lived inside the central max-w-6xl wrapper were
// also removed because the new rails now own the page-edge vertical
// line system — keeping the central-wrapper hairlines would have
// produced redundant "fence-post" vertical lines on each side
// (PRD: "avoid having too many vertical lines close together").
//
// This file now exposes the decorative frame only — corner brackets
// and the single top hairline. The bottom hairline is intentionally
// absent so the landing page reads as an open downward composition,
// not a boxed-in container.

'use client';

export interface ParserLandingEditorialFrameProps {
  /** Workspace label — sole hero eyebrow (hairline caption), not duplicated in-flow. */
  workspaceName: string;
}

/*
 * Decorative hairlines + workspace caption. Rails live in LandingPageRails.
 */
export function ParserLandingEditorialFrame({
  workspaceName,
}: ParserLandingEditorialFrameProps): React.JSX.Element {
  return (
    <div
      data-testid="parser-landing-editorial-frame"
      className="pointer-events-none absolute inset-0 z-0"
    >
      <div
        data-testid="parser-landing-editorial-frame-viewport"
        className="relative h-full min-h-[100dvh] w-full"
      >
        <div
          data-testid="parser-landing-frame-top"
          className="absolute inset-x-0 top-0 flex items-center gap-4"
        >
          <div
            aria-hidden="true"
            className="h-px flex-1 bg-border-hairline/60"
          />
          <p
            data-testid="parser-landing-eyebrow"
            className="bg-surface-base px-4 py-1 font-mono text-[10px] font-medium tracking-[0.32em] text-fg-subtle/60 uppercase sm:text-[11px]"
          >
            {workspaceName}
          </p>
          <div
            aria-hidden="true"
            className="h-px flex-1 bg-border-hairline/60"
          />
        </div>
        <div
          data-testid="parser-landing-frame-corner-tl"
          aria-hidden="true"
          className="absolute top-0 left-0 hidden h-2.5 w-2.5 border-border-hairline/65 border-t border-l md:block"
        />
        <div
          data-testid="parser-landing-frame-corner-tr"
          aria-hidden="true"
          className="absolute top-0 right-0 hidden h-2.5 w-2.5 border-border-hairline/65 border-t border-r md:block"
        />
      </div>
    </div>
  );
}
