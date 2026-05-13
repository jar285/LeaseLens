import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatEmptyState } from './ChatEmptyState';

describe('ChatEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the heading using the workspaceName prop', () => {
    render(<ChatEmptyState workspaceName="LeaseLens — NJ Tenant Law" />);
    expect(
      screen.getByRole('heading', { name: /LeaseLens/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Side Quest Syndicate/i }),
    ).not.toBeInTheDocument();
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
  describe('Sprint 23c — compact premium card', () => {
    it('brand badge wrapper uses h-12 w-12 (was h-14 w-14)', () => {
      const { container } = render(
        <ChatEmptyState workspaceName="LeaseLens" />,
      );
      // The brand badge is the first child motion.div under the empty-state
      // wrapper; its className carries the sizing utilities.
      const badge = container.querySelector(
        '[data-testid="chat-empty-state"] > :first-child',
      ) as HTMLElement | null;
      expect(badge).not.toBeNull();
      expect(badge?.className).toMatch(/\bh-12\b/);
      expect(badge?.className).toMatch(/\bw-12\b/);
      expect(badge?.className).not.toMatch(/\bh-14\b/);
    });

    it('H1 uses text-2xl with sm:text-3xl (was text-3xl sm:text-4xl)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const h1 = screen.getByRole('heading', { name: /LeaseLens/i });
      expect(h1.className).toMatch(/\btext-2xl\b/);
      expect(h1.className).toMatch(/\bsm:text-3xl\b/);
      expect(h1.className).not.toMatch(/\bsm:text-4xl\b/);
    });

    it('description paragraph uses max-w-sm + mb-8 (was max-w-md + mb-10)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      // The description sits right after the H1; locate it by partial text.
      const desc = screen.getByText(/Drop a NJ residential lease/);
      expect(desc.className).toMatch(/\bmax-w-sm\b/);
      expect(desc.className).toMatch(/\bmb-8\b/);
      expect(desc.className).not.toMatch(/\bmax-w-md\b/);
    });

    it('starter cards use p-3.5 (was p-4)', () => {
      render(<ChatEmptyState workspaceName="LeaseLens" />);
      const card = screen.getByRole('button', { name: /standard scan/i });
      expect(card.className).toMatch(/\bp-3\.5\b/);
      expect(card.className).not.toMatch(/\bp-4\b/);
    });
  });
});
