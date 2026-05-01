import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRollback } from './use-rollback';

describe('useRollback', () => {
  beforeEach(() => {
    window.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial state is idle', () => {
    const { result } = renderHook(() => useRollback('audit-1'));
    expect(result.current.status).toBe('idle');
  });

  it('successful POST transitions idle → rolling_back → rolled_back', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ rolled_back: true }), { status: 200 }),
    );
    const { result } = renderHook(() => useRollback('audit-1'));
    await act(async () => {
      await result.current.rollback();
    });
    expect(window.fetch).toHaveBeenCalledWith('/api/audit/audit-1/rollback', {
      method: 'POST',
    });
    expect(result.current.status).toBe('rolled_back');
  });

  it('failed POST transitions to rollback_failed; retry returns to rolled_back on success', async () => {
    (window.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rolled_back: true }), { status: 200 }),
      );
    const { result } = renderHook(() => useRollback('audit-1'));
    await act(async () => {
      await result.current.rollback();
    });
    expect(result.current.status).toBe('rollback_failed');
    await act(async () => {
      await result.current.rollback();
    });
    await waitFor(() => expect(result.current.status).toBe('rolled_back'));
  });
});
