'use client';

/*
 * Sprint 13 §3f / Sprint 18 §4 — clickable statute citation.
 *
 * Renders a small accent-coloured "📎 NJ Stat …" row. When `onClick`
 * is provided the chip becomes a real button (keyboard reachable,
 * focus ring), otherwise it falls back to a presentation-only span
 * for places that only need to display the citation (e.g. read-only
 * audit views).
 *
 * Sprint 18 §4 rewrite: dropped the legacy paperclip emoji + monospace
 * pill in favour of the lucide Paperclip icon + accent text already used
 * inline by RedFlagReport and GradingDetailBlock. Both surfaces now
 * import this component instead of duplicating the markup, so the
 * citation visual stays in lock-step.
 */

import { Paperclip } from 'lucide-react';

export interface CitationChipProps {
  /** Statute citation text — e.g. "NJ Stat 46:8-19". */
  statuteCitation: string;
  /** Page number the citation refers to. Used to enrich the aria-label and
   *  for callers that want to scroll the PDF on click. The handler is
   *  passed in via `onClick`; this prop is purely informational. */
  pageNumber?: number;
  /** Optional click handler. When set, the chip becomes a button. When
   *  omitted, the chip renders as a static span. */
  onClick?: () => void;
}

// S20.4 — switched from single-line `truncate` to a 2-line clamp so
// long citations like "NJ does not have a statute that broadly..."
// stay inside the red-flag card instead of clipping at the right edge.
// `break-words` prevents an unhyphenable run from punching out of the
// container; the native `title` attribute exposes the full citation
// as a hover tooltip for sighted users (screen readers already get
// the full text via aria-label on the button variant).
//
// Sprint 23h — citation text + icon switched to the new `--color-citation`
// (ink-blue) token. Establishes a distinct semantic color for "this is a
// reference to NJ statute" — separate from the violet interactive primary,
// so users can read at a glance "this is a legal citation, not a button."
// Hover background + focus ring intentionally stay violet because those
// signal "this is interactive," a system-wide pattern; ink-blue is for
// the citation content itself.
const CHIP_LAYOUT_CLASS = 'flex min-w-0 items-start gap-1.5';
const CHIP_ICON_CLASS = 'h-3 w-3 shrink-0 translate-y-[2px] text-citation';
const CHIP_TEXT_CLASS =
  'min-w-0 line-clamp-2 break-words text-[12px] leading-snug font-medium text-citation';
// Sprint 23b Phase 5 — button variant gains an underline-on-hover so the
// "this is a real link to the PDF page" affordance is unambiguous.
const CHIP_TEXT_BUTTON_CLASS = `${CHIP_TEXT_CLASS} group-hover:underline`;
// Sprint 55 — a faint citation-tinted resting chip so the statute reads as a
// credential the finding rests on, not a trailing afterthought line (Source-
// Grounded-AI: citations visible + meaningful). The interactive hover stays
// accent (the system-wide "this is clickable" signal); only the resting fill
// carries the ink-blue, at very low alpha so it never competes with the text.
const CHIP_BUTTON_CLASS = `group ${CHIP_LAYOUT_CLASS} rounded-md bg-citation/[0.05] px-1.5 py-0.5 text-left transition-colors hover:bg-accent-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 dark:bg-citation/[0.1] dark:hover:bg-accent-500/10`;

export function CitationChip({
  statuteCitation,
  pageNumber,
  onClick,
}: CitationChipProps): React.JSX.Element {
  const ariaLabel = pageNumber
    ? `${statuteCitation}, jump to page ${pageNumber}`
    : statuteCitation;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        title={statuteCitation}
        data-testid="citation-chip"
        className={CHIP_BUTTON_CLASS}
      >
        <Paperclip aria-hidden="true" className={CHIP_ICON_CLASS} />
        <span className={CHIP_TEXT_BUTTON_CLASS}>{statuteCitation}</span>
      </button>
    );
  }

  return (
    <span
      data-testid="citation-chip"
      title={statuteCitation}
      className={CHIP_LAYOUT_CLASS}
    >
      <Paperclip aria-hidden="true" className={CHIP_ICON_CLASS} />
      <span className={CHIP_TEXT_CLASS}>{statuteCitation}</span>
    </span>
  );
}
