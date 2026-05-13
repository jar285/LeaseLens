// Sprint 23d Phase 1 — SeverityBadge primitive.
//
// Triple-channel severity rendering: icon + text label + colour. The
// icon is the load-bearing addition (handoff §19 — severity must not be
// communicated by colour alone), and it's marked aria-hidden because
// the text label already carries the semantic information for screen
// readers.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Severity } from './grading';
import { SeverityBadge } from './SeverityBadge';

afterEach(cleanup);

describe('SeverityBadge', () => {
  it('renders the severity label text for each tier', () => {
    const cases: Array<{ severity: Severity; expected: string }> = [
      { severity: 'high', expected: 'High' },
      { severity: 'medium', expected: 'Med' },
      { severity: 'low', expected: 'Low' },
      { severity: 'ok', expected: 'OK' },
    ];
    for (const { severity, expected } of cases) {
      cleanup();
      render(<SeverityBadge severity={severity} />);
      const badge = screen.getByTestId('severity-badge');
      expect(badge).toHaveTextContent(expected);
    }
  });

  it('includes a decorative (aria-hidden) icon for every severity tier', () => {
    for (const severity of ['high', 'medium', 'low', 'ok'] as Severity[]) {
      cleanup();
      render(<SeverityBadge severity={severity} />);
      const badge = screen.getByTestId('severity-badge');
      const svg = badge.querySelector('svg');
      expect(
        svg,
        `severity ${severity} should render an svg icon`,
      ).not.toBeNull();
      // The icon is decorative — semantic info comes from the text label.
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('applies the per-severity colour utility classes', () => {
    render(<SeverityBadge severity="high" />);
    const badge = screen.getByTestId('severity-badge');
    expect(badge.className).toMatch(/bg-danger-/);
    expect(badge.className).toMatch(/text-danger-/);
  });

  it('uses different icons per severity (no shared icon across tiers)', () => {
    const iconShapes = new Map<Severity, string>();
    for (const severity of ['high', 'medium', 'low', 'ok'] as Severity[]) {
      cleanup();
      render(<SeverityBadge severity={severity} />);
      const svg = screen.getByTestId('severity-badge').querySelector('svg');
      // lucide-react inlines the icon's <path>/<circle> children with
      // unique geometry per icon. Use innerHTML as the fingerprint —
      // it diverges even when the outer <svg> attributes look similar.
      iconShapes.set(severity, svg?.innerHTML ?? '');
    }
    const uniqueIcons = new Set(iconShapes.values());
    expect(uniqueIcons.size).toBe(4);
  });

  it('size="sm" renders a tighter pill than size="md" (default)', () => {
    const { rerender } = render(<SeverityBadge severity="high" />);
    const defaultClassName = screen.getByTestId('severity-badge').className;
    rerender(<SeverityBadge severity="high" size="sm" />);
    const smClassName = screen.getByTestId('severity-badge').className;
    expect(smClassName).not.toBe(defaultClassName);
    // The sm variant carries a smaller text utility (10px vs 11px).
    expect(smClassName).toMatch(/text-\[10px\]|text-xs/);
  });

  it('label is visible to screen readers (icon does not subsume the name)', () => {
    render(<SeverityBadge severity="high" />);
    // The badge has a visible text node "High"; the role/name pattern
    // here is "the visible label is the accessible name".
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
