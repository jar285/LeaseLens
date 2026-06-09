import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessageProps } from './ChatMessage';
import { ChatTranscript } from './ChatTranscript';
import { withChatStream } from './test-helpers';

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
      withChatStream(
        <ChatTranscript messages={baseMessages} workspaceName="Test" />,
      ),
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
      withChatStream(
        <ChatTranscript
          messages={[
            baseMessages[0],
            { ...baseMessages[1], content: 'First response plus more text' },
          ]}
          workspaceName="Test"
        />,
      ),
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: 300,
      behavior: 'smooth',
    });
  });

  it('does not scroll streamed content when the user has scrolled away', () => {
    const { rerender } = render(
      withChatStream(
        <ChatTranscript messages={baseMessages} workspaceName="Test" />,
      ),
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
      withChatStream(
        <ChatTranscript
          messages={[
            baseMessages[0],
            { ...baseMessages[1], content: 'First response plus more text' },
          ]}
          workspaceName="Test"
        />,
      ),
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('resets to pinned and scrolls when message count increases', () => {
    const { rerender } = render(
      withChatStream(
        <ChatTranscript messages={baseMessages} workspaceName="Test" />,
      ),
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
      withChatStream(
        <ChatTranscript
          messages={[
            ...baseMessages,
            { id: 'assistant-2', role: 'assistant', content: 'New response' },
          ]}
          workspaceName="Test"
        />,
      ),
    );

    expect(scrollTo).toHaveBeenCalledWith({
      top: 420,
      behavior: 'smooth',
    });
  });

  it('renders empty-state suggestion controls', () => {
    render(
      withChatStream(
        <ChatTranscript
          messages={[]}
          onSelectPrompt={vi.fn()}
          workspaceName="LeaseLens"
        />,
      ),
    );

    expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
    // Sprint 13: empty state surfaces the standard-scan prompt.
    expect(
      screen.getByRole('button', { name: /standard scan/i }),
    ).toBeInTheDocument();
  });

  // Sprint 29.2 — when ChatTranscript is mounted inside the FAB drawer
  // (caller passes `emptyStateVariant="compact"`), the full ChatEmptyState
  // hero is suppressed and replaced by a compact in-drawer header. The
  // big "Find what to negotiate, before you sign" hero is the parser
  // landing page's identity; rendering it inside the FAB drawer makes
  // the assistant compete with the parser surface instead of supporting
  // it (Dieter Rams: less but better). The compact variant strips the
  // hero to a one-line heading + subhead.
  describe('Sprint 29.2 — emptyStateVariant', () => {
    it('default ("hero") still renders the full ChatEmptyState hero', () => {
      // Regression guard for any non-FAB consumer (e.g. legacy
      // LeaseLensWorkspaceShell) that mounts ChatTranscript directly.
      render(
        withChatStream(
          <ChatTranscript messages={[]} workspaceName="LeaseLens" />,
        ),
      );
      expect(screen.getByTestId('chat-empty-state')).toBeInTheDocument();
      expect(
        screen.queryByTestId('assistant-drawer-empty-header'),
      ).not.toBeInTheDocument();
    });

    it('"compact" variant suppresses the hero and renders just the orienting subhead (no duplicate title)', () => {
      render(
        withChatStream(
          <ChatTranscript
            messages={[]}
            workspaceName="LeaseLens"
            emptyStateVariant="compact"
          />,
        ),
      );
      // The big landing hero is gone…
      expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
      // …replaced by a small in-drawer header that shows only the
      // one-line orienting subhead.
      const header = screen.getByTestId('assistant-drawer-empty-header');
      expect(header).toBeInTheDocument();
      expect(header.textContent ?? '').toMatch(
        /ask about your lease, clauses, red flags, or citations/i,
      );
      // Sprint 37.1 — the duplicate "LeaseLens Assistant" heading was
      // removed (the drawer chrome header carries the wordmark). The
      // compact empty state must not render its own title heading.
      expect(within(header).queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  it('renders follow-up chips under the latest assistant message', () => {
    const onSelectPrompt = vi.fn();

    render(
      withChatStream(
        <ChatTranscript
          messages={baseMessages}
          onSelectPrompt={onSelectPrompt}
          workspaceName="Side Quest Syndicate"
        />,
      ),
    );

    // Phase 10.8 — follow-ups rewritten for LeaseLens. The first chip
    // surfaces the "draft emails" continuation (the most common next
    // action after the agent grades clauses).
    const draftBtn = screen.getByRole('button', { name: /Draft emails/i });
    expect(draftBtn).toBeInTheDocument();

    fireEvent.click(draftBtn);

    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt.mock.calls[0][0]).toMatch(/draft_negotiation_email/i);
  });

  it('renders a "what to fix first" chip that asks the agent to prioritize', () => {
    const onSelectPrompt = vi.fn();

    render(
      withChatStream(
        <ChatTranscript
          messages={baseMessages}
          onSelectPrompt={onSelectPrompt}
          workspaceName="Side Quest Syndicate"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /What to fix first/i }));

    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt.mock.calls[0][0]).toMatch(
      /rank the red flags|push back on first|prioritize/i,
    );
  });

  it('Round 3 — propagates workspaceName to the rendered empty state', () => {
    render(
      withChatStream(
        <ChatTranscript
          messages={[]}
          onSelectPrompt={vi.fn()}
          workspaceName="Acme"
        />,
      ),
    );
    // Sprint 23g — workspaceName now renders in the editorial eyebrow
    // (a <p>, not a heading). The Hero H2 carries the fixed value-prop
    // headline; workspaceName lives above it as the small-caps mono
    // label.
    expect(screen.getByTestId('chat-empty-eyebrow')).toHaveTextContent('Acme');
    expect(screen.queryByText(/Side Quest Syndicate/i)).not.toBeInTheDocument();
  });

  describe('S19.4 — synthetic intro/summary messages', () => {
    const LEASE = { lease_id: 'lease-s19', filename: 'my-lease.pdf' };

    it('renders the synthetic intro message instead of ChatEmptyState when a lease is uploaded and the transcript is empty', () => {
      render(
        withChatStream(<ChatTranscript messages={[]} workspaceName="Test" />, {
          activeLease: LEASE,
        }),
      );
      // Intro body mentions the filename so the user sees confirmation.
      expect(screen.getByText(/my-lease\.pdf/i)).toBeInTheDocument();
      // The four intro chips are present.
      expect(
        screen.getByRole('button', { name: /run standard scan/i }),
      ).toBeInTheDocument();
    });

    // Sprint 23c Phase 2 — the synthetic intro is rendered as a dedicated
    // UploadedLeaseCard (not a regular ChatMessage). The card carries
    // the filename in a mono span and the four action chips as buttons.
    it('routes the synthetic intro through UploadedLeaseCard (Phase 2)', () => {
      render(
        withChatStream(<ChatTranscript messages={[]} workspaceName="Test" />, {
          activeLease: LEASE,
        }),
      );
      // The dedicated card renders with its testid.
      const card = screen.getByTestId('uploaded-lease-card');
      expect(card).toBeInTheDocument();
      // The filename is present inside the card (and only there — not
      // also rendered as a regular ChatMessage).
      expect(card).toHaveTextContent('my-lease.pdf');
      // Verify the intro is rendered exactly once (one card; no
      // additional chat-message rendering of the same content).
      const filenameMatches = screen.getAllByText(/my-lease\.pdf/i);
      expect(filenameMatches.length).toBe(1);
    });

    it('inserts the intro at the top of a populated transcript when there is no scan yet', () => {
      render(
        withChatStream(
          <ChatTranscript messages={baseMessages} workspaceName="Test" />,
          { activeLease: LEASE },
        ),
      );
      // Intro is rendered before the first existing message — the
      // intro body should appear in the DOM before "Hello".
      const intro = screen.getByText(/my-lease\.pdf/i);
      const firstUser = screen.getByText('Hello');
      expect(
        intro.compareDocumentPosition(firstUser) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('does not render the synthetic intro when activeLease is null', () => {
      render(
        withChatStream(
          <ChatTranscript messages={baseMessages} workspaceName="Test" />,
        ),
      );
      expect(screen.queryByText(/my-lease\.pdf/i)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /run standard scan/i }),
      ).not.toBeInTheDocument();
    });

    it('appends the scan-complete summary at the end after a completed scan', () => {
      const extractEvent = {
        tool_name: 'extract_clauses',
        input: { lease_id: LEASE.lease_id },
        result: {
          clauses: [
            {
              clause_id: 'c1',
              clause_type: 'security_deposit',
              clause_index: 0,
              page_number: 1,
            },
          ],
        },
        audit_id: 'extract-1',
      };
      const gradeEvent = {
        tool_name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        result: {
          clause_id: 'c1',
          severity: 'high' as const,
          statute_citation: 'NJSA 46:8-1',
          chunk_id: 'k',
          reasoning: 'r',
          recommended_action: 'a',
          clause_type: 'security_deposit',
        },
        audit_id: undefined,
      };

      render(
        withChatStream(
          <ChatTranscript messages={baseMessages} workspaceName="Test" />,
          { activeLease: LEASE, initialEvents: [extractEvent, gradeEvent] },
        ),
      );

      // Sprint 33.A.2 — minimal scan-complete receipt that points to the
      // right pane (1 graded high-severity clause → "1 finding"), not the
      // old verbose tally.
      expect(screen.getByText(/scan complete/i)).toBeInTheDocument();
      expect(screen.getByText(/1 finding on the right/i)).toBeInTheDocument();
      // Summary suggested-action chips still appear under the receipt.
      expect(
        screen.getByRole('button', { name: /explain highest-risk issue/i }),
      ).toBeInTheDocument();
    });

    it('forwards intro-chip clicks through onSelectPrompt', () => {
      const onSelectPrompt = vi.fn();
      render(
        withChatStream(
          <ChatTranscript
            messages={[]}
            workspaceName="Test"
            onSelectPrompt={onSelectPrompt}
          />,
          { activeLease: LEASE },
        ),
      );
      fireEvent.click(
        screen.getByRole('button', { name: /run standard scan/i }),
      );
      expect(onSelectPrompt).toHaveBeenCalledTimes(1);
      expect(onSelectPrompt.mock.calls[0][0]).toMatch(/standard scan/i);
    });
  });

  // S20.7 — trust fix. When the model produces a substantive closing
  // assistant message after a scan, the synthetic summary is
  // redundant at best and contradictory at worst (the original bug:
  // model wrote "Red-Flag Scan Complete — 4 high-severity findings…"
  // and the synthetic appended "I had trouble completing the scan").
  // Transcript-level suppression keeps the model's reply as the
  // single source of truth.
  describe('S20.7 — suppress synthetic summary when model spoke substantively', () => {
    const LEASE = { lease_id: 'lease-s20-7', filename: 'lease.pdf' };

    // A complete scan with several errors (would normally trigger the
    // synthetic scan-fatal copy under the >50% threshold).
    const extractEvent = {
      tool_name: 'extract_clauses',
      input: { lease_id: LEASE.lease_id },
      result: {
        clauses: [
          { clause_id: 'c1', clause_type: 'security_deposit' },
          { clause_id: 'c2', clause_type: 'late_fee' },
        ],
      },
      audit_id: 'ex-1',
    };
    const gradeOk = {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: {
        clause_id: 'c1',
        severity: 'high' as const,
        statute_citation: 'NJSA 46:8-19',
        chunk_id: 'k',
        reasoning: 'r',
        recommended_action: 'a',
        clause_type: 'security_deposit',
      },
      audit_id: undefined,
    };
    const gradeErr = {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c2' },
      result: { error: 'corpus miss' },
      audit_id: undefined,
    };

    it('suppresses the synthetic summary when the last assistant message has substantive content', () => {
      const messages: ChatMessageProps[] = [
        { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
        {
          id: 'a-1',
          role: 'assistant',
          content:
            'I extracted and graded all clauses. Here are the high-severity findings: Security Deposit (NJSA 46:8-19), Subletting blanket prohibition, Pet ban violating FHA, one-way attorneys fees clause. Recommended actions follow.',
        },
      ];
      render(
        withChatStream(
          <ChatTranscript messages={messages} workspaceName="Test" />,
          {
            activeLease: LEASE,
            initialEvents: [extractEvent, gradeOk, gradeErr],
          },
        ),
      );
      // The contradictory "I had trouble completing the scan" must not
      // render alongside the model's "extracted and graded" closing.
      expect(
        screen.queryByText(/I had trouble completing the scan/i),
      ).not.toBeInTheDocument();
      // The synthetic intro is also gone (scan started).
      expect(screen.queryByText(/lease uploaded/i)).not.toBeInTheDocument();
    });

    it('still renders the synthetic summary when the last assistant message is empty (model out of tokens)', () => {
      // Defensive: if the model produced a tool turn but no closing
      // text (the original out-of-tokens case), the synthetic stays
      // as the user's only summary.
      const messages: ChatMessageProps[] = [
        { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
        { id: 'a-1', role: 'assistant', content: '' },
      ];
      render(
        withChatStream(
          <ChatTranscript messages={messages} workspaceName="Test" />,
          {
            activeLease: LEASE,
            initialEvents: [extractEvent, gradeOk, gradeErr],
          },
        ),
      );
      // The synthetic summary IS rendered (model produced nothing
      // substantive, so the user needs the deterministic close).
      expect(
        screen.getByText(/may need manual review|I had trouble/i),
      ).toBeInTheDocument();
    });

    it('S20.8 — defers the synthetic summary while assistant is still streaming (prevents flash-and-swap)', () => {
      // Repro: scan events finish (synthetic summary becomes
      // available) BEFORE the model has finished streaming its
      // closing reply. Without this guard, the synthetic renders for
      // a moment, then disappears as the model's text crosses the
      // 80-char threshold — a jarring flash-and-swap.
      const messages: ChatMessageProps[] = [
        { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
        {
          id: 'a-1',
          role: 'assistant',
          // The model has started streaming but hasn't reached
          // substantive content yet.
          content: 'Standard Lease',
        },
      ];
      render(
        withChatStream(
          <ChatTranscript
            messages={messages}
            workspaceName="Test"
            isStreaming
          />,
          {
            activeLease: LEASE,
            initialEvents: [extractEvent, gradeOk, gradeErr],
          },
        ),
      );
      // Synthetic must NOT render mid-stream, even though the
      // last assistant message has < 80 chars and the scan
      // technically completed.
      expect(
        screen.queryByText(/may need manual review|I had trouble/i),
      ).not.toBeInTheDocument();
    });

    it('treats a very short assistant message (e.g. "ok") as non-substantive', () => {
      const messages: ChatMessageProps[] = [
        { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
        { id: 'a-1', role: 'assistant', content: 'Done.' },
      ];
      render(
        withChatStream(
          <ChatTranscript messages={messages} workspaceName="Test" />,
          {
            activeLease: LEASE,
            initialEvents: [extractEvent, gradeOk, gradeErr],
          },
        ),
      );
      // Synthetic still appears — 5 chars of text doesn't count as
      // the user's actual close.
      expect(
        screen.getByText(/may need manual review|I had trouble/i),
      ).toBeInTheDocument();
    });
  });

  // Sprint 33.A.2 — the minimal scan-complete receipt is the chat's
  // single, deterministic "scan complete" signal for a normal
  // (complete/partial) scan. Unlike the old verbose tally it can't
  // contradict the cards, so it renders regardless of the model's ack
  // length — retiring the Sprint 20 SUBSTANTIVE_REPLY_MIN_CHARS heuristic
  // for these states (the fatal copy keeps its S20.7 guard, tested above).
  describe('Sprint 33.A.2 — deterministic receipt not suppressed by a long ack', () => {
    const LEASE = { lease_id: 'lease-s33a2', filename: 'lease.pdf' };
    const extractEvent = {
      tool_name: 'extract_clauses',
      input: { lease_id: LEASE.lease_id },
      result: {
        clauses: [{ clause_id: 'c1', clause_type: 'security_deposit' }],
      },
      audit_id: 'ex-1',
    };
    const gradeHigh = {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: {
        clause_id: 'c1',
        severity: 'high' as const,
        statute_citation: 'NJSA 46:8-19',
        chunk_id: 'k',
        reasoning: 'r',
        recommended_action: 'a',
        clause_type: 'security_deposit',
      },
      audit_id: undefined,
    };

    it('renders the minimal receipt even when the last assistant message is long (complete scan)', () => {
      const messages: ChatMessageProps[] = [
        { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
        {
          id: 'a-1',
          role: 'assistant',
          // A long (>80 char) closing reply — pre-33.A.2 this suppressed
          // the synthetic summary entirely.
          content:
            'I went through every clause in your lease and graded each one against the relevant NJ tenant-law sources; the results are now on the right.',
        },
      ];
      render(
        withChatStream(
          <ChatTranscript messages={messages} workspaceName="Test" />,
          { activeLease: LEASE, initialEvents: [extractEvent, gradeHigh] },
        ),
      );
      expect(screen.getByText(/scan complete/i)).toBeInTheDocument();
      expect(screen.getByText(/1 finding on the right/i)).toBeInTheDocument();
    });
  });
});
