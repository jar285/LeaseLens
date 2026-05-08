import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessageProps } from './ChatMessage';
import { ChatTranscript } from './ChatTranscript';

const baseMessages: ChatMessageProps[] = [
  { id: 'user-1', role: 'user', content: 'Hello' },
  { id: 'assistant-1', role: 'assistant', content: 'First response' },
];

function setScrollMetrics(
  element: HTMLElement,
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    value: metrics.scrollTop,
    writable: true,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: metrics.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: metrics.clientHeight,
  });
}

function mockScrollTo(element: HTMLElement) {
  const scrollTo = vi.fn();
  Object.defineProperty(element, 'scrollTo', {
    configurable: true,
    value: scrollTo,
  });
  return scrollTo;
}

describe('ChatTranscript', () => {
  afterEach(() => {
    cleanup();
  });

  it('scrolls to the bottom when pinned and content updates', () => {
    const { rerender } = render(
      <ChatTranscript messages={baseMessages} workspaceName="Test" />,
    );
    const scrollContainer = screen.getByTestId('chat-transcript-scroll');
    setScrollMetrics(scrollContainer, {
      scrollTop: 200,
      scrollHeight: 300,
      clientHeight: 100,
    });
    const scrollTo = mockScrollTo(scrollContainer);

    fireEvent.scroll(scrollContainer);
    rerender(
      <ChatTranscript
        messages={[
          baseMessages[0],
          { ...baseMessages[1], content: 'First response plus more text' },
        ]}
        workspaceName="Test"
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: 300,
      behavior: 'smooth',
    });
  });

  it('does not scroll streamed content when the user has scrolled away', () => {
    const { rerender } = render(
      <ChatTranscript messages={baseMessages} workspaceName="Test" />,
    );
    const scrollContainer = screen.getByTestId('chat-transcript-scroll');
    setScrollMetrics(scrollContainer, {
      scrollTop: 25,
      scrollHeight: 300,
      clientHeight: 100,
    });
    const scrollTo = mockScrollTo(scrollContainer);

    fireEvent.scroll(scrollContainer);
    rerender(
      <ChatTranscript
        messages={[
          baseMessages[0],
          { ...baseMessages[1], content: 'First response plus more text' },
        ]}
        workspaceName="Test"
      />,
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resets to pinned and scrolls when message count increases', () => {
    const { rerender } = render(
      <ChatTranscript messages={baseMessages} workspaceName="Test" />,
    );
    const scrollContainer = screen.getByTestId('chat-transcript-scroll');
    setScrollMetrics(scrollContainer, {
      scrollTop: 25,
      scrollHeight: 420,
      clientHeight: 100,
    });
    const scrollTo = mockScrollTo(scrollContainer);

    fireEvent.scroll(scrollContainer);
    rerender(
      <ChatTranscript
        messages={[
          ...baseMessages,
          { id: 'assistant-2', role: 'assistant', content: 'New response' },
        ]}
        workspaceName="Test"
      />,
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: 420,
      behavior: 'smooth',
    });
  });

  it('renders empty-state suggestion controls', () => {
    render(
      <ChatTranscript
        messages={[]}
        onSelectPrompt={vi.fn()}
        workspaceName="LeaseLens"
      />,
    );

    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    // Sprint 13: empty state surfaces the standard-scan prompt.
    expect(
      screen.getByRole('button', { name: /standard scan/i }),
    ).toBeInTheDocument();
  });

  it('renders follow-up chips under the latest assistant message', () => {
    const onSelectPrompt = vi.fn();

    render(
      <ChatTranscript
        messages={baseMessages}
        onSelectPrompt={onSelectPrompt}
        workspaceName="Side Quest Syndicate"
      />,
    );

    // Phase 10.8 — follow-ups rewritten for LeaseLens. The first chip
    // surfaces the "draft emails" continuation (the most common next
    // action after the agent grades clauses).
    const draftBtn = screen.getByRole('button', { name: /Draft emails/i });
    expect(draftBtn).toBeInTheDocument();

    fireEvent.click(draftBtn);

    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt.mock.calls[0][0]).toMatch(
      /draft_negotiation_email/i,
    );
  });

  it('renders a "what to fix first" chip that asks the agent to prioritize', () => {
    const onSelectPrompt = vi.fn();

    render(
      <ChatTranscript
        messages={baseMessages}
        onSelectPrompt={onSelectPrompt}
        workspaceName="Side Quest Syndicate"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /What to fix first/i }));

    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt.mock.calls[0][0]).toMatch(
      /rank the red flags|push back on first|prioritize/i,
    );
  });

  it('Round 3 — propagates workspaceName to the rendered empty state', () => {
    render(
      <ChatTranscript
        messages={[]}
        onSelectPrompt={vi.fn()}
        workspaceName="Acme"
      />,
    );
    // Heading uses workspaceName, not the hardcoded sample brand.
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Side Quest Syndicate/i }),
    ).not.toBeInTheDocument();
  });
});
