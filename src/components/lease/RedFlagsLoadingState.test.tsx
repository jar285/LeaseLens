// Sprint 27 — UI tests for the 6-stage red-flags loading panel.
//
// `RedFlagsLoadingState` is a pure presentational component: it
// accepts a `ScanLifecycleSnapshot` and renders one row per stage in
// LIFECYCLE_STAGES, marking each row complete / active / pending
// based on the current stage's index. This isolates the visual
// contract from the (timer-driven) `useScanLifecycle` hook so tests
// can pin behaviour deterministically.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RedFlagsLoadingState } from './RedFlagsLoadingState';
import type { ScanLifecycleSnapshot } from './scan-lifecycle';
import type { ScanProgress } from './use-scan-progress';

afterEach(() => {
  cleanup();
});

function snap(partial: Partial<ScanLifecycleSnapshot>): ScanLifecycleSnapshot {
  const baseProgress: ScanProgress = {
    phase: 'idle',
    total: 0,
    attempted: 0,
    label: '',
  };
  return {
    stage: 'upload_received',
    index: 0,
    label: 'Upload received',
    detail: null,
    progress: baseProgress,
    ...partial,
  };
}

describe('RedFlagsLoadingState', () => {
  it('renders one row per lifecycle stage (six stages, in order)', () => {
    render(<RedFlagsLoadingState snapshot={snap({})} />);
    const list = screen.getByTestId('red-flag-lifecycle');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toMatch(/upload received/i);
    expect(rows[1].textContent).toMatch(/reading the lease/i);
    expect(rows[2].textContent).toMatch(/extracting clauses/i);
    expect(rows[3].textContent).toMatch(/checking clauses/i);
    expect(rows[4].textContent).toMatch(/preparing red flags/i);
    expect(rows[5].textContent).toMatch(/review ready/i);
  });

  it('marks earlier rows complete, the current row active, later rows pending', () => {
    render(
      <RedFlagsLoadingState
        snapshot={snap({
          stage: 'extracting_clauses',
          index: 2,
          label: 'Extracting clauses',
        })}
      />,
    );
    const rows = within(screen.getByTestId('red-flag-lifecycle')).getAllByRole(
      'listitem',
    );
    expect(rows[0]).toHaveAttribute('data-status', 'complete');
    expect(rows[1]).toHaveAttribute('data-status', 'complete');
    expect(rows[2]).toHaveAttribute('data-status', 'active');
    expect(rows[3]).toHaveAttribute('data-status', 'pending');
    expect(rows[4]).toHaveAttribute('data-status', 'pending');
    expect(rows[5]).toHaveAttribute('data-status', 'pending');
  });

  it('surfaces the snapshot.detail subtext on the active row', () => {
    render(
      <RedFlagsLoadingState
        snapshot={snap({
          stage: 'checking_clauses',
          index: 3,
          label: 'Checking clauses against NJ tenant-law rules',
          detail: 'Grading 7 of 12',
        })}
      />,
    );
    const rows = within(screen.getByTestId('red-flag-lifecycle')).getAllByRole(
      'listitem',
    );
    expect(rows[3].textContent).toMatch(/7/);
    expect(rows[3].textContent).toMatch(/12/);
  });

  it('exposes the live region for stage transitions (aria-live polite)', () => {
    render(<RedFlagsLoadingState snapshot={snap({})} />);
    const list = screen.getByTestId('red-flag-lifecycle');
    expect(list).toHaveAttribute('aria-live', 'polite');
  });

  it('renders nothing when stage is "idle" (no lease)', () => {
    render(
      <RedFlagsLoadingState
        snapshot={snap({ stage: 'idle', index: -1, label: '' })}
      />,
    );
    expect(screen.queryByTestId('red-flag-lifecycle')).not.toBeInTheDocument();
  });

  it('marks every row complete once the lifecycle reaches review_ready', () => {
    render(
      <RedFlagsLoadingState
        snapshot={snap({
          stage: 'review_ready',
          index: 5,
          label: 'Review ready',
        })}
      />,
    );
    const rows = within(screen.getByTestId('red-flag-lifecycle')).getAllByRole(
      'listitem',
    );
    for (const row of rows) {
      expect(['complete', 'active']).toContain(
        row.getAttribute('data-status'),
      );
    }
    expect(rows[5]).toHaveAttribute('data-status', 'active');
  });
});
