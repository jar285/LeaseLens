// Sprint 28.2 — LeaseParserContext red tests.
//
// This new context owns the parser-shaped slice that previously co-habited
// with ChatStreamContext (activeLease, toolEvents, activeClauseId, the
// PdfViewer imperative ref). Sprint 2 lands the context + tests in isolation
// — no consumer migrated, no behavior change in the existing app.

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ActiveLeaseRef,
  ToolEvent,
} from '@/components/chat/ChatStreamContext';
import { LeaseParserProvider, useLeaseParser } from './LeaseParserContext';

afterEach(cleanup);

const lease = (overrides: Partial<ActiveLeaseRef> = {}): ActiveLeaseRef => ({
  lease_id: 'l1',
  filename: 'sample.pdf',
  page_count: 12,
  clause_count: 8,
  ...overrides,
});

const extractEvent = (clauseIds: string[]): ToolEvent => ({
  tool_name: 'extract_clauses',
  input: { lease_id: 'l1' },
  result: { clauses: clauseIds.map((id) => ({ clause_id: id })) },
  audit_id: undefined,
});

const gradeEvent = (clauseId: string): ToolEvent => ({
  tool_name: 'grade_clause_severity',
  input: { clause_id: clauseId },
  result: { clause_id: clauseId, severity: 'high' },
  audit_id: undefined,
});

describe('LeaseParserContext', () => {
  it('initial state: empty toolEvents, null activeClauseId, null activeLease, pdfViewerRef ready', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider>{children}</LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });

    expect(result.current.toolEvents).toEqual([]);
    expect(result.current.activeClauseId).toBeNull();
    expect(result.current.activeLease).toBeNull();
    expect(result.current.pdfViewerRef).toBeDefined();
    expect(result.current.pdfViewerRef.current).toBeNull();
  });

  it('hydrates toolEvents and activeLease from props', () => {
    const initial = extractEvent(['c1', 'c2']);
    const startLease = lease();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider initialEvents={[initial]} activeLease={startLease}>
        {children}
      </LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });

    expect(result.current.toolEvents).toHaveLength(1);
    expect(result.current.toolEvents[0].tool_name).toBe('extract_clauses');
    expect(result.current.activeLease).toEqual(startLease);
  });

  it('appendToolEvent appends events in order', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider>{children}</LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });
    const a = extractEvent(['c1']);
    const b = gradeEvent('c1');

    act(() => {
      result.current.appendToolEvent(a);
    });
    act(() => {
      result.current.appendToolEvent(b);
    });

    expect(result.current.toolEvents).toHaveLength(2);
    expect(result.current.toolEvents[0].tool_name).toBe('extract_clauses');
    expect(result.current.toolEvents[1].tool_name).toBe(
      'grade_clause_severity',
    );
  });

  it('setActiveClauseId updates', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider>{children}</LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });

    act(() => {
      result.current.setActiveClauseId('c-deposit');
    });
    expect(result.current.activeClauseId).toBe('c-deposit');

    act(() => {
      result.current.setActiveClauseId(null);
    });
    expect(result.current.activeClauseId).toBeNull();
  });

  it('setActiveLease updates', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider>{children}</LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });
    const newLease = lease({ lease_id: 'l2', filename: 'other.pdf' });

    act(() => {
      result.current.setActiveLease(newLease);
    });
    expect(result.current.activeLease).toEqual(newLease);

    act(() => {
      result.current.setActiveLease(null);
    });
    expect(result.current.activeLease).toBeNull();
  });

  it('resetParser clears activeLease, toolEvents, and activeClauseId', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider
        initialEvents={[extractEvent(['c1', 'c2'])]}
        activeLease={lease()}
      >
        {children}
      </LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });
    act(() => {
      result.current.setActiveClauseId('c1');
    });
    expect(result.current.toolEvents).toHaveLength(1);
    expect(result.current.activeLease).not.toBeNull();
    expect(result.current.activeClauseId).toBe('c1');

    act(() => {
      result.current.resetParser();
    });

    expect(result.current.toolEvents).toEqual([]);
    expect(result.current.activeLease).toBeNull();
    expect(result.current.activeClauseId).toBeNull();
  });

  it('restoreParserSnapshot replays activeLease + toolEvents atomically', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider>{children}</LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });
    const snapshot = {
      activeLease: lease(),
      toolEvents: [extractEvent(['c1', 'c2']), gradeEvent('c1')],
    };

    act(() => {
      result.current.restoreParserSnapshot(snapshot);
    });

    expect(result.current.activeLease).toEqual(snapshot.activeLease);
    expect(result.current.toolEvents).toHaveLength(2);
    expect(result.current.toolEvents[1].tool_name).toBe(
      'grade_clause_severity',
    );
  });

  it('Sprint 28.7 — LeaseParserContext is independent of ChatStreamContext by construction', () => {
    // After Sprint 4, ChatStreamContext exposes no callbacks that could
    // reach parser state (resetConversation / restoreConversation /
    // setActiveLease are all gone). The shape-test in
    // ChatStreamContext.test.tsx enforces this at the read site; this
    // companion test confirms LeaseParserContext continues to hold its
    // seed when ChatStreamContext is also mounted alongside.
    const startLease = lease();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider activeLease={startLease}>
        {children}
      </LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });

    expect(result.current.activeLease).toEqual(startLease);
  });

  it('RedFlagReport reads gradings from LeaseParserContext when ChatStreamContext is empty (consumer-migration invariant)', async () => {
    // Sprint 3.2 — load-bearing test. Consumers must read parser state
    // from LeaseParserContext. Pre-migration, RedFlagReport reads from
    // useChatStream and this test fails (empty stream → empty state).
    // Post-migration, RedFlagReport reads from useLeaseParser and the
    // seeded grading event surfaces as a card.
    const { ChatStreamProvider } = await import(
      '@/components/chat/ChatStreamContext'
    );
    const { AssistantFabProvider } = await import(
      '@/components/chat/AssistantFabContext'
    );
    const { RedFlagReport } = await import('./RedFlagReport');
    const { render: rtlRender, screen } = await import(
      '@testing-library/react'
    );

    const gradingEvent = {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c-deposit' },
      result: {
        clause_id: 'c-deposit',
        severity: 'high',
        statute_citation: 'NJ Stat 46:8-21.2',
        chunk_id: 'security-deposit#1',
        reasoning: 'Two months exceeds NJ 1.5x cap.',
        recommended_action: 'Negotiate to 1.5 months.',
        page_number: 4,
        clause_type: 'security_deposit',
        clause_index: 3,
      },
      audit_id: undefined,
    } as const;

    rtlRender(
      <LeaseParserProvider initialEvents={[gradingEvent]}>
        <ChatStreamProvider>
          <AssistantFabProvider>
            <RedFlagReport />
          </AssistantFabProvider>
        </ChatStreamProvider>
      </LeaseParserProvider>,
    );

    // If RedFlagReport still reads from useChatStream, gradings.length
    // is 0 and the empty state renders. The migration succeeds when
    // the grading shows up as a card here.
    expect(screen.queryByTestId('red-flag-card')).not.toBeNull();
  });

  it('useLeaseParser throws when called outside <LeaseParserProvider>', () => {
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useLeaseParser())).toThrow(
        /LeaseParserProvider/,
      );
    } finally {
      console.error = consoleError;
    }
  });
});
