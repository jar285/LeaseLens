import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalHealthSnapshot } from '@/lib/cockpit/types';

vi.mock('@/app/cockpit/actions', () => ({
  refreshEvalHealth: vi.fn(),
}));

import { EvalHealthPanel } from './EvalHealthPanel';

const ALL_PASSED: EvalHealthSnapshot = {
  passedCount: 5,
  totalCases: 5,
  totalScore: 25,
  maxScore: 25,
  lastRunAt: '2026-05-01T12:00:00.000Z',
  reportPath: '/x/y',
};
const SOME_FAILED: EvalHealthSnapshot = {
  passedCount: 3,
  totalCases: 5,
  totalScore: 17,
  maxScore: 25,
  lastRunAt: '2026-05-01T12:00:00.000Z',
  reportPath: '/x/y',
};

describe('EvalHealthPanel', () => {
  afterEach(cleanup);

  it('renders empty message when snapshot is null', () => {
    render(<EvalHealthPanel initialSnapshot={null} />);
    expect(screen.getByText(/No eval runs recorded yet/)).toBeInTheDocument();
  });

  it('renders green badge when all passed', () => {
    render(<EvalHealthPanel initialSnapshot={ALL_PASSED} />);
    const badge = screen.getByText('5 / 5 passed');
    expect(badge).toHaveClass('bg-green-100');
  });

  it('renders amber badge when some failed', () => {
    render(<EvalHealthPanel initialSnapshot={SOME_FAILED} />);
    const badge = screen.getByText('3 / 5 passed');
    expect(badge).toHaveClass('bg-amber-100');
  });
});
