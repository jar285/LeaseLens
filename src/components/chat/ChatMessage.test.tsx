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
import { withChatStream } from './test-helpers';

describe('ChatMessage — TypingIndicator integration', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });
  afterEach(cleanup);

  it('renders TypingIndicator for empty streaming assistant message with no tool invocations', () => {
    render(
      withChatStream(
        <ChatMessage id="m1" role="assistant" content="" isStreaming />,
      ),
    );
    expect(
      screen.getByRole('status', { name: 'Assistant is composing' }),
    ).toBeInTheDocument();
  });

  it('renders content (not the indicator) when content is non-empty', () => {
    render(
      withChatStream(
        <ChatMessage id="m1" role="assistant" content="hi" isStreaming />,
      ),
    );
    expect(
      screen.queryByRole('status', { name: 'Assistant is composing' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('does NOT render TypingIndicator when a tool invocation is in flight (Spec §4.9 four-clause)', () => {
    render(
      withChatStream(
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
      ),
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
    render(
      withChatStream(<ChatMessage id="m1" role="assistant" content="hello" />),
    );
    await waitFor(() => {
      const li = screen.getByRole('listitem');
      expect(li.getAttribute('data-motion')).toBe('on');
    });
  });

  it('assistant message carries data-motion="off" when reduced-motion is on', () => {
    useReducedMotionMock.mockReturnValue(true);
    render(
      withChatStream(<ChatMessage id="m1" role="assistant" content="hello" />),
    );
    const li = screen.getByRole('listitem');
    expect(li.getAttribute('data-motion')).toBe('off');
  });

  it('user message carries data-motion="off" regardless of reduced-motion setting', () => {
    useReducedMotionMock.mockReturnValue(false);
    render(
      withChatStream(
        <ChatMessage id="m1" role="user" content="hi from user" />,
      ),
    );
    const li = screen.getByRole('listitem');
    expect(li.getAttribute('data-motion')).toBe('off');
  });

  // Sprint 18 — truncation notice when Anthropic returned stop_reason: "max_tokens".
  it('renders the truncation notice on an assistant message when truncated is true', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content="Partial response that was cut off mid"
          truncated
          truncatedReason="max_tokens"
        />,
      ),
    );
    const notice = screen.getByTestId('message-truncated-notice');
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent(/cut short/i);
  });

  it('does not render the truncation notice when truncated is falsy', () => {
    render(
      withChatStream(<ChatMessage id="m1" role="assistant" content="hello" />),
    );
    expect(
      screen.queryByTestId('message-truncated-notice'),
    ).not.toBeInTheDocument();
  });

  it('does not render the truncation notice on a user message even if truncated is set', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="user"
          content="user text"
          truncated
          truncatedReason="max_tokens"
        />,
      ),
    );
    expect(
      screen.queryByTestId('message-truncated-notice'),
    ).not.toBeInTheDocument();
  });
});

