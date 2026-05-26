import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUI } from '@/components/chat/ChatUI';
import { withChatStream } from '@/components/chat/test-helpers';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';

function LeaseProbe(): React.JSX.Element {
  // Sprint 28.6 — activeLease lives on LeaseParserContext now.
  const { activeLease } = useLeaseParser();
  return (
    <div data-testid="lease-probe">{activeLease?.lease_id ?? '__empty__'}</div>
  );
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

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
    render(
      withChatStream(<ChatUI workspaceName="LeaseLens — NJ Tenant Law" />),
    );
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    // Sprint 23g — workspaceName now lives in the editorial eyebrow; the
    // Hero H2 carries the value-prop headline.
    expect(screen.getByTestId('chat-empty-eyebrow')).toHaveTextContent(
      /LeaseLens/i,
    );
    expect(
      screen.getByRole('heading', { name: /find what to negotiate/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Type a message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('submits an empty-state suggested prompt', async () => {
    render(
      withChatStream(<ChatUI workspaceName="LeaseLens — NJ Tenant Law" />),
    );

    fireEvent.click(screen.getByRole('button', { name: /standard scan/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/extract the clauses|grade.*NJ tenant law/i),
      ).toBeInTheDocument();
    });

    expect(window.fetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringMatching(/extract|standard scan|NJ tenant law/i),
      }),
    );
  });

  // S19.5 — synthetic intro chips funnel through the same submit path
  // as the empty-state starter prompts. When a lease is uploaded the
  // synthetic message replaces the welcome hero; clicking "Run standard
  // scan" should POST the canned prompt to /api/chat and surface it
  // in the transcript as a user turn.
  it('submits the canned prompt when an intro chip is clicked (lease uploaded)', async () => {
    render(
      withChatStream(<ChatUI workspaceName="LeaseLens — NJ Tenant Law" />, {
        activeLease: { lease_id: 'lease-x', filename: 'my-lease.pdf' },
      }),
    );

    // Sanity check — the synthetic intro is rendered.
    expect(screen.getByText(/my-lease\.pdf/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /run standard scan/i }));

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith(
        '/api/chat',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringMatching(/standard scan|extract|grade/i),
        }),
      );
    });

    // The user turn appears in the transcript.
    expect(
      screen.getByText(/run a standard scan on this lease/i),
    ).toBeInTheDocument();
  });

  it('allows typing and disables submit when empty', () => {
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));

    const input = screen.getByLabelText('Type a message');
    const submitBtn = screen.getByRole('button', { name: 'Send message' });

    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.change(input, { target: { value: '' } });
    expect(submitBtn).toBeDisabled();
  });

  it('ignores whitespace-only submissions', () => {
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));

    const input = screen.getByLabelText('Type a message');
    fireEvent.change(input, { target: { value: '   ' } });

    const submitBtn = screen.getByRole('button', { name: 'Send message' });
    expect(submitBtn).toBeDisabled();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });

  it('submits on Enter but not on Shift+Enter', () => {
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));

    const input = screen.getByLabelText('Type a message');

    fireEvent.change(input, { target: { value: 'Line 1\nLine 2' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(screen.queryByText('You')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2/)).toBeInTheDocument();
  });

  it('streams the assistant response deterministically and locks composer', async () => {
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));

    const input = screen.getByLabelText('Type a message');
    const submitBtn = screen.getByRole('button', { name: 'Send message' });

    fireEvent.change(input, { target: { value: 'Tell me a story' } });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Tell me a story')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(submitBtn).toBeDisabled();

    // Sprint 9: there are now two role=status elements during streaming —
    // the SR-only aria-live announcer (this one) AND the in-bubble
    // TypingIndicator (`name: Assistant is composing`). Disambiguate via
    // the text the announcer carries.
    const statusRegion = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.includes('Assistant is typing'));
    expect(statusRegion).toBeDefined();
    expect(statusRegion).toHaveTextContent('Assistant is typing...');

    await waitFor(() => {
      expect(screen.getByText('Editorial Assistant')).toBeInTheDocument();
    });

    expect(screen.getByText('Editorial Assistant')).toBeInTheDocument();

    await waitFor(() => {
      expect(input).not.toBeDisabled();
      // After streaming completes the announcer's text content empties.
      // The TypingIndicator is no longer in the DOM either (content arrived).
      expect(statusRegion).toBeEmptyDOMElement();
    });
  });

  it('renders the error state upon "throw error" prompt', async () => {
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));

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
    render(withChatStream(<ChatUI workspaceName="Side Quest Syndicate" />));
    const toolbar = screen.getByTestId('conversation-toolbar');
    // The toolbar is kept in the DOM (to reserve layout space) but hidden via
    // the `invisible` class when there are no messages.
    expect(toolbar).toHaveClass('invisible');
  });

  it('resets to empty state when new conversation is clicked', async () => {
    render(
      withChatStream(
        <ChatUI
          initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hello' }]}
          conversationId="conv-1"
          workspaceName="Side Quest Syndicate"
        />,
      ),
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
    // Toolbar stays visible to host the Continue-previous undo affordance —
    // empty state with a stash is the one case where the toolbar shows
    // without messages.
    expect(screen.getByTestId('conversation-toolbar')).not.toHaveClass(
      'invisible',
    );
    expect(screen.getByTestId('continue-previous-btn')).toBeInTheDocument();
  });

  it('shows "Continue previous" after clicking New conversation, restores the prior thread on click', () => {
    render(
      withChatStream(
        <ChatUI
          initialMessages={[
            { id: 'msg-1', role: 'user', content: 'What is our brand voice?' },
          ]}
          conversationId="conv-1"
          workspaceName="Side Quest Syndicate"
        />,
      ),
    );

    expect(screen.getByText('What is our brand voice?')).toBeInTheDocument();
    expect(
      screen.queryByTestId('continue-previous-btn'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('new-conversation-btn'));

    expect(
      screen.queryByText('What is our brand voice?'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('continue-previous-btn')).toBeInTheDocument();
    expect(
      screen.queryByTestId('new-conversation-btn'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('continue-previous-btn'));

    expect(screen.getByText('What is our brand voice?')).toBeInTheDocument();
    expect(
      screen.queryByTestId('continue-previous-btn'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('new-conversation-btn')).toBeInTheDocument();
  });

  it('does not show Continue previous on initial empty state (no stash yet)', () => {
    render(
      withChatStream(
        <ChatUI
          initialMessages={[]}
          conversationId={null}
          workspaceName="Side Quest Syndicate"
        />,
      ),
    );
    expect(
      screen.queryByTestId('continue-previous-btn'),
    ).not.toBeInTheDocument();
  });

  // Sprint 28.6 (Bug 3 fix) — supersedes the Sprint 24.7 expectation
  // that "New conversation clears the lease". Parser state lives on
  // LeaseParserContext now, so resetting the chat thread no longer
  // touches the uploaded lease, extracted clauses, or red flags. The
  // LeaseProbe (defined at module scope above) reads
  // LeaseParserContext.activeLease — it must still show the same
  // lease_id after the user clicks New conversation.
  it('Sprint 28.6 — New conversation PRESERVES the lease (Bug 3 fix)', () => {
    render(
      withChatStream(
        <>
          <ChatUI
            initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hello' }]}
            conversationId="conv-1"
            workspaceName="Side Quest Syndicate"
          />
          <LeaseProbe />
        </>,
        {
          activeLease: {
            lease_id: 'lease-pre-reset',
            filename: 'old.pdf',
          },
        },
      ),
    );

    expect(screen.getByTestId('lease-probe')).toHaveTextContent(
      'lease-pre-reset',
    );

    fireEvent.click(screen.getByTestId('new-conversation-btn'));

    // Bug 3 fix: the lease in LeaseParserContext is untouched by a
    // chat-thread reset. Pre-Sprint-3 this assertion was '__empty__'.
    expect(screen.getByTestId('lease-probe')).toHaveTextContent(
      'lease-pre-reset',
    );
  });

  // Sprint 28.6 — supersedes Sprint 24.7's "New -> Continue previous
  // keeps the Blob URL alive". The continue-previous affordance only
  // renders when there's no active lease (it gates on `!activeLease`),
  // so the original scenario is no longer reachable. The replacement
  // assertion is the load-bearing invariant the original test
  // protected: clicking "New conversation" must NOT revoke the
  // active Blob URL — the lease keeps rendering, the URL stays alive.
  it('Sprint 28.6 — New conversation does not revoke the active Blob URL', () => {
    const revoke = vi.fn();
    global.URL.revokeObjectURL = revoke;

    render(
      withChatStream(
        <ChatUI
          initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hi' }]}
          conversationId="conv-1"
          workspaceName="Side Quest Syndicate"
        />,
        {
          activeLease: {
            lease_id: 'lease-keep-alive',
            filename: 'a.pdf',
            pdfUrl: 'blob:keep-alive',
          },
        },
      ),
    );

    fireEvent.click(screen.getByTestId('new-conversation-btn'));

    expect(revoke).not.toHaveBeenCalled();
  });

  // Sprint 24.7 — revocation happens at the commit boundary: when the
  // user sends a message in the new thread, the stashed lease is
  // provably unreachable and its Blob URL is freed. This prevents the
  // leak the old reset-time revoke was meant to address, without
  // breaking undo.
  it('Sprint 24.7 — sending a message after New revokes the stashed blob URL', async () => {
    const revoke = vi.fn();
    global.URL.revokeObjectURL = revoke;

    render(
      withChatStream(
        <ChatUI
          initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hi' }]}
          conversationId="conv-1"
          workspaceName="Side Quest Syndicate"
        />,
        {
          activeLease: {
            lease_id: 'lease-commit',
            filename: 'a.pdf',
            pdfUrl: 'blob:commit-target',
          },
        },
      ),
    );

    fireEvent.click(screen.getByTestId('new-conversation-btn'));
    expect(revoke).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Type a message');
    fireEvent.change(input, { target: { value: 'commit to new thread' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith('blob:commit-target');
    });
  });

  // Sprint 28.6 — supersedes Sprint 24.7's "Continue previous restores
  // the lease". After the state split, the lease was never reset to
  // begin with — so the test is now simpler: clicking New conversation
  // leaves the lease visible the whole time. The continue-previous
  // affordance is hidden when an active lease is mounted (gated on
  // `!activeLease`); Sprint 5 will revisit the undo surface once the
  // explicit "Reset workspace" path is wired.
  it('Sprint 28.6 — the lease stays visible across a New conversation click', () => {
    render(
      withChatStream(
        <>
          <ChatUI
            initialMessages={[{ id: 'msg-1', role: 'user', content: 'Hello' }]}
            conversationId="conv-1"
            workspaceName="Side Quest Syndicate"
          />
          <LeaseProbe />
        </>,
        {
          activeLease: {
            lease_id: 'lease-original',
            filename: 'old.pdf',
          },
        },
      ),
    );

    expect(screen.getByTestId('lease-probe')).toHaveTextContent(
      'lease-original',
    );

    fireEvent.click(screen.getByTestId('new-conversation-btn'));

    // Bug 3 fix: the lease was never reset.
    expect(screen.getByTestId('lease-probe')).toHaveTextContent(
      'lease-original',
    );
  });

  it('remounts on workspace change so the prior thread does not bleed across', () => {
    // The page passes `key={workspace.id}` to ChatUI. On workspace switch,
    // React unmounts the old instance and mounts a fresh one with the new
    // workspace's initialMessages — preventing the GitLab thread from
    // surviving into the MailChimp chat after upload.
    const { rerender } = render(
      withChatStream(
        <ChatUI
          key="ws-gitlab"
          initialMessages={[
            { id: 'msg-old', role: 'user', content: 'GitLab question' },
          ]}
          conversationId="conv-gitlab"
          workspaceName="GitLab"
        />,
      ),
    );
    expect(screen.getByText('GitLab question')).toBeInTheDocument();

    rerender(
      withChatStream(
        <ChatUI
          key="ws-mailchimp"
          initialMessages={[]}
          conversationId={null}
          workspaceName="MailChimp"
        />,
      ),
    );
    expect(screen.queryByText('GitLab question')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
  });
});
