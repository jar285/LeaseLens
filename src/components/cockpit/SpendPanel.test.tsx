import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpendSnapshot } from '@/lib/cockpit/types';

vi.mock('@/app/cockpit/actions', () => ({
  refreshSpend: vi.fn(),
}));

import { SpendPanel } from './SpendPanel';

describe('SpendPanel', () => {
  afterEach(cleanup);

  it('renders zero state', () => {
    const zero: SpendSnapshot = {
      date: '2026-05-01',
      tokens_in: 0,
      tokens_out: 0,
      estimated_dollars: 0,
    };
    render(<SpendPanel initialSnapshot={zero} />);
    // 0 appears twice (tokens_in + tokens_out); use getAllByText
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('≈ $0.0000')).toBeInTheDocument();
  });

  it('renders populated state', () => {
    const snapshot: SpendSnapshot = {
      date: '2026-05-01',
      tokens_in: 1234,
      tokens_out: 567,
      estimated_dollars: 0.0124,
    };
    render(<SpendPanel initialSnapshot={snapshot} />);
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('567')).toBeInTheDocument();
    expect(screen.getByText('≈ $0.0124')).toBeInTheDocument();
  });
});
