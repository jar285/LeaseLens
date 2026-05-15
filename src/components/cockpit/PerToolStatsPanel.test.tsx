import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerToolStatsPanel } from './PerToolStatsPanel';

// Mock the server-action import so the test doesn't reach the cookie /
// workspace boundary — we only care that the refresh wiring fires.
vi.mock('@/app/cockpit/actions', () => ({
  refreshPerToolStats: vi.fn().mockResolvedValue({ stats: [] }),
}));

describe('PerToolStatsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders empty state when there are no stats', () => {
    render(<PerToolStatsPanel initialStats={[]} />);
    expect(
      screen.getByText(/No tool activity in the last 24 hours/i),
    ).toBeInTheDocument();
  });

  it('renders one row per stat with the tool name, invocations, success %, and rollback %', () => {
    render(
      <PerToolStatsPanel
        initialStats={[
          {
            tool_name: 'grade_clause_severity',
            invocations: 8,
            success_rate: 1,
            rollback_rate: 0,
            last_invoked_at: 1700000000,
          },
          {
            tool_name: 'draft_negotiation_email',
            invocations: 3,
            success_rate: 2 / 3,
            rollback_rate: 1 / 3,
            last_invoked_at: 1700000000,
          },
        ]}
      />,
    );
    const grade = screen.getByTestId('per-tool-stat-grade_clause_severity');
    expect(grade).toHaveTextContent('grade_clause_severity');
    expect(grade).toHaveTextContent('8');
    expect(grade).toHaveTextContent('100%');
    expect(grade).toHaveTextContent('0%');

    const draft = screen.getByTestId('per-tool-stat-draft_negotiation_email');
    expect(draft).toHaveTextContent('draft_negotiation_email');
    expect(draft).toHaveTextContent('3');
    expect(draft).toHaveTextContent('67%');
    expect(draft).toHaveTextContent('33%');
  });

  it('renders the CockpitPanel chrome with the right title and a refresh button', () => {
    render(<PerToolStatsPanel initialStats={[]} />);
    expect(screen.getByTestId('per-tool-stats-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Per-tool activity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /refresh panel/i }),
    ).toBeInTheDocument();
  });
});
