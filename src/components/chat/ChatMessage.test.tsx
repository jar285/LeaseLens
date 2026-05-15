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
