// Sprint 28.7 — ChatStreamContext tests.
//
// After the Sprint 3+4 state split, this context is chat-thread-only:
// viewerRole + autoScanConversationId. Parser-shape fields (lease,
// tool events, active clause, PdfViewer ref) live exclusively on
// LeaseParserContext now.

import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatStreamProvider, useChatStream } from './ChatStreamContext';

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => (
  <ChatStreamProvider>{children}</ChatStreamProvider>
);

describe('ChatStreamContext', () => {
  it('initial state has viewerRole defaulted to "Tenant" and autoScanConversationId null', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper });

    expect(result.current.viewerRole).toBe('Tenant');
    expect(result.current.autoScanConversationId).toBeNull();
  });

  it('viewerRole prop flows through to consumers', () => {
    const reviewerWrapper = ({ children }: { children: ReactNode }) => (
      <ChatStreamProvider viewerRole="Reviewer">{children}</ChatStreamProvider>
    );
    const { result } = renderHook(() => useChatStream(), {
      wrapper: reviewerWrapper,
    });
    expect(result.current.viewerRole).toBe('Reviewer');
  });

  it('setAutoScanConversationId updates the auto-scan conversation id', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper });
    act(() => {
      result.current.setAutoScanConversationId('auto-conv-1');
    });
    expect(result.current.autoScanConversationId).toBe('auto-conv-1');

    act(() => {
      result.current.setAutoScanConversationId(null);
    });
    expect(result.current.autoScanConversationId).toBeNull();
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

  // Sprint 28.7 — Sprint 4 cleanup invariant. ChatStreamContext is
  // chat-only after the state split; parser-shape fields (lease,
  // tool events, active clause, PdfViewer ref) now live exclusively
  // on LeaseParserContext. Pin the exposed-keys boundary so a future
  // refactor can't accidentally re-add a parser slot here.
  it('Sprint 28.7 — context shape is chat-only (no parser fields exposed)', () => {
    const { result } = renderHook(() => useChatStream(), { wrapper });
    const keys = Object.keys(
      result.current as unknown as Record<string, unknown>,
    );

    // Parser fields must not be present.
    expect(keys).not.toContain('activeLease');
    expect(keys).not.toContain('toolEvents');
    expect(keys).not.toContain('activeClauseId');
    expect(keys).not.toContain('pdfViewerRef');
    expect(keys).not.toContain('pushToolEvent');
    expect(keys).not.toContain('setActiveLease');
    expect(keys).not.toContain('setActiveClauseId');
    expect(keys).not.toContain('resetConversation');
    expect(keys).not.toContain('restoreConversation');

    // Chat-only fields must remain.
    expect(keys).toContain('viewerRole');
    expect(keys).toContain('autoScanConversationId');
    expect(keys).toContain('setAutoScanConversationId');
  });
});
