import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a screen-reader label via role="status"', () => {
    render(<LoadingState ariaLabel="Tool is running" />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent('Tool is running');
  });

  it('renders three default bars when no bars prop provided', () => {
    const { container } = render(<LoadingState ariaLabel="Loading…" />);
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars).toHaveLength(3);
    // Default mix: 2/3, 1/2, 3/4
    expect(bars[0].className).toContain('w-2/3');
    expect(bars[1].className).toContain('w-1/2');
    expect(bars[2].className).toContain('w-3/4');
  });

  it('renders the exact widths passed via the bars prop', () => {
    const { container } = render(
      <LoadingState
        ariaLabel="Loading…"
        bars={['1/4', 'full', '1/2', '1/3', '4/5']}
      />,
    );
    const bars = container.querySelectorAll('.animate-pulse');
    expect(bars).toHaveLength(5);
    expect(bars[0].className).toContain('w-1/4');
    expect(bars[1].className).toContain('w-full');
    expect(bars[4].className).toContain('w-4/5');
  });

  it('uses the requested bar height', () => {
    const { container } = render(
      <LoadingState ariaLabel="Loading…" barHeight="h-4" />,
    );
    const firstBar = container.querySelector('.animate-pulse');
    expect(firstBar?.className).toContain('h-4');
  });

  it('renders custom children in place of the default bars', () => {
    render(
      <LoadingState ariaLabel="Loading…">
        <div data-testid="custom-skeleton">Custom shape</div>
      </LoadingState>,
    );
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
    // Default bars should not have rendered
    const status = screen.getByRole('status');
    expect(status.querySelector('.animate-pulse')).toBeNull();
  });

  it('forwards a testId to the outermost element', () => {
    render(<LoadingState ariaLabel="Loading…" testId="my-loading" />);
    expect(screen.getByTestId('my-loading')).toBeInTheDocument();
  });
});
