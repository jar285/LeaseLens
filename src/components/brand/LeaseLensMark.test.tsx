import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaseLensMark } from './LeaseLensMark';

vi.mock('motion/react', async () => {
  const actual =
    await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

describe('LeaseLensMark', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders an accessible img-role SVG with a LeaseLens label', () => {
    const { getByRole } = render(<LeaseLensMark />);
    const svg = getByRole('img');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-label', 'LeaseLens');
  });

  it('honours the size prop on both width and height', () => {
    const { getByRole } = render(<LeaseLensMark size={32} />);
    const svg = getByRole('img');
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('forwards a className', () => {
    const { getByRole } = render(<LeaseLensMark className="text-white" />);
    expect(getByRole('img').getAttribute('class')).toContain('text-white');
  });

  it('always renders the static document and magnifying glass shapes', () => {
    const { getByRole } = render(<LeaseLensMark animated={false} />);
    const svg = getByRole('img');
    // Document frame
    expect(svg.querySelector('rect')).toBeInTheDocument();
    // Three text lines
    expect(
      svg.querySelectorAll('line[stroke-width="1.5"]').length,
    ).toBeGreaterThanOrEqual(3);
    // Lens (circle) + handle (line)
    expect(svg.querySelector('circle')).toBeInTheDocument();
  });
});
