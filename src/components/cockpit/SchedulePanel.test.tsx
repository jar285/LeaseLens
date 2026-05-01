import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledItem } from '@/lib/cockpit/types';

vi.mock('@/app/cockpit/actions', () => ({
  refreshSchedule: vi.fn(),
}));

import { SchedulePanel } from './SchedulePanel';

const SAMPLE: ScheduledItem = {
  id: 's1',
  document_slug: 'brand-identity',
  scheduled_for: 1735689600,
  channel: 'twitter',
  scheduled_by: 'editor-id',
  created_at: 1735689000,
};

describe('SchedulePanel', () => {
  afterEach(cleanup);

  it('renders empty state when no items', () => {
    render(<SchedulePanel initialItems={[]} />);
    expect(screen.getByText('Nothing scheduled.')).toBeInTheDocument();
  });

  it('renders scheduled item columns when populated', () => {
    render(<SchedulePanel initialItems={[SAMPLE]} />);
    expect(screen.getByText('twitter')).toBeInTheDocument();
    expect(screen.getByText('brand-identity')).toBeInTheDocument();
    expect(screen.getByText('editor-id')).toBeInTheDocument();
  });
});
