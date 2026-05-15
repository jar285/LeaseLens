import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeasePipelinePanel } from './LeasePipelinePanel';

vi.mock('@/app/cockpit/actions', () => ({
  refreshLeasePipeline: vi.fn().mockResolvedValue({
    stats: {
      uploads_24h: 0,
      total_clauses_24h: 0,
      avg_clauses_per_lease: 0,
      lifetime_uploads: 0,
    },
  }),
}));

describe('LeasePipelinePanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the three stats (uploads, total clauses, avg) from the snapshot', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 2,
          total_clauses_24h: 20,
          avg_clauses_per_lease: 10,
          lifetime_uploads: 5,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-uploads-24h')).toHaveTextContent(
      '2',
    );
    expect(
      screen.getByTestId('lease-pipeline-total-clauses'),
    ).toHaveTextContent('20');
    expect(screen.getByTestId('lease-pipeline-avg-clauses')).toHaveTextContent(
      '10',
    );
  });

  it('renders zero state cleanly when the workspace has no leases yet', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 0,
          total_clauses_24h: 0,
          avg_clauses_per_lease: 0,
          lifetime_uploads: 0,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-uploads-24h')).toHaveTextContent(
      '0',
    );
    expect(
      screen.getByTestId('lease-pipeline-total-clauses'),
    ).toHaveTextContent('0');
    expect(screen.getByTestId('lease-pipeline-avg-clauses')).toHaveTextContent(
      '0',
    );
  });

  it('shows lifetime uploads in the subtitle with singular noun when count is 1', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 0,
          total_clauses_24h: 0,
          avg_clauses_per_lease: 0,
          lifetime_uploads: 1,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-panel')).toHaveTextContent(
      '1 lease reviewed',
    );
  });

  it('uses plural noun when lifetime count is not 1', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 0,
          total_clauses_24h: 0,
          avg_clauses_per_lease: 0,
          lifetime_uploads: 7,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-panel')).toHaveTextContent(
      '7 leases reviewed',
    );
  });

  it('formats avg with at most one decimal', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 3,
          total_clauses_24h: 19,
          avg_clauses_per_lease: 19 / 3, // 6.333...
          lifetime_uploads: 3,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-avg-clauses')).toHaveTextContent(
      '6.3',
    );
  });

  it('renders inside the CockpitPanel chrome with a refresh button', () => {
    render(
      <LeasePipelinePanel
        initialStats={{
          uploads_24h: 0,
          total_clauses_24h: 0,
          avg_clauses_per_lease: 0,
          lifetime_uploads: 0,
        }}
      />,
    );
    expect(screen.getByTestId('lease-pipeline-panel')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Lease pipeline' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /refresh panel/i }),
    ).toBeInTheDocument();
  });
});
