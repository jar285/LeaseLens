// Sprint 13 §3f / Phase 10.5 — right-pane red-flag stream.
// Cards are collapsed by default and reveal a "View on page N" inline
// action when expanded. The summary row above the cards aggregates
// counts per severity for at-a-glance scanability.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { RedFlagReport } from './RedFlagReport';

afterEach(cleanup);

function ProviderWithEvents({
  events,
  children,
}: {
  events: ToolEvent[];
  children: ReactNode;
}) {
  return (
    <ChatStreamProvider initialEvents={events}>{children}</ChatStreamProvider>
  );
}

const grade = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  tool_name: 'grade_clause_severity',
  input: { clause_id: 'c1' },
  result: {
    clause_id: 'c1',
    severity: 'high',
    statute_citation: 'NJ Stat 46:8-21.2',
    chunk_id: 'security-deposit-cap#section:1',
    reasoning: 'Two months exceeds 1.5 cap.',
    recommended_action: 'Negotiate to 1.5 months.',
    page_number: 4,
    clause_type: 'security_deposit',
    clause_index: 3,
  },
  audit_id: undefined,
  ...overrides,
});

describe('RedFlagReport', () => {
  it('renders a placeholder when no grading events have arrived', () => {
    render(
      <ProviderWithEvents events={[]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
  });

  it('renders one card per grade_clause_severity event', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'c1' },
            result: {
              clause_id: 'c1',
              severity: 'high',
              statute_citation: 'NJ Stat 46:8-21.2',
              chunk_id: 'security-deposit-cap#section:1',
              reasoning: 'r1',
              recommended_action: 'a1',
              page_number: 1,
              clause_type: 'security_deposit',
              clause_index: 3,
            },
          }),
          grade({
            input: { clause_id: 'c2' },
            result: {
              clause_id: 'c2',
              severity: 'medium',
              statute_citation: 'NJ Stat 2A:42-6.1',
              chunk_id: 'late-fees-senior-citizens#section:0',
              reasoning: 'r2',
              recommended_action: 'a2',
              page_number: 3,
              clause_type: 'late_fee',
              clause_index: 4,
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );

    expect(screen.getAllByTestId('red-flag-card')).toHaveLength(2);
    // Citation surfaces in each card body.
    expect(screen.getByText(/NJ Stat 46:8-21\.2/)).toBeInTheDocument();
    expect(screen.getByText(/NJ Stat 2A:42-6\.1/)).toBeInTheDocument();
  });

  it('filters out non-grading tool events (extract_clauses, etc.)', () => {
    render(
      <ProviderWithEvents
        events={[
          {
            tool_name: 'extract_clauses',
            input: { lease_id: 'l1' },
            result: { clauses: [] },
            audit_id: undefined,
          },
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    expect(screen.queryByTestId('red-flag-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
  });

  it('renders severity-coded cards (data-severity attribute)', () => {
    render(
      <ProviderWithEvents events={[grade()]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const card = screen.getByTestId('red-flag-card');
    expect(card.getAttribute('data-severity')).toBe('high');
  });

  it('renders cards collapsed by default and expands on click', () => {
    render(
      <ProviderWithEvents events={[grade()]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const card = screen.getByTestId('red-flag-card');
    expect(card.getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByTestId('red-flag-card-body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));

    expect(card.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByTestId('red-flag-card-body')).toBeInTheDocument();
    // Recommended action is only shown in the expanded body.
    expect(screen.getByText(/recommended action/i)).toBeInTheDocument();
    expect(screen.getByText(/negotiate to 1\.5 months/i)).toBeInTheDocument();
  });

  it('renders a summary row that counts cards per severity', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'a' },
            result: {
              ...(grade().result as object),
              clause_id: 'a',
              severity: 'high',
            },
          }),
          grade({
            input: { clause_id: 'b' },
            result: {
              ...(grade().result as object),
              clause_id: 'b',
              severity: 'high',
            },
          }),
          grade({
            input: { clause_id: 'c' },
            result: {
              ...(grade().result as object),
              clause_id: 'c',
              severity: 'medium',
            },
          }),
          grade({
            input: { clause_id: 'd' },
            result: {
              ...(grade().result as object),
              clause_id: 'd',
              severity: 'ok',
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const summary = screen.getByTestId('red-flag-summary');
    // Compact "2 High · 1 Med · 1 OK" label, regardless of whitespace.
    expect(summary.textContent?.replace(/\s+/g, ' ')).toMatch(
      /2 High.*1 Med.*1 OK/,
    );
  });

  it('orders cards high → medium → low → ok', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'a' },
            result: {
              ...(grade().result as object),
              clause_id: 'a',
              severity: 'ok',
              clause_index: 0,
            },
          }),
          grade({
            input: { clause_id: 'b' },
            result: {
              ...(grade().result as object),
              clause_id: 'b',
              severity: 'high',
              clause_index: 5,
            },
          }),
          grade({
            input: { clause_id: 'c' },
            result: {
              ...(grade().result as object),
              clause_id: 'c',
              severity: 'medium',
              clause_index: 2,
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const cards = screen.getAllByTestId('red-flag-card');
    expect(cards[0].getAttribute('data-severity')).toBe('high');
    expect(cards[1].getAttribute('data-severity')).toBe('medium');
    expect(cards[2].getAttribute('data-severity')).toBe('ok');
  });

  it('"View on page N" sets activeClauseId and applies an active ring to the matching card', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <RedFlagReport />;
    }
    render(
      <ProviderWithEvents events={[grade()]}>
        <Wired />
      </ProviderWithEvents>,
    );

    const card = screen.getByTestId('red-flag-card');
    // Default: no active state.
    expect(card.getAttribute('data-active')).toBe('false');

    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    fireEvent.click(screen.getByTestId('red-flag-jump-to-page'));

    // Active ring is applied via data-attr + ring classes.
    expect(card.getAttribute('data-active')).toBe('true');
    expect(card.className).toMatch(/ring-2/);
    expect(card.className).toMatch(/border-indigo-300/);
  });

  it('"View on page N" inside the expanded body calls scrollToPage', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <RedFlagReport />;
    }
    const baseGrade = grade();
    const baseResult = baseGrade.result as Record<string, unknown>;
    render(
      <ProviderWithEvents
        events={[grade({ result: { ...baseResult, page_number: 7 } })]}
      >
        <Wired />
      </ProviderWithEvents>,
    );

    // Expand first.
    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    fireEvent.click(screen.getByTestId('red-flag-jump-to-page'));
    expect(scrollToPage).toHaveBeenCalledWith(7);
  });

  it('latest grading per clause wins (re-runs replace prior result)', () => {
    const earlierResult = {
      clause_id: 'c1',
      severity: 'medium' as const,
      statute_citation: 'NJ Stat A',
      chunk_id: 'x#section:0',
      reasoning: 'old',
      recommended_action: 'old',
      page_number: 1,
      clause_type: 'security_deposit',
      clause_index: 0,
    };
    const laterResult = { ...earlierResult, severity: 'high' as const };
    render(
      <ProviderWithEvents
        events={[
          { ...grade(), result: earlierResult },
          { ...grade(), result: laterResult },
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const cards = screen.getAllByTestId('red-flag-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-severity')).toBe('high');
  });
});
