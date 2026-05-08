// Sprint 13 §3f — empty-state replacement when active_lease_id is set
// and the conversation has zero messages. Posts the synthetic user
// message on click so the demo guardrails (rate limit + spend ceiling)
// trip on a deliberate user action rather than on page load.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaseScanCTA } from './LeaseScanCTA';

afterEach(cleanup);

describe('LeaseScanCTA', () => {
  it('renders the CTA copy with the page count', () => {
    render(<LeaseScanCTA leaseId="lease-1" pageCount={14} onScan={() => {}} />);
    expect(screen.getByText(/14[\s-]page/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /run the standard scan/i }),
    ).toBeInTheDocument();
  });

  it('invokes onScan when the button is clicked', () => {
    const onScan = vi.fn();
    render(<LeaseScanCTA leaseId="lease-1" pageCount={3} onScan={onScan} />);
    fireEvent.click(
      screen.getByRole('button', { name: /run the standard scan/i }),
    );
    expect(onScan).toHaveBeenCalledTimes(1);
  });

  it('passes the leaseId to onScan callbacks that expect it', () => {
    const onScan = vi.fn();
    render(<LeaseScanCTA leaseId="lease-42" pageCount={5} onScan={onScan} />);
    fireEvent.click(
      screen.getByRole('button', { name: /run the standard scan/i }),
    );
    // The CTA hands the leaseId to onScan so the parent can post a
    // synthetic user message that names the active lease.
    expect(onScan).toHaveBeenCalledWith('lease-42');
  });
});