// Sprint 18 §5 — tenant-friendly scan timeline replaces the inline
// tool-card stack for Creator (Tenant) viewers when a message contains
// scan-flow tool calls.
describe('ChatMessage — Sprint 18 §5 ScanTimeline role gate', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });
  afterEach(cleanup);

  const scanInvocations = [
    {
      id: 't-extract',
      name: 'extract_clauses',
      input: {},
      result: {
        clauses: [
          { clause_id: 'c1', clause_type: 'security_deposit' },
          { clause_id: 'c2', clause_type: 'late_fee' },
        ],
      },
    },
    {
      id: 't-grade-1',
      name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: {
        clause_id: 'c1',
        severity: 'high',
        statute_citation: 'NJSA 1',
      },
    },
  ];

  it('renders the ScanTimeline for a Creator viewer when scan tool calls are present', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={scanInvocations}
        />,
        {
          viewerRole: 'Tenant',
          // The timeline reads its data from toolEvents, not props, so
          // mirror the invocations into the provider's events array.
          initialEvents: scanInvocations.map((inv) => ({
            tool_name: inv.name,
            input: inv.input,
            result: inv.result,
            audit_id: undefined,
          })),
        },
      ),
    );
    expect(screen.getByTestId('scan-timeline')).toBeInTheDocument();
    // The legacy tool-card stack should NOT render for scan tools when
    // the timeline replaces it.
    expect(screen.queryByText('extract_clauses')).not.toBeInTheDocument();
    expect(screen.queryByText('grade_clause_severity')).not.toBeInTheDocument();
  });

  it('renders the inline tool-card stack for an Editor viewer (Reviewer trace fidelity)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={scanInvocations}
        />,
        { viewerRole: 'Reviewer' },
      ),
    );
    expect(screen.queryByTestId('scan-timeline')).not.toBeInTheDocument();
    // Each scan tool card renders its raw tool name in the header.
    expect(screen.getByText('extract_clauses')).toBeInTheDocument();
    expect(screen.getByText('grade_clause_severity')).toBeInTheDocument();
  });

  it('renders the inline tool-card stack for an Admin viewer (Reviewer trace fidelity)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={scanInvocations}
        />,
        { viewerRole: 'Admin' },
      ),
    );
    expect(screen.queryByTestId('scan-timeline')).not.toBeInTheDocument();
    expect(screen.getByText('extract_clauses')).toBeInTheDocument();
  });

  // Sprint 23f Phase 2 — Tenant + draft_negotiation_email routes to
  // the new NegotiationEmailCard primitive. The drafted email is the
  // user's deliverable and stays inline regardless of role; the
  // visual register differs by role (Tenant gets the email card,
  // Reviewer/Admin gets the raw ToolCard for trace fidelity).
  it('Tenant + draft_negotiation_email routes to NegotiationEmailCard (Sprint 23f)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={[
            ...scanInvocations,
            {
              id: 't-draft',
              name: 'draft_negotiation_email',
              input: { clause_id: 'c1' },
              result: {
                email_id: 'email-1',
                clause_id: 'c1',
                subject: 'Request to Revise Security Deposit',
                body: 'Hi [Landlord Name],\n\nThank you for sending…',
              },
            },
          ]}
        />,
        {
          viewerRole: 'Tenant',
          initialEvents: scanInvocations.map((inv) => ({
            tool_name: inv.name,
            input: inv.input,
            result: inv.result,
            audit_id: undefined,
          })),
        },
      ),
    );
    expect(screen.getByTestId('scan-timeline')).toBeInTheDocument();
    // The drafted-email card renders as the new NegotiationEmailCard,
    // not the raw ToolCard with the tool name.
    expect(screen.getByTestId('negotiation-email-card')).toBeInTheDocument();
    expect(
      screen.queryByText('draft_negotiation_email'),
    ).not.toBeInTheDocument();
    // The card carries the clause label resolved from the prior
    // grade_clause_severity event (clause_type: 'security_deposit').
    expect(screen.getByTestId('negotiation-email-card')).toHaveTextContent(
      /Security deposit/i,
    );
  });

  it('Reviewer + draft_negotiation_email keeps the inline ToolCard (Sprint 23f)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={[
            {
              id: 't-draft',
              name: 'draft_negotiation_email',
              input: { clause_id: 'c1' },
              result: {
                email_id: 'email-1',
                clause_id: 'c1',
                subject: 'Request to Revise',
                body: '…',
              },
            },
          ]}
        />,
        { viewerRole: 'Reviewer' },
      ),
    );
    expect(
      screen.queryByTestId('negotiation-email-card'),
    ).not.toBeInTheDocument();
    // The raw ToolCard renders with the tool name header.
    expect(screen.getByText('draft_negotiation_email')).toBeInTheDocument();
  });

  it('Tenant + draft_negotiation_email without a matching grading falls back gracefully', () => {
    // Edge case: the draft_negotiation_email tool result arrives but
    // no grade_clause_severity event exists in the stream for the
    // matching clause_id. The card should still render (with a
    // generic clause label and no SeverityBadge) instead of crashing.
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={[
            {
              id: 't-draft',
              name: 'draft_negotiation_email',
              input: { clause_id: 'cX' },
              result: {
                email_id: 'email-x',
                clause_id: 'cX',
                subject: 'Request to Revise',
                body: 'Body content',
              },
            },
          ]}
        />,
        // No initialEvents — the toolEvents stream is empty.
        { viewerRole: 'Tenant' },
      ),
    );
    const card = screen.getByTestId('negotiation-email-card');
    expect(card).toBeInTheDocument();
    // No severity badge when the matching grading is absent.
    expect(card.querySelector('[data-testid="severity-badge"]')).toBeNull();
  });

  // Sprint 27.1 — visual rhythm: user messages now wear a card too
  // (surface-card background + hairline border) so the transcript
  // reads as discrete bubbles instead of an unstyled text run
  // adjoining the assistant's muted card. Asserted by class name
  // because jsdom doesn't compute box geometry.
  it("user messages carry a card class so they don't bleed into the assistant bubble below", () => {
    render(withChatStream(<ChatMessage id="m1" role="user" content="Hello" />));
    const li = screen.getByText('Hello').closest('li');
    expect(li).not.toBeNull();
    // Both roles share the card silhouette (rounded + padded). The
    // user-vs-assistant distinction is conveyed by background +
    // optional border, not by presence/absence of the card itself.
    expect(li?.className).toMatch(/\brounded-xl\b/);
    expect(li?.className).toMatch(/\bpx-4\b/);
  });

  // Sprint 27.1 — follow-up chips render AFTER the assistant body,
  // not before. Reading order is now header → body → suggested next
  // questions, matching how a user expects to read an answer (Don
  // Norman: predictable affordance ordering).
  it('follow-up chips render after the assistant body content', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content="Here is the answer body."
          followUpPrompts={[
            { id: 'p1', label: 'Suggested next', prompt: 'next' },
          ]}
        />,
      ),
    );
    const body = screen.getByText('Here is the answer body.');
    const chip = screen.getByRole('button', { name: 'Suggested next' });
    // Node.DOCUMENT_POSITION_FOLLOWING (0x04) means `chip` follows
    // `body` in document order.
    const followingMask = Node.DOCUMENT_POSITION_FOLLOWING;
    const chipFollowsBody = Boolean(
      body.compareDocumentPosition(chip) & followingMask,
    );
    expect(chipFollowsBody).toBe(true);
  });

  // S19.9 — touch-target rule: every follow-up chip must be at least
  // 44×44px on mobile. We assert the class string carries `min-h-11`
  // (Tailwind = 2.75rem = 44px) rather than measuring layout, because
  // jsdom doesn't compute box geometry.
  it('S19.9 — follow-up chips reach the 44px touch-target minimum', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content="Done."
          followUpPrompts={[
            { id: 'p1', label: 'Tap me', prompt: 'do the thing' },
          ]}
        />,
      ),
    );
    const chip = screen.getByRole('button', { name: 'Tap me' });
    expect(chip.className).toMatch(/\bmin-h-11\b/);
  });
});

