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
});
