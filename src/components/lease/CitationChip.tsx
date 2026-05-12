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

const CHIP_LAYOUT_CLASS = 'flex min-w-0 items-center gap-1.5';
const CHIP_ICON_CLASS = 'h-3 w-3 shrink-0 text-accent-500 dark:text-accent-300';
const CHIP_TEXT_CLASS =
  'truncate text-[12px] font-medium text-accent-600 dark:text-accent-300';
const CHIP_BUTTON_CLASS = `${CHIP_LAYOUT_CLASS} rounded-md px-1 py-0.5 transition-colors hover:bg-accent-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 dark:hover:bg-accent-500/10`;

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
        data-testid="citation-chip"
        className={CHIP_BUTTON_CLASS}
      >
        <Paperclip aria-hidden="true" className={CHIP_ICON_CLASS} />
        <span className={CHIP_TEXT_CLASS}>{statuteCitation}</span>
      </button>
    );
  }

  return (
    <span data-testid="citation-chip" className={CHIP_LAYOUT_CLASS}>
      <Paperclip aria-hidden="true" className={CHIP_ICON_CLASS} />
      <span className={CHIP_TEXT_CLASS}>{statuteCitation}</span>
    </span>
  );
}
