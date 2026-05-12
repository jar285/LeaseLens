import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the required title', () => {
    render(<EmptyState title="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders optional icon, description, and actions when provided', () => {
    render(
      <EmptyState
        icon={<span data-testid="empty-icon" aria-hidden="true" />}
        title="Drop a lease"
        description="We will scan it for red flags."
        actions={
          <button type="button" data-testid="empty-action">
            Get started
          </button>
        }
      />,
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(
      screen.getByText('We will scan it for red flags.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('empty-action')).toBeInTheDocument();
  });

  it('omits the description block entirely when not provided', () => {
    const { container } = render(<EmptyState title="No description" />);
    // Description block carries the muted text class; assert it's not in the DOM.
    expect(container.querySelector('.text-fg-muted')).toBeNull();
  });

  it('uses center align by default and switches to top when requested', () => {
    const { rerender, container } = render(<EmptyState title="x" />);
    const centered = container.firstChild as HTMLElement;
    expect(centered.className).toContain('min-h-[60vh]');
    expect(centered.className).toContain('justify-center');

    rerender(<EmptyState title="x" align="top" />);
    const topped = container.firstChild as HTMLElement;
    expect(topped.className).not.toContain('min-h-[60vh]');
    expect(topped.className).not.toContain('justify-center');
  });

  it('forwards a testId to the outermost element', () => {
    render(<EmptyState title="x" testId="my-empty" />);
    expect(screen.getByTestId('my-empty')).toBeInTheDocument();
  });
});