// Sprint 33.A.2 — the auto-scan turn no longer renders the conversational
// ScanTimeline: the right-pane staircase is canonical for scan progress,
// so duplicating it inside the chat turn is redundant noise (Steve Krug /
// Dieter Rams). The gate is per-turn (auto-scan first turn only) — a
// user-initiated "scan again" turn STILL shows the timeline.
describe('ChatMessage — Sprint 33.A.2 auto-scan turn gate', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });
  afterEach(cleanup);

  const scanInvocations = [
    {
      id: 't-extract',
      name: 'extract_clauses',
      input: {},
      result: {
        clauses: [{ clause_id: 'c1', clause_type: 'security_deposit' }],
      },
    },
    {
      id: 't-grade-1',
      name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: { clause_id: 'c1', severity: 'high', statute_citation: 'NJSA 1' },
    },
  ];

  const initialEvents = scanInvocations.map((inv) => ({
    tool_name: inv.name,
    input: inv.input,
    result: inv.result,
    audit_id: undefined,
  }));

  it('Tenant auto-scan turn suppresses BOTH the ScanTimeline and the raw scan tool cards', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content="Done — see the findings on the right."
          toolInvocations={scanInvocations}
          isAutoScanTurn
        />,
        { viewerRole: 'Tenant', initialEvents },
      ),
    );
    // No conversational timeline…
    expect(screen.queryByTestId('scan-timeline')).not.toBeInTheDocument();
    // …and NOT the raw tool-card fallback either (that would leak
    // developer trace into the tenant view — worse than the timeline).
    expect(screen.queryByText('extract_clauses')).not.toBeInTheDocument();
    expect(screen.queryByText('grade_clause_severity')).not.toBeInTheDocument();
  });

  it('Tenant auto-scan turn still renders a non-scan deliverable (NegotiationEmailCard)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content="Done."
          toolInvocations={[
            ...scanInvocations,
            {
              id: 't-draft',
              name: 'draft_negotiation_email',
              input: { clause_id: 'c1' },
              result: {
                email_id: 'email-1',
                clause_id: 'c1',
                subject: 'Request to Revise',
                body: 'Hi…',
              },
            },
          ]}
          isAutoScanTurn
        />,
        { viewerRole: 'Tenant', initialEvents },
      ),
    );
    // Scan UI gone, but the drafted email (the user's deliverable) stays.
    expect(screen.queryByTestId('scan-timeline')).not.toBeInTheDocument();
    expect(screen.getByTestId('negotiation-email-card')).toBeInTheDocument();
  });

  it('Tenant scan turn that is NOT the auto-scan turn still renders the ScanTimeline', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={scanInvocations}
        />,
        { viewerRole: 'Tenant', initialEvents },
      ),
    );
    expect(screen.getByTestId('scan-timeline')).toBeInTheDocument();
  });

  it('Reviewer auto-scan turn keeps the inline tool cards (trace fidelity unaffected by the gate)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content=""
          toolInvocations={scanInvocations}
          isAutoScanTurn
        />,
        { viewerRole: 'Reviewer' },
      ),
    );
    expect(screen.queryByTestId('scan-timeline')).not.toBeInTheDocument();
    expect(screen.getByText('extract_clauses')).toBeInTheDocument();
    expect(screen.getByText('grade_clause_severity')).toBeInTheDocument();
  });
});

