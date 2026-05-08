// Sprint 13 §3f — shared state for the three-pane shell.
// ChatUI is the single NDJSON stream reader; while parsing it pushes
// tool events into this context. RedFlagReport reads them; PdfViewer
// registers an imperative ref so the citation-chip click can scroll
// the PDF.

import { cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from './ChatStreamContext';

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatStreamProvider>{children}</ChatStreamProvider>
);

describe('ChatStreamContext', () => {
  it('initial state has empty toolEvents and a ref with .current === null', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper });

    expect(result.current.toolEvents).toEqual([]);
    expect(result.current.pdfViewerRef).toBeDefined();
    expect(result.current.pdfViewerRef.current).toBeNull();
  });

  it('pushToolEvent appends events in order', () => {
    const { result, rerender } = renderHook(() => useChatStream(), {
      wrapper,
    });

    const event1: ToolEvent = {
      tool_name: 'extract_clauses',
      input: { lease_id: 'l1' },
      result: { clauses: [] },
      audit_id: undefined,
    };
    const event2: ToolEvent = {
      tool_name: 'grade_clause_severity',
      input: { clause_id: 'c1' },
      result: { severity: 'high' },
      audit_id: undefined,
    };

    result.current.pushToolEvent(event1);
    rerender();
    result.current.pushToolEvent(event2);
    rerender();

    expect(result.current.toolEvents).toHaveLength(2);
    expect(result.current.toolEvents[0].tool_name).toBe('extract_clauses');
    expect(result.current.toolEvents[1].tool_name).toBe(
      'grade_clause_severity',
    );
  });

  it('useChatStream throws when called outside a provider', () => {
    expect(() => renderHook(() => useChatStream())).toThrow(
      /ChatStreamProvider/,
    );
  });

  it('renders children inside the provider', () => {
    const { container } = render(
      <ChatStreamProvider>
        <div data-testid="child" />
      </ChatStreamProvider>,
    );
    expect(
      container.querySelector('[data-testid="child"]'),
    ).toBeInTheDocument();
  });
});
