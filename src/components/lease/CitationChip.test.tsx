// Sprint 13 §3f / Sprint 18 §4 — citation chip.
// Two render shapes: clickable button (when onClick is set) vs static
// span (read-only / audit). Tests cover both branches.

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CitationChip } from './CitationChip';

afterEach(cleanup);

describe('CitationChip', () => {
  it('renders the statute citation as the visible label', () => {
    render(<CitationChip statuteCitation="NJ Stat 46:8-21.2" />);
    expect(screen.getByText('NJ Stat 46:8-21.2')).toBeInTheDocument();
  });

  it('renders as a button when onClick is provided', () => {
    const onClick = vi.fn();
    render(
      <CitationChip statuteCitation="NJ Stat 46:8-21.2" onClick={onClick} />,
    );
    const btn = screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a non-interactive span when onClick is omitted', () => {
    render(<CitationChip statuteCitation="NJ Stat 46:8-21.2" />);
    // No button role — the chip is purely presentational.
    expect(
      screen.queryByRole('button', { name: /NJ Stat 46:8-21\.2/ }),
    ).not.toBeInTheDocument();
    // The testId is still present so callers can locate it.
    expect(screen.getByTestId('citation-chip').tagName).toBe('SPAN');
  });

  it('enriches the aria-label with the page number when provided', () => {
    render(
      <CitationChip
        statuteCitation="NJ Stat 46:8-21.2"
        pageNumber={3}
        onClick={() => {}}
      />,
    );
    const btn = screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ });
    expect(btn.getAttribute('aria-label')).toMatch(/page 3/i);
  });

  it('omits page info from the aria-label when pageNumber is not provided', () => {
    render(
      <CitationChip statuteCitation="NJ Stat 46:8-21.2" onClick={() => {}} />,
    );
    const btn = screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ });
    expect(btn.getAttribute('aria-label')).toBe('NJ Stat 46:8-21.2');
  });

  // S20.4 — long citations clipped horizontally in the right-pane red
  // flags. The chip text now wraps to 2 lines (clamp + ellipsis), the
  // hover tooltip carries the full citation, and break-words prevents
  // a super-long word from punching through the card.
  describe('S20.4 — overflow handling', () => {
    const LONG =
      'NJ does not have a statute that broadly prohibits or restricts subletting in residential leases — but several decisions';

    it('clamps the visible text to 2 lines with the line-clamp-2 utility', () => {
      render(<CitationChip statuteCitation={LONG} />);
      const text = screen.getByText(LONG);
      expect(text.className).toMatch(/\bline-clamp-2\b/);
      // Single-line truncate is gone; we don't want both classes
      // active (truncate forces overflow:hidden + nowrap and beats
      // line-clamp at the cascade).
      expect(text.className).not.toMatch(/\btruncate\b/);
    });

    it('allows long unbreakable words to wrap inside the chip (break-words)', () => {
      render(<CitationChip statuteCitation={LONG} />);
      expect(screen.getByText(LONG).className).toMatch(/\bbreak-words\b/);
    });

    it('sets the title attribute on the button variant for native tooltip', () => {
      render(<CitationChip statuteCitation={LONG} onClick={() => {}} />);
      const btn = screen.getByRole('button', {
        name: new RegExp(LONG.slice(0, 20)),
      });
      expect(btn.getAttribute('title')).toBe(LONG);
    });

    it('sets the title attribute on the static span variant too', () => {
      render(<CitationChip statuteCitation={LONG} />);
      const span = screen.getByTestId('citation-chip');
      expect(span.getAttribute('title')).toBe(LONG);
    });
  });
});
