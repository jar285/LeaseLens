// Sprint 13 §3f — shared state for the three-pane shell.
// ChatUI is the single NDJSON stream reader; while parsing it pushes
// tool events into this context. RedFlagReport reads them; PdfViewer
// registers an imperative ref so the citation-chip click can scroll
// the PDF.

import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ActiveLeaseRef,
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

  // Sprint 24.7 — root-cause fix coverage. resetConversation + restoreConversation
  // are the two new context actions ChatUI calls on "New conversation" /
  // "Continue previous." These unit tests pin their contract independent
  // of the shell + ChatUI wiring.
  describe('Sprint 24.7 — resetConversation / restoreConversation', () => {
    beforeEach(() => {
      global.URL.revokeObjectURL = vi.fn();
    });

    it('resetConversation clears toolEvents, activeClauseId, and activeLease', () => {
      const { result } = renderHook(() => useChatStream(), { wrapper });

      act(() => {
        result.current.pushToolEvent({
          tool_name: 'grade_clause_severity',
          input: { clause_id: 'c1' },
          result: { severity: 'high' },
          audit_id: undefined,
        });
        result.current.setActiveClauseId('c1');
        result.current.setActiveLease({
          lease_id: 'lease-A',
          filename: 'A.pdf',
          pdfUrl: 'blob:fake-url-a',
        });
      });

      expect(result.current.toolEvents).toHaveLength(1);
      expect(result.current.activeClauseId).toBe('c1');
      expect(result.current.activeLease?.lease_id).toBe('lease-A');

      act(() => {
        result.current.resetConversation();
      });

      expect(result.current.toolEvents).toEqual([]);
      expect(result.current.activeClauseId).toBeNull();
      expect(result.current.activeLease).toBeNull();
    });

    it('resetConversation does NOT revoke the active blob URL (revocation moved to the commit boundary in ChatUI)', () => {
      const { result } = renderHook(() => useChatStream(), { wrapper });

      act(() => {
        result.current.setActiveLease({
          lease_id: 'lease-A',
          filename: 'A.pdf',
          pdfUrl: 'blob:url-still-needed-by-undo-stash',
        });
      });

      act(() => {
        result.current.resetConversation();
      });

      // The blob URL must stay alive after reset: ChatUI stashes the
      // same activeLease object for "Continue previous", and revoking
      // here would orphan the URL the undo path needs to reload.
      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('resetConversation is a no-op-safe when no lease is attached', () => {
      const { result } = renderHook(() => useChatStream(), { wrapper });

      act(() => {
        result.current.resetConversation();
      });

      expect(result.current.toolEvents).toEqual([]);
      expect(result.current.activeLease).toBeNull();
      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('restoreConversation replays a snapshot of lease + toolEvents', () => {
      const { result } = renderHook(() => useChatStream(), { wrapper });

      const snapshot: {
        activeLease: ActiveLeaseRef | null;
        toolEvents: ToolEvent[];
      } = {
        activeLease: {
          lease_id: 'lease-B',
          filename: 'B.pdf',
          pdfUrl: 'blob:fake-url-b',
        },
        toolEvents: [
          {
            tool_name: 'grade_clause_severity',
            input: { clause_id: 'c-replayed' },
            result: { severity: 'medium' },
            audit_id: undefined,
          },
        ],
      };

      act(() => {
        result.current.restoreConversation(snapshot);
      });

      expect(result.current.activeLease?.lease_id).toBe('lease-B');
      expect(result.current.toolEvents).toHaveLength(1);
      expect(result.current.toolEvents[0].input).toEqual({
        clause_id: 'c-replayed',
      });
    });
  });
});
