// Sprint 44A.3 — the route-segment error boundary renders an accessible
// fallback (role=alert), surfaces the digest as a correlation handle, lets the
// user retry (reset) or go home, and reports to the server logger.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { report } = vi.hoisted(() => ({
  report: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/log/report-client-error', () => ({ reportClientError: report }));

import RouteError from './error';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeError() {
  const e = new Error('boom') as Error & { digest?: string };
  e.digest = 'DIGEST-123';
  return e;
}

describe('route error boundary', () => {
  it('renders an accessible alert with the digest reference', () => {
    render(<RouteError error={makeError()} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/DIGEST-123/)).toBeInTheDocument();
  });

  it('retries via reset and links home', () => {
    const reset = vi.fn();
    render(<RouteError error={makeError()} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('reports the error to the server logger (digest + name only)', () => {
    render(<RouteError error={makeError()} reset={vi.fn()} />);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ digest: 'DIGEST-123', name: 'Error' }),
    );
  });
});
