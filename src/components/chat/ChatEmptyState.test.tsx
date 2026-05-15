import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatEmptyState } from './ChatEmptyState';

describe('ChatEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  // Sprint 23g — workspaceName demoted from H1 to editorial eyebrow.
  // The H1 now carries the Hero value-prop ("Find what to negotiate,
  // before you sign."); workspaceName still renders, just as the
  // small-caps mono label above the brand badge. Tests assert both.
  it('renders the workspaceName as the editorial eyebrow', () => {
    render(<ChatEmptyState workspaceName="LeaseLens — NJ Tenant Law" />);
    expect(screen.getByTestId('chat-empty-eyebrow')).toHaveTextContent(
      /LeaseLens — NJ Tenant Law/,
    );
    expect(screen.queryByTestId('chat-empty-eyebrow')).not.toHaveTextContent(
      /Side Quest Syndicate/i,
    );
  });

  it('renders the Hero value-prop headline as the H2', () => {
    render(<ChatEmptyState workspaceName="LeaseLens — NJ Tenant Law" />);
    expect(
      screen.getByRole('heading', { name: /find what to negotiate/i }),
    ).toBeInTheDocument();
  });

  it('exposes the standard scan as the first suggested prompt', () => {
    const onSelectPrompt = vi.fn();
    render(
      <ChatEmptyState workspaceName="W" onSelectPrompt={onSelectPrompt} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /standard scan/i }));
    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    const prompt = onSelectPrompt.mock.calls[0][0] as string;
    expect(prompt).toMatch(/grade.*NJ tenant law|red flag/i);
  });

  it('exposes all four LeaseLens suggested prompts', () => {
    const onSelectPrompt = vi.fn();
    render(
      <ChatEmptyState workspaceName="W" onSelectPrompt={onSelectPrompt} />,
    );

    for (const label of [
      /standard scan/i,
      /Explain a lease term/i,
      /Compare to NJ statute/i,
      /negotiation email/i,
    ]) {
      onSelectPrompt.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(onSelectPrompt).toHaveBeenCalledTimes(1);
      const prompt = onSelectPrompt.mock.calls[0][0] as string;
      expect(
        prompt,
        `prompt for ${label} should NOT mention ContentOps`,
      ).not.toMatch(/Side Quest Syndicate|brand voice|content pillars/i);
    }
  });

  // Sprint 23c Phase 1 — compact premium card. The previous landing-page-
  // hero hierarchy (h-14 badge, sm:text-4xl H1, max-w-md mb-10 description,
  // p-4 starter cards) overflowed the visible viewport on standard laptop
  // heights. Each element shrinks one notch; no features removed.
  // Sprint 23g — selectors now use stable data-testids since the eyebrow
  // sits above the badge in the new lockup.
  describe('Sprint 23c — compact premium card', () => {
    it('brand badge wrapper uses h-12 w-12 (was h-14 w-14)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const badge = screen.getByTestId('chat-empty-badge');
      expect(badge.className).toMatch(/\bh-12\b/);
      expect(badge.className).toMatch(/\bw-12\b/);
      expect(badge.className).not.toMatch(/\bh-14\b/);
    });

    it('Hero headline uses text-2xl with sm:text-3xl (was text-3xl sm:text-4xl)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const headline = screen.getByTestId('chat-empty-headline');
      expect(headline.className).toMatch(/\btext-2xl\b/);
      expect(headline.className).toMatch(/\bsm:text-3xl\b/);
      expect(headline.className).not.toMatch(/\bsm:text-4xl\b/);
    });

    it('subhead paragraph uses max-w-sm + mb-8 (was max-w-md + mb-10)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const subhead = screen.getByTestId('chat-empty-subhead');
      expect(subhead.className).toMatch(/\bmax-w-sm\b/);
      expect(subhead.className).toMatch(/\bmb-8\b/);
      expect(subhead.className).not.toMatch(/\bmax-w-md\b/);
    });

    it('starter cards use p-3.5 (was p-4)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const card = screen.getByRole('button', { name: /standard scan/i });
      expect(card.className).toMatch(/\bp-3\.5\b/);
      expect(card.className).not.toMatch(/\bp-4\b/);
    });
  });

  // Sprint 23g — credibility metric strip replaces the prior "How it
  // works" process row. Three short proof-points in Cluely's hero-metric
  // register.
  describe('Sprint 23g — trust metrics', () => {
    it('renders the three trust-metric proof-points', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const strip = screen.getByTestId('chat-empty-trust-metrics');
      expect(strip).toHaveTextContent(/15\+ clauses checked/);
      expect(strip).toHaveTextContent(/Every flag cites NJSA/);
      expect(strip).toHaveTextContent(/Plain-English explanations/);
    });
  });

  // Sprint 23i — Arabic zero-padded section markers (01 · 02 · 03) echo
  // Open Design's actual editorial section-marker treatment (the prior
  // Roman numerals were based on a hallucinated WebFetch description;
  // the real reference uses Arabic numerals).
  describe('Sprint 23i — zero-padded section markers', () => {
    it('prefixes each trust metric with a zero-padded Arabic numeral (01 · 02 · 03)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const strip = screen.getByTestId('chat-empty-trust-metrics');
      const text = strip.textContent ?? '';
      // Each numeral must appear immediately before its metric label,
      // in order. The dot in `01.*15+` is a regex any-char wildcard so
      // the assertion tolerates the whitespace/separator between them.
      expect(text).toMatch(/01.*15\+/);
      expect(text).toMatch(/02.*Every flag/);
      expect(text).toMatch(/03.*Plain-English/);
    });
  });
});
