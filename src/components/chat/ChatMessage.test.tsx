// biome-ignore-all lint/a11y/useValidAriaRole: the `role` prop here is the
// ChatMessage component's prop ('user' | 'assistant'), not an ARIA role
// attribute. Biome can't distinguish JSX props from HTML attributes.

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

import { ChatMessage } from './ChatMessage';

describe('ChatMessage — TypingIndicator integration', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });
  afterEach(cleanup);

  it('renders TypingIndicator for empty streaming assistant message with no tool invocations', () => {
    render(<ChatMessage id="m1" role="assistant" content="" isStreaming />);
    expect(
      screen.getByRole('status', { name: 'Assistant is composing' }),
    ).toBeInTheDocument();
  });

  it('renders content (not the indicator) when content is non-empty', () => {
    render(<ChatMessage id="m1" role="assistant" content="hi" isStreaming />);
    expect(
      screen.queryByRole('status', { name: 'Assistant is composing' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('does NOT render TypingIndicator when a tool invocation is in flight (Spec §4.9 four-clause)', () => {
    render(
      <ChatMessage
        id="m1"
        role="assistant"
        content=""
        isStreaming
        toolInvocations={[
          {
            id: 't1',
            name: 'schedule_content_item',
            input: { document_slug: 'brand-identity' },
          },
        ]}
      />,
    );
    expect(
      screen.queryByRole('status', { name: 'Assistant is composing' }),
    ).not.toBeInTheDocument();
  });
});

describe('ChatMessage — Sprint 12 motion entry', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
  });
  afterEach(cleanup);

  it('assistant message carries data-motion="on" once mounted (reduced-motion off)', async () => {
    useReducedMotionMock.mockReturnValue(false);
    render(<ChatMessage id="m1" role="assistant" content="hello" />);
    await waitFor(() => {
      const li = screen.getByRole('listitem');
      expect(li.getAttribute('data-motion')).toBe('on');
    });
  });

  it('assistant message carries data-motion="off" when reduced-motion is on', () => {
    useReducedMotionMock.mockReturnValue(true);
    render(<ChatMessage id="m1" role="assistant" content="hello" />);
    const li = screen.getByRole('listitem');
    expect(li.getAttribute('data-motion')).toBe('off');
  });

  it('user message carries data-motion="off" regardless of reduced-motion setting', () => {
    useReducedMotionMock.mockReturnValue(false);
    render(<ChatMessage id="m1" role="user" content="hi from user" />);
    const li = screen.getByRole('listitem');
    expect(li.getAttribute('data-motion')).toBe('off');
  });
});
