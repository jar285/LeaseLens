// Sprint 44A.2 — getRequestId reads the correlation id the middleware forwards
// onto the request headers (Next 16 `headers()` is async).

import { describe, expect, it, vi } from 'vitest';

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

import { getRequestId } from './request-context';

describe('getRequestId', () => {
  it('returns the x-request-id forwarded onto the request headers', async () => {
    headersMock.mockResolvedValue(new Headers({ 'x-request-id': 'REQ-42' }));
    expect(await getRequestId()).toBe('REQ-42');
  });

  it('returns undefined when the header is absent', async () => {
    headersMock.mockResolvedValue(new Headers());
    expect(await getRequestId()).toBeUndefined();
  });
});
