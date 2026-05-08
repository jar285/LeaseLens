import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EvalHealthSnapshot,
  LeaseGradingSnapshot,
} from '@/lib/cockpit/types';

// vi.mock hoists; declare the spy via vi.hoisted so it's available
// to the factory above the import order.
const { refreshEvalHealthMock } = vi.hoisted(() => ({
  refreshEvalHealthMock: vi.fn(),
}));
vi.mock('@/app/cockpit/actions', () => ({
  refreshEvalHealth: refreshEvalHealthMock,
}));

import { EvalHealthPanel } from './EvalHealthPanel';

const ALL_PASSED: EvalHealthSnapshot = {
  passedCount: 12,
  totalCases: 12,
  totalScore: 48,
  maxScore: 48,
  lastRunAt: '2026-05-08T12:00:00.000Z',
  reportPath: '/x/y',
};
const SOME_FAILED: EvalHealthSnapshot = {
  passedCount: 10,
  totalCases: 12,
  totalScore: 40.4,
  maxScore: 48,
  lastRunAt: '2026-05-08T12:00:00.000Z',
  reportPath: '/x/y',
};

const TIER2_SNAPSHOT: LeaseGradingSnapshot = {
  totalCases: 12,
  precision: 0.83,
  recall: 0.9,
  f1: 0.86,
  groundedness: 0.92,
  exactMatch: 0.58,
  statuteHitRate: 0.67,
  latencyP50Ms: 1850,
  latencyP95Ms: 4200,
  lastRunAt: '2026-05-08T12:00:00.000Z',
  reportPath: '/x/y',
};

describe('EvalHealthPanel', () => {
  afterEach(() => {
    cleanup();
    refreshEvalHealthMock.mockReset();
  });

  it('renders both Tier 1 and Tier 2 sections', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={null}
        initialLeaseGradingSnapshot={null}
      />,
    );
    expect(screen.getByTestId('eval-tier1')).toBeInTheDocument();
    expect(screen.getByTestId('eval-tier2')).toBeInTheDocument();
  });

  it('renders Tier 1 empty message when snapshot is null', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={null}
        initialLeaseGradingSnapshot={null}
      />,
    );
    const tier1 = screen.getByTestId('eval-tier1');
    expect(tier1).toHaveTextContent(/No eval runs recorded yet/i);
    expect(tier1).toHaveTextContent(/eval:golden/);
  });

  it('renders Tier 2 empty message when leaseGrading snapshot is null', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={null}
        initialLeaseGradingSnapshot={null}
      />,
    );
    const tier2 = screen.getByTestId('eval-tier2');
    expect(tier2).toHaveTextContent(/No Tier 2 runs yet/i);
    expect(tier2).toHaveTextContent(/eval:leases/);
  });

  it('renders green Tier 1 badge when all passed', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={ALL_PASSED}
        initialLeaseGradingSnapshot={null}
      />,
    );
    const badge = screen.getByText('12 / 12 passed');
    // Sprint 15.1 — accent palette migrated from raw bg-green-* to
    // semantic bg-success-* tokens (token system in globals.css).
    expect(badge).toHaveClass('bg-success-100');
  });

  it('renders amber Tier 1 badge when some failed', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={SOME_FAILED}
        initialLeaseGradingSnapshot={null}
      />,
    );
    const badge = screen.getByText('10 / 12 passed');
    // Sprint 15.1 — bg-amber-* → bg-warning-* semantic token.
    expect(badge).toHaveClass('bg-warning-100');
  });

  it('renders Tier 2 metric grid when leaseGrading snapshot present', () => {
    render(
      <EvalHealthPanel
        initialSnapshot={null}
        initialLeaseGradingSnapshot={TIER2_SNAPSHOT}
      />,
    );
    const metrics = screen.getByTestId('eval-tier2-metrics');
    expect(metrics).toHaveTextContent('Precision');
    expect(metrics).toHaveTextContent('83%');
    expect(metrics).toHaveTextContent('Recall');
    expect(metrics).toHaveTextContent('90%');
    expect(metrics).toHaveTextContent('F1');
    expect(metrics).toHaveTextContent('86%');
    expect(metrics).toHaveTextContent('Groundedness');
    expect(metrics).toHaveTextContent('92%');
    expect(metrics).toHaveTextContent('Statute hit');
    expect(metrics).toHaveTextContent('67%');
    expect(metrics).toHaveTextContent('Exact match');
    expect(metrics).toHaveTextContent('58%');
    // Latency rollup is rendered below the metric grid
    expect(screen.getByTestId('eval-tier2')).toHaveTextContent(/p50 1850ms/);
    expect(screen.getByTestId('eval-tier2')).toHaveTextContent(/p95 4200ms/);
  });

  it('refresh updates BOTH tier snapshots from a single action call', async () => {
    refreshEvalHealthMock.mockResolvedValue({
      snapshot: ALL_PASSED,
      leaseGrading: TIER2_SNAPSHOT,
    });
    render(
      <EvalHealthPanel
        initialSnapshot={SOME_FAILED}
        initialLeaseGradingSnapshot={null}
      />,
    );
    // Tier 2 starts empty
    expect(screen.getByTestId('eval-tier2')).toHaveTextContent(
      /No Tier 2 runs yet/i,
    );

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    // Tier 1 flipped from amber → green; Tier 2 gained its metric grid.
    await waitFor(() => {
      expect(screen.getByText('12 / 12 passed')).toBeInTheDocument();
    });
    expect(screen.getByTestId('eval-tier2-metrics')).toBeInTheDocument();
    expect(refreshEvalHealthMock).toHaveBeenCalledTimes(1);
  });
});
