// S19.6 — visual contract for the per-stage row.
//
// ScanTimelineRow renders four states: pending, active, complete, error.
// 'error' is new in S19.6 — when every clause in a stage's bucket
// errored, the row shows a warning icon plus a friendly translated
// message ("I skipped this section…") instead of the success state.
// Severity is communicated by BOTH icon and text (a11y rule §7).
//
// Existing pending/active/complete behaviour is covered indirectly by
// ScanTimeline.test.tsx; this file focuses on the new error variant
// and the partial-failure annotation.

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanTimelineRow } from './ScanTimelineRow';
import type { ScanStage } from './scan-stages';

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

afterEach(cleanup);

beforeEach(() => {
  useReducedMotionMock.mockReset();
  useReducedMotionMock.mockReturnValue(true);
});

function stage(overrides: Partial<ScanStage> = {}): ScanStage {
  return {
    stageId: 'grade:Checking security deposit terms',
    label: 'Checking security deposit terms',
    status: 'complete',
    clausesTotal: 2,
    clausesGraded: 2,
    clausesErrored: 0,
    firstSeenIndex: 0,
    ...overrides,
  };
}

describe('ScanTimelineRow — error variant', () => {
  it('renders the error icon when status is `error`', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({ status: 'error', clausesErrored: 2 })}
        />
      </ul>,
    );
    expect(screen.getByTestId('scan-stage-icon-error')).toBeInTheDocument();
    expect(
      screen.queryByTestId('scan-stage-icon-complete'),
    ).not.toBeInTheDocument();
  });

  it('shows a translated "skipped" message alongside the label', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({ status: 'error', clausesErrored: 2 })}
        />
      </ul>,
    );
    expect(screen.getByText(/skip|couldn.?t|trouble/i)).toBeInTheDocument();
  });

  it('still surfaces the stage label so the user knows WHICH section was skipped', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({ status: 'error', clausesErrored: 2 })}
        />
      </ul>,
    );
    expect(
      screen.getByText('Checking security deposit terms'),
    ).toBeInTheDocument();
  });

  it('the row exposes `data-status="error"` for downstream styling hooks', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({ status: 'error', clausesErrored: 2 })}
        />
      </ul>,
    );
    expect(screen.getByTestId('scan-stage-row')).toHaveAttribute(
      'data-status',
      'error',
    );
  });
});

describe('ScanTimelineRow — partial failure annotation', () => {
  it('appends a "(N skipped)" annotation when some but not all attempts errored', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({
            status: 'complete',
            clausesGraded: 3,
            clausesTotal: 3,
            clausesErrored: 1,
          })}
        />
      </ul>,
    );
    // The row's status stays `complete` (because at least one clause
    // succeeded), but a small annotation tells the tenant ONE clause
    // couldn't be graded.
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument();
  });

  it('does NOT render the annotation when all clauses graded cleanly', () => {
    render(
      <ul>
        <ScanTimelineRow
          stage={stage({
            status: 'complete',
            clausesGraded: 3,
            clausesTotal: 3,
            clausesErrored: 0,
          })}
        />
      </ul>,
    );
    expect(screen.queryByText(/skipped/i)).not.toBeInTheDocument();
  });
});
