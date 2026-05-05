import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatEmptyState } from './ChatEmptyState';

describe('ChatEmptyState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the heading using the workspaceName prop', () => {
    render(<ChatEmptyState workspaceName="GitLab" />);
    expect(screen.getByRole('heading', { name: 'GitLab' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Side Quest Syndicate/i }),
    ).not.toBeInTheDocument();
  });

  it('templates each suggested prompt with the workspaceName', () => {
    const onSelectPrompt = vi.fn();
    render(
      <ChatEmptyState workspaceName="Acme" onSelectPrompt={onSelectPrompt} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Define Brand Voice/i }),
    );
    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt.mock.calls[0][0]).toMatch(/Acme/);
    expect(onSelectPrompt.mock.calls[0][0]).not.toMatch(/Side Quest Syndicate/);
  });

  it('all four suggested prompts contain the workspaceName', () => {
    const onSelectPrompt = vi.fn();
    render(
      <ChatEmptyState
        workspaceName="Riverbrook"
        onSelectPrompt={onSelectPrompt}
      />,
    );

    for (const label of [
      /Define Brand Voice/i,
      /Map Content Pillars/i,
      /Plan First Week/i,
      /Review Approval Flow/i,
    ]) {
      onSelectPrompt.mockClear();
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(onSelectPrompt).toHaveBeenCalledTimes(1);
      const prompt = onSelectPrompt.mock.calls[0][0] as string;
      expect(
        prompt,
        `prompt for ${label} should contain workspaceName`,
      ).toMatch(/Riverbrook/);
      expect(
        prompt,
        `prompt for ${label} should NOT mention Side Quest Syndicate`,
      ).not.toMatch(/Side Quest Syndicate/);
    }
  });
});
