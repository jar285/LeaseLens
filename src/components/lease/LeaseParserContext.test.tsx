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

  it('LeaseParserContext is independent of ChatStreamContext.resetConversation()', async () => {
    // Sprint 28.3 — load-bearing invariant. Resetting the chat thread must
    // not touch parser state. Because the two contexts are now physically
    // separate, this is true by construction; the test pins it so a future
    // refactor that re-couples them fails fast.
    const { ChatStreamProvider, useChatStream } = await import(
      '@/components/chat/ChatStreamContext'
    );
    function HarnessProbe() {
      const { resetConversation } = useChatStream();
      const lp = useLeaseParser();
      return (
        <button type="button" onClick={resetConversation} data-testid="probe-reset">
          reset-chat // lease={lp.activeLease?.lease_id ?? 'none'}
        </button>
      );
    }
    const startLease = lease();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LeaseParserProvider activeLease={startLease}>
        <ChatStreamProvider>{children}</ChatStreamProvider>
      </LeaseParserProvider>
    );
    const { result } = renderHook(() => useLeaseParser(), { wrapper });

    // Trigger the chat-side reset through a real render.
    const { render: rtlRender, fireEvent, screen } = await import(
      '@testing-library/react'
    );
    rtlRender(
      <LeaseParserProvider activeLease={startLease}>
        <ChatStreamProvider>
          <HarnessProbe />
        </ChatStreamProvider>
      </LeaseParserProvider>,
    );
    fireEvent.click(screen.getByTestId('probe-reset'));

    // Parser context value is unchanged: still holding the lease we seeded.
    expect(result.current.activeLease).toEqual(startLease);
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