describe('ChatMessage — Sprint 37.3 "Read in full view"', () => {
  beforeEach(() => {
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(true);
  });
  afterEach(cleanup);

  const LONG = 'x'.repeat(601);
  const SHORT = 'A short answer.';

  it('renders "Read in full view" for a long assistant answer when onRequestExpand is provided', () => {
    const onRequestExpand = vi.fn();
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content={LONG}
          onRequestExpand={onRequestExpand}
        />,
      ),
    );
    const btn = screen.getByTestId('message-read-in-full');
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onRequestExpand).toHaveBeenCalledTimes(1);
  });

  it('does NOT render for a short assistant answer', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="assistant"
          content={SHORT}
          onRequestExpand={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId('message-read-in-full'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render when onRequestExpand is absent (e.g. already expanded / non-FAB)', () => {
    render(
      withChatStream(<ChatMessage id="m1" role="assistant" content={LONG} />),
    );
    expect(
      screen.queryByTestId('message-read-in-full'),
    ).not.toBeInTheDocument();
  });

  it('does NOT render on a long USER message (assistant answers only)', () => {
    render(
      withChatStream(
        <ChatMessage
          id="m1"
          role="user"
          content={LONG}
          onRequestExpand={vi.fn()}
        />,
      ),
    );
    expect(
      screen.queryByTestId('message-read-in-full'),
    ).not.toBeInTheDocument();
  });
});
