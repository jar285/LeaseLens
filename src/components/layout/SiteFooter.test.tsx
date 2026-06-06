// Sprint 41/42 — SiteFooter is the calm-minimal site footer. Sprint 42 made
// it multi-column (Product / Resources / Legal / Tenant help), added a gated
// theme toggle, and external tenant-help links — while keeping the reused
// disclaimer + copyright, the trust-metric highlights, and the no-glass
// (calm-minimal) invariant.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEASELENS_TENANT_HELP } from '@/lib/content/tenant-help';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import { LEASELENS_TRUST_METRICS } from '@/lib/lease/trust-metrics';
import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('SiteFooter', () => {
  it('renders a contentinfo footer landmark with a labelled footer nav', () => {
    render(<SiteFooter />);
    const footer = screen.getByTestId('site-footer');
    expect(footer.tagName).toBe('FOOTER');
    expect(screen.getByRole('contentinfo')).toBe(footer);
    expect(
      screen.getByRole('navigation', { name: 'Footer' }),
    ).toBeInTheDocument();
  });

  it('groups the internal links across Product / Resources / Legal columns', () => {
    render(<SiteFooter />);
    const expected: Array<[string, string]> = [
      ['Upload a lease', '/'],
      ['How it works', '/#how-it-works'],
      ['FAQ', '/faq'],
      ['Terminology', '/terminology'],
      ['NJ law sources', '/sources'],
      ['Privacy & data', '/privacy'],
      ['Terms of use', '/terms'],
      ['Accessibility', '/accessibility'],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('renders verified tenant-help links that open in a new tab safely', () => {
    render(<SiteFooter />);
    for (const link of LEASELENS_TENANT_HELP.links) {
      const el = screen.getByRole('link', { name: new RegExp(link.label) });
      expect(el).toHaveAttribute('href', link.href);
      expect(el).toHaveAttribute('target', '_blank');
      expect(el.getAttribute('rel') ?? '').toMatch(/noopener/);
      expect(el.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  it('reuses the single-source disclaimer and stamps the current year', () => {
    render(<SiteFooter />);
    expect(
      screen.getByText(LEASELENS_DISCLAIMER, { exact: false }),
    ).toBeInTheDocument();
    const year = String(new Date().getFullYear());
    expect(
      screen.getByText(new RegExp(`©\\s*${year}\\s*LeaseLens`)),
    ).toBeInTheDocument();
  });

  it('fills the brand column with the reused trust-metric highlights', () => {
    render(<SiteFooter />);
    for (const metric of LEASELENS_TRUST_METRICS) {
      expect(screen.getByText(metric.text)).toBeInTheDocument();
    }
  });

  it('gives links a visible focus ring and a 44px touch target', () => {
    render(<SiteFooter />);
    for (const name of ['FAQ', 'Terms of use', 'Upload a lease']) {
      const link = screen.getByRole('link', { name });
      expect(link.className).toMatch(/\bmin-h-11\b/);
      expect(link.className).toMatch(/focus-visible:ring-2/);
    }
  });

  it('shows the theme toggle only when asked (gated; landing omits it)', () => {
    const { rerender } = render(<SiteFooter />);
    expect(screen.queryByTestId('theme-toggle')).not.toBeInTheDocument();
    rerender(<SiteFooter showThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('smooth-scrolls to the section for the in-page "How it works" link (Sprint 42)', () => {
    const target = document.createElement('div');
    target.id = 'how-it-works';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(<SiteFooter />);
    fireEvent.click(screen.getByRole('link', { name: 'How it works' }));

    expect(target.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    );
    target.remove();
  });

  it('honors reduced-motion (instant, not smooth) for the anchor link', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }) as MediaQueryList,
    );
    const target = document.createElement('div');
    target.id = 'how-it-works';
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(<SiteFooter />);
    fireEvent.click(screen.getByRole('link', { name: 'How it works' }));

    expect(target.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' }),
    );
    target.remove();
    vi.restoreAllMocks();
  });

  it('stays calm-minimal — hairline divider, no glass (invariant)', () => {
    render(<SiteFooter />);
    const footer = screen.getByTestId('site-footer');
    expect(footer.className).toMatch(/border-t/);
    expect(footer.className).toMatch(/border-border-hairline/);
    expect(footer.className).not.toMatch(/backdrop-blur/);
    expect(footer.className).not.toMatch(/shadow-lift/);
  });
});
