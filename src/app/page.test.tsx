import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUI } from '@/components/chat/ChatUI';

describe('Homepage Chat UI', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();

    // Mock fetch for the chat submission
    window.fetch = vi.fn().mockImplementation(async (url, options) => {
      if (url === '/api/chat') {
        const body = JSON.parse(options.body);
        const message = body?.message || '';

        if (message.includes('throw error')) {
          return new Response(null, {
            status: 500,
            statusText: 'Internal Server Error',
          });
        }

        const chunks = [
          'I ',
          'can ',
          'help ',
          'onboard ',
          'Side ',
          'Quest ',
          'Syndicate ',
          'by ',
          'clarifying ',
          'the ',
          'brand ',
          'voice, ',
          'identifying ',
          'content ',
          'pillars, ',
          'drafting ',
          'first-week ',
          'post ',
          'ideas, ',
          'and ',
          'preparing ',
          'items ',
          'for ',
          'editorial ',
          'approval.',
        ];

        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ conversationId: 'test-id' })}\n`,
              ),
            );
            for (const chunk of chunks) {
              controller.enqueue(
                new TextEncoder().encode(`${JSON.stringify({ chunk })}\n`),
              );
            }
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        });
      }
      return new Response(null, { status: 404 });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the initial empty state correctly', () => {
    render(<ChatUI />);
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Side Quest Syndicate/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type a message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('allows typing and disables submit when empty', () => {
    render(<ChatUI />);

    const input = screen.getByLabelText('Type a message');
    const submitBtn = screen.getByRole('button', { name: 'Send message' });

    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.change(input, { target: { value: '' } });
    expect(submitBtn).toBeDisabled();
  });

  it('ignores whitespace-only submissions', () => {
    render(<ChatUI />);

    const input = screen.getByLabelText('Type a message');
    fireEvent.change(input, { target: { value: '   ' } });

    const submitBtn = screen.getByRole('button', { name: 'Send message' });
    expect(submitBtn).toBeDisabled();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });

  it('submits on Enter but not on Shift+Enter', () => {
    render(<ChatUI />);

    const input = screen.getByLabelText('Type a message');

    fireEvent.change(input, { target: { value: 'Line 1\nLine 2' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(screen.queryByText('You')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2/)).toBeInTheDocument();
  });

  it('streams the assistant response deterministically and locks composer', async () => {
    render(<ChatUI />);

    const input = screen.getByLabelText('Type a message');
    const submitBtn = screen.getByRole('button', { name: 'Send message' });

    fireEvent.change(input, { target: { value: 'Tell me a story' } });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Tell me a story')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(submitBtn).toBeDisabled();

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent('Assistant is typing...');

    await waitFor(() => {
      expect(screen.getByText('Editorial Assistant')).toBeInTheDocument();
    });

    expect(screen.getByText('Editorial Assistant')).toBeInTheDocument();

    await waitFor(() => {
      expect(input).not.toBeDisabled();
      expect(statusRegion).toBeEmptyDOMElement();
    });
  });

  it('renders the error state upon "throw error" prompt', async () => {
    render(<ChatUI />);

    const input = screen.getByLabelText('Type a message');
    const submitBtn = screen.getByRole('button', { name: 'Send message' });

    fireEvent.change(input, { target: { value: 'throw error' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Failed to generate response/i }),
      ).toBeInTheDocument();
    });

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toHaveTextContent(
      'Error: Failed to generate response',
    );

    expect(input).not.toBeDisabled();
  });

  it('does not show the new conversation button on empty state', () => {
    render(<ChatUI />);
    const toolbar = screen.getByTestId('conversation-toolbar');
    // The toolbar is kept in the DOM (to reserve layout space) but hidden via
    // the `invisible` class when there are no messages.
    expect(toolbar).toHaveClass('invisible');
  });

  it('resets to empty state when new conversation is clicked', async () => {
    render(
      <ChatUI
        initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hello' }]}
        conversationId="conv-1"
      />,
    );

    // Conversation is visible and button is present
    expect(screen.getByText('Hello')).toBeInTheDocument();
    const btn = screen.getByTestId('new-conversation-btn');
    expect(screen.getByTestId('conversation-toolbar')).not.toHaveClass(
      'invisible',
    );

    fireEvent.click(btn);

    // Empty state should be restored
    await waitFor(() => {
      expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    expect(screen.getByTestId('conversation-toolbar')).toHaveClass('invisible');
  });
});
