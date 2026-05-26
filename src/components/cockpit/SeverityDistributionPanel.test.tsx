import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeverityDistributionPanel } from './SeverityDistributionPanel';

vi.mock('@/app/cockpit/actions', () => ({
  refreshSeverityDistribution: vi.fn().mockResolvedValue({
    distribution: { high: 0, medium: 0, low: 0, ok: 0, total: 0 },
  }),
}));

describe('SeverityDistributionPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the empty state when no clauses have been graded', () => {
    render(
      <SeverityDistributionPanel
        initialDistribution={{
          high: 0,
          medium: 0,
          low: 0,
          ok: 0,
          total: 0,
        }}
      />,
    );
    expect(screen.getByText(/No clauses graded yet/i)).toBeInTheDocument();
  });

  it('renders one row per severity in HIGH / MED / LOW / OK order, each with its badge + count', () => {
    render(
      <SeverityDistributionPanel
        initialDistribution={{
          high: 4,
          medium: 1,
          low: 2,
          ok: 8,
          total: 15,
        }}
      />,
    );
    expect(screen.getByTestId('severity-row-high')).toHaveAttribute(
      'data-severity',
      'high',
    );
    expect(screen.getByTestId('severity-row-high')).toHaveTextContent('4');
    expect(screen.getByTestId('severity-row-medium')).toHaveTextContent('1');
    expect(screen.getByTestId('severity-row-low')).toHaveTextContent('2');
    expect(screen.getByTestId('severity-row-ok')).toHaveTextContent('8');
  });

  it('renders a SeverityBadge per row (triple-channel severity preserved)', () => {
    render(
      <SeverityDistributionPanel
        initialDistribution={{
          high: 1,
          medium: 0,
          low: 0,
          ok: 0,
          total: 1,
        }}
      />,
    );
    // SeverityBadge carries its own data-testid="severity-badge"; four
    // rows render four badges even when some buckets are zero.
    expect(screen.getAllByTestId('severity-badge')).toHaveLength(4);
  });

  it('surfaces the total in the subtitle', () => {
    render(
      <SeverityDistributionPanel
        initialDistribution={{
          high: 3,
          medium: 1,
          low: 1,
          ok: 5,
          total: 10,
        }}
      />,
    );
    expect(screen.getByTestId('severity-distribution-panel')).toHaveTextContent(
      /total\s*10/i,
    );
  });

  it('renders inside CockpitPanel chrome with a refresh button', () => {
    render(
      <SeverityDistributionPanel
        initialDistribution={{
          high: 0,
          medium: 0,
          low: 0,
          ok: 0,
          total: 0,
        }}
      />,
    );
    expect(
      screen.getByTestId('severity-distribution-panel'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Severity distribution' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /refresh panel/i }),
    ).toBeInTheDocument();
  });
});
