import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CockpitAuditRow } from '@/lib/cockpit/types';

vi.mock('@/app/cockpit/actions', () => ({
  refreshAuditFeed: vi.fn(),
}));

import { AuditFeedPanel } from './AuditFeedPanel';

function makeRow(over: Partial<CockpitAuditRow> = {}): CockpitAuditRow {
  return {
    id: 'audit-1',
    tool_name: 'schedule_content_item',
    tool_use_id: null,
    actor_user_id: 'editor-id',
    actor_role: 'Editor',
    conversation_id: null,
    input_json: '{"document_slug":"brand-identity"}',
    output_json: '{"id":"sched-1"}',
    compensating_action_json: '{"schedule_id":"sched-1"}',
    status: 'executed',
    created_at: 1735689600,
    rolled_back_at: null,
    actor_display_name: 'Demo Editor',
    ...over,
  };
}

describe('AuditFeedPanel', () => {
  afterEach(cleanup);

  it('renders empty state when no rows', () => {
    render(<AuditFeedPanel initialRows={[]} role="Admin" userId="u1" />);
    expect(
      screen.getByText('No tool actions recorded yet.'),
    ).toBeInTheDocument();
  });

  it('Editor sees Undo on own rows; mcp-server row falls back to actor_user_id literal and has no Undo for Editor', () => {
    const editorRow = makeRow({ id: 'audit-edit', actor_user_id: 'editor-id' });
    const mcpRow = makeRow({
      id: 'audit-mcp',
      actor_user_id: 'mcp-server',
      actor_role: 'Admin',
      actor_display_name: null,
    });

    render(
      <AuditFeedPanel
        initialRows={[editorRow, mcpRow]}
        role="Editor"
        userId="editor-id"
      />,
    );

    // mcp-server row renders the literal actor_user_id since display_name is null.
    expect(screen.getByText('mcp-server')).toBeInTheDocument();

    // Editor sees exactly one Undo button (for the editor-owned row).
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
    expect(undoButtons).toHaveLength(1);
  });
});
