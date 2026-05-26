// Sprint 25 — left-pane state machine.
//
// Discriminated union covering empty / restoring / loaded / reattach.
// The hook owns the IndexedDB lookup effect: on mount with rehydrated
// metadata-only `activeLease`, it asks the PdfBinaryRepository for the
// cached bytes and (on hit) pushes a Blob URL into the context via
// `setActiveLease`. On miss, the state terminates in `reattach`.

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatStreamProvider } from '@/components/chat/ChatStreamContext';
import {
  type PdfBinaryRepository,
  setPdfBinaryRepository,
} from '@/lib/lease/pdf-binary-repository';
import { LeaseParserProvider } from './LeaseParserContext';
import { useLeftPaneState } from './useLeftPaneState';

afterEach(() => {
  cleanup();
  setPdfBinaryRepository(null);
  vi.restoreAllMocks();
});

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:restored-mock');
});

function makeRepo(
  overrides: Partial<PdfBinaryRepository> = {},
): PdfBinaryRepository {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    evictExcept: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const wrap =
  (
    initial: {
      lease_id: string;
      filename: string;
      pdfUrl?: string;
    } | null,
  ) =>
  ({ children }: { children: ReactNode }) => (
    <LeaseParserProvider activeLease={initial}>
      <ChatStreamProvider activeLease={initial}>{children}</ChatStreamProvider>
    </LeaseParserProvider>
  );

describe('useLeftPaneState', () => {
  it('returns kind="empty" when no lease is active', () => {
    const { result } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap(null),
    });
    expect(result.current.kind).toBe('empty');
  });

  it('returns kind="loaded" when activeLease already has a pdfUrl', () => {
    const { result } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap({
        lease_id: 'L1',
        filename: 'doc.pdf',
        pdfUrl: 'blob:already-loaded',
      }),
    });
    expect(result.current).toMatchObject({
      kind: 'loaded',
      pdfUrl: 'blob:already-loaded',
      filename: 'doc.pdf',
    });
  });

  it('starts in kind="restoring" then transitions to "loaded" when IndexedDB returns bytes', async () => {
    const fakeBlob = new Blob(['pdf-bytes']);
    setPdfBinaryRepository(
      makeRepo({ get: vi.fn().mockResolvedValue(fakeBlob) }),
    );

    const { result } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap({ lease_id: 'L1', filename: 'doc.pdf' }),
    });

    // Initial render — no pdfUrl, no decided miss, so we're restoring.
    expect(result.current.kind).toBe('restoring');

    await waitFor(() => {
      expect(result.current.kind).toBe('loaded');
    });
    if (result.current.kind !== 'loaded') throw new Error('unreachable');
    expect(result.current.pdfUrl).toMatch(/^blob:/);
  });

  it('transitions to kind="reattach" when IndexedDB has no entry for the lease', async () => {
    setPdfBinaryRepository(makeRepo({ get: vi.fn().mockResolvedValue(null) }));

    const { result } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap({ lease_id: 'L1', filename: 'doc.pdf' }),
    });

    await waitFor(() => {
      expect(result.current.kind).toBe('reattach');
    });
    if (result.current.kind !== 'reattach') throw new Error('unreachable');
    expect(result.current.lease.lease_id).toBe('L1');
  });

  it('treats a repository error the same as a cache miss', async () => {
    setPdfBinaryRepository(
      makeRepo({
        get: vi.fn().mockRejectedValue(new Error('IDB unavailable')),
      }),
    );

    const { result } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap({ lease_id: 'L1', filename: 'doc.pdf' }),
    });

    await waitFor(() => {
      expect(result.current.kind).toBe('reattach');
    });
  });

  it('does not run a second lookup for the same lease after a miss', async () => {
    const get = vi.fn().mockResolvedValue(null);
    setPdfBinaryRepository(makeRepo({ get }));

    const { rerender } = renderHook(() => useLeftPaneState(), {
      wrapper: wrap({ lease_id: 'L1', filename: 'doc.pdf' }),
    });

    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });

    act(() => {
      rerender();
    });

    // Even after rerenders, the missed-lease guard prevents another fetch.
    expect(get).toHaveBeenCalledTimes(1);
  });
});
