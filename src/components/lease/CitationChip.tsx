// Sprint 13 §3f — citation pill. Presentation-only — the parent wires
// onClick to scroll the PDF / open the cited statute.

'use client';

import type { CSSProperties } from 'react';

export interface CitationChipProps {
  statuteCitation: string;
  chunkId?: string;
  pageNumber?: number;
  onClick?: () => void;
}

const baseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.125rem 0.5rem',
  borderRadius: '9999px',
  fontSize: '0.75rem',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  border: '1px solid currentColor',
  background: 'transparent',
  cursor: 'pointer',
  color: 'inherit',
};

export function CitationChip({
  statuteCitation,
  pageNumber,
  onClick,
}: CitationChipProps): React.JSX.Element {
  const ariaLabel = pageNumber
    ? `${statuteCitation}, jump to page ${pageNumber}`
    : statuteCitation;

  return (
    <button
      type="button"
      onClick={onClick}
      style={baseStyle}
      aria-label={ariaLabel}
      data-testid="citation-chip"
    >
      📎 {statuteCitation}
    </button>
  );
}
