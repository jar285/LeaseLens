// Sprint 41 — ContentPageShell is the shared chrome for the static content
// pages (/faq, /privacy, /sources): a slim brand-lockup-links-home banner, an
// editorial title block, and the shared SiteFooter. It deliberately does NOT
// reuse the server-data-coupled global masthead, and carries no controls
// (no theme toggle / role switcher) — it is a calm secondary surface.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContentPageShell } from './ContentPageShell';

afterEach(cleanup);

function renderShell() {
  return render(
    <ContentPageShell
      eyebrow="Frequently asked"
      title="FAQ"
      intro="Short intro."
    >
      <p>Body content here</p>
    </ContentPageShell>,
  );
}

describe('ContentPageShell', () => {
  it('renders banner, main, and the footer landmark', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });

  it('links the brand lockup home', () => {
    renderShell();
    const banner = screen.getByRole('banner');
    const home = within(banner).getByRole('link', { name: /leaselens/i });
    expect(home).toHaveAttribute('href', '/');
  });

  it('renders the eyebrow, title heading, intro, and children', () => {
    renderShell();
    expect(screen.getByText('Frequently asked')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FAQ' })).toBeInTheDocument();
    expect(screen.getByText('Short intro.')).toBeInTheDocument();
    expect(screen.getByText('Body content here')).toBeInTheDocument();
  });

  it('keeps the header minimal — no controls (Sprint 41)', () => {
    renderShell();
    const banner = screen.getByRole('banner');
    expect(within(banner).queryAllByRole('button')).toHaveLength(0);
  });

  it('carries the theme toggle in the footer, not the header (Sprint 42)', () => {
    renderShell();
    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toBeInTheDocument();
    // The toggle lives in the footer chrome, never in the page banner.
    expect(
      within(screen.getByRole('banner')).queryByTestId('theme-toggle'),
    ).toBeNull();
  });
});
