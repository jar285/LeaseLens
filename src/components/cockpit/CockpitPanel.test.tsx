import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CockpitPanel } from './CockpitPanel';

describe('CockpitPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the title in an h2', () => {
    render(
      <CockpitPanel title="Per-tool activity" testId="per-tool-stats-panel">
        body
      </CockpitPanel>,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Per-tool activity' }),
    ).toBeInTheDocument();
  });

  it('renders a subtitle node when provided', () => {
    render(
      <CockpitPanel
        title="Spend"
        subtitle={<span data-testid="sub">Today · global</span>}
        testId="spend-panel"
      >
        body
      </CockpitPanel>,
    );
    expect(screen.getByTestId('sub')).toBeInTheDocument();
  });

  it('omits the subtitle slot when no subtitle prop is given', () => {
    render(
      <CockpitPanel title="No-sub" testId="no-sub-panel">
        body
      </CockpitPanel>,
    );
    // No subtitle rendered means no <p> sibling under the title's div.
    const heading = screen.getByRole('heading', { level: 2, name: 'No-sub' });
    const headerCol = heading.parentElement;
    // Header column should contain exactly the heading element (no <p>).
    expect(headerCol?.querySelectorAll('p').length ?? 0).toBe(0);
  });

  it('renders children inside the panel body', () => {
    render(
      <CockpitPanel title="t" testId="kids-panel">
        <div data-testid="child">hello body</div>
      </CockpitPanel>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello body');
  });

  it('forwards testId as data-testid on the root <section>', () => {
    render(
      <CockpitPanel title="t" testId="my-panel">
        body
      </CockpitPanel>,
    );
    const root = screen.getByTestId('my-panel');
    expect(root.tagName).toBe('SECTION');
  });

  it('renders a refresh button when onRefresh is provided', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <CockpitPanel title="t" testId="refreshable" onRefresh={onRefresh}>
        body
      </CockpitPanel>,
    );
    expect(
      screen.getByRole('button', { name: /refresh panel/i }),
    ).toBeInTheDocument();
  });

  it('omits the refresh button when onRefresh is not provided', () => {
    render(
      <CockpitPanel title="t" testId="no-refresh">
        body
      </CockpitPanel>,
    );
    expect(
      screen.queryByRole('button', { name: /refresh panel/i }),
    ).not.toBeInTheDocument();
  });

  it('invokes the onRefresh callback when the refresh button is clicked', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(
      <CockpitPanel title="t" testId="refreshable" onRefresh={onRefresh}>
        body
      </CockpitPanel>,
    );
    fireEvent.click(screen.getByRole('button', { name: /refresh panel/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
