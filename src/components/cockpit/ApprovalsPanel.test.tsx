import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalRecord } from '@/lib/cockpit/types';

vi.mock('@/app/cockpit/actions', () => ({
  refreshApprovals: vi.fn(),
}));

import { ApprovalsPanel } from './ApprovalsPanel';

const SAMPLE: ApprovalRecord = {
  id: 'a1',
  document_slug: 'brand-identity',
  approved_by: 'admin-id',
  notes: 'looks good',
  created_at: 1735689600,
};

describe('ApprovalsPanel', () => {
  afterEach(cleanup);

  it('renders empty state when no items', () => {
    render(<ApprovalsPanel initialItems={[]} />);
    expect(screen.getByText('No approvals recorded yet.')).toBeInTheDocument();
  });

  it('renders approval row when populated', () => {
    render(<ApprovalsPanel initialItems={[SAMPLE]} />);
    expect(screen.getByText('brand-identity')).toBeInTheDocument();
    expect(screen.getByText('admin-id')).toBeInTheDocument();
    expect(screen.getByText('looks good')).toBeInTheDocument();
  });
});
