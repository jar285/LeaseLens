import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageShell } from './PageShell';

describe('PageShell', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders children inside a <main> element', () => {
    render(
      <PageShell>
        <div data-testid="content">Hello</div>
      </PageShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('defaults to fixed layout (h-screen + overflow-hidden)', () => {
    // Sprint 28.12 — switched from `h-dvh` to `h-screen`. Tailwind v4
    // emits `.h-dvh { }` with an empty body in this project's build, so
    // the viewport clamp silently did nothing and the page scrolled
    // (Bug 1, deeper root cause than the Sprint 28.10/28.11 sentinel
    // patches). `h-screen` emits `height: 100vh` reliably.
    render(
      <PageShell>
        <div />
      </PageShell>,
    );
    const main = screen.getByRole('main');
    expect(main.dataset.layout).toBe('fixed');
    expect(main.className).toContain('h-screen');
    expect(main.className).not.toContain('h-dvh');
    expect(main.className).toContain('overflow-hidden');
  });

  it('switches to page layout when requested (min-h-screen, no overflow lock)', () => {
    render(
      <PageShell layout="page">
        <div />
      </PageShell>,
    );
    const main = screen.getByRole('main');
    expect(main.dataset.layout).toBe('page');
    expect(main.className).toContain('min-h-screen');
    expect(main.className).not.toContain('h-dvh');
    expect(main.className).not.toContain('overflow-hidden');
  });

  it('applies token-driven background and text colour in both layouts', () => {
    const { rerender } = render(
      <PageShell layout="fixed">
        <div />
      </PageShell>,
    );
    let main = screen.getByRole('main');
    expect(main.className).toContain('bg-surface-base');
    expect(main.className).toContain('text-fg-default');
    expect(main.className).toContain('font-sans');

    rerender(
      <PageShell layout="page">
        <div />
      </PageShell>,
    );
    main = screen.getByRole('main');
    expect(main.className).toContain('bg-surface-base');
    expect(main.className).toContain('text-fg-default');
  });

  it('appends a custom className when provided', () => {
    render(
      <PageShell className="extra-class">
        <div />
      </PageShell>,
    );
    expect(screen.getByRole('main').className).toContain('extra-class');
  });

  it('forwards a testId', () => {
    render(
      <PageShell testId="my-shell">
        <div />
      </PageShell>,
    );
    expect(screen.getByTestId('my-shell')).toBeInTheDocument();
  });
});
