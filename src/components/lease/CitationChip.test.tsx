// Sprint 13 §3f — presentation-only citation pill. Click handling
// is wired by the parent so the chip itself is fully testable in
// isolation.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CitationChip } from './CitationChip';

afterEach(cleanup);

describe('CitationChip', () => {
  it('renders the statute citation as the visible label', () => {
    render(<CitationChip statuteCitation="NJ Stat 46:8-21.2" />);
    expect(
      screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ }),
    ).toBeInTheDocument();
  });

  it('invokes onClick when activated', () => {
    const onClick = vi.fn();
    render(
      <CitationChip statuteCitation="NJ Stat 46:8-21.2" onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders without onClick (still presentational)', () => {
    expect(() =>
      render(<CitationChip statuteCitation="NJ Stat 46:8-21.2" />),
    ).not.toThrow();
    // No throw on click either.
    fireEvent.click(screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/ }));
  });

  it('exposes pageNumber via an accessible label when provided', () => {
    render(
      <CitationChip
        statuteCitation="NJ Stat 46:8-21.2"
        pageNumber={3}
        onClick={() => {}}
      />,
    );
    const button = screen.getByRole('button', {
      name: /NJ Stat 46:8-21\.2/,
    });
    expect(button.getAttribute('aria-label')).toMatch(/page 3/i);
  });
});
