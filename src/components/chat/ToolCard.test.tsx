import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRollback } from '@/lib/audit/use-rollback';
import type { ToolInvocation } from './ChatMessage';
import { ToolCard } from './ToolCard';

vi.mock('@/lib/audit/use-rollback', () => ({
  useRollback: vi.fn(() => ({
    status: 'idle',
    rollback: vi.fn(),
  })),
}));

function renderToolCard(invocation: Partial<ToolInvocation> = {}) {
  const baseInvocation: ToolInvocation = {
    id: 'tool-1',
    name: 'schedule_content_item',
    input: { document_slug: 'brand-identity' },
    ...invocation,
  };

  return render(<ToolCard invocation={baseInvocation} />);
}

describe('ToolCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders running status and loading body for pending invocations', () => {
    renderToolCard();

    expect(screen.getByText('Running...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tool is running');
  });

  it('renders success state without the loading body', () => {
    renderToolCard({ result: { schedule_id: 'schedule-1' } });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('Tool is running')).not.toBeInTheDocument();
  });

  it('renders error state without the loading body', () => {
    renderToolCard({ error: 'Tool failed', result: { error: 'Tool failed' } });

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Tool is running')).not.toBeInTheDocument();
  });

  it('renders Undo for mutating success with compensating action metadata', () => {
    renderToolCard({
      audit_id: 'audit-1',
      compensating_available: true,
      result: { schedule_id: 'schedule-1' },
    });

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(useRollback).toHaveBeenCalledWith('audit-1');
  });

  it('shows Input and Result sections when completed calls are expanded', () => {
    renderToolCard({ result: { schedule_id: 'schedule-1' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand tool details' }),
    );

    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText(/schedule-1/)).toBeInTheDocument();
  });
});
