import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceMenu } from './WorkspaceMenu';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

describe('WorkspaceMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it('renders the workspace name and a switch affordance', () => {
    render(<WorkspaceMenu workspaceName="Acme" isSample={false} />);
    expect(screen.getByText(/· Acme/)).toBeInTheDocument();
    expect(screen.getByText('Switch workspace')).toBeInTheDocument();
  });

  it('toggling the trigger reveals menu items', () => {
    render(<WorkspaceMenu workspaceName="Acme" isSample={false} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Use sample brand/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Start a new brand/i }),
    ).toBeInTheDocument();
  });

  it('selecting "Use sample brand" POSTs to /api/workspaces/select-sample and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace_id: 'sample' }), {
        status: 200,
      }),
    );
    window.fetch = fetchMock;
    render(<WorkspaceMenu workspaceName="Acme" isSample={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Use sample brand/i }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workspaces/select-sample',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('Round 4 — hides the redundant Sample-brand menu item when the active workspace IS the sample', () => {
    // The popover header already shows "Active brand: Side Quest Syndicate".
    // A disabled "Sample brand (active)" menu item below would be redundant.
    render(<WorkspaceMenu workspaceName="Side Quest Syndicate" isSample />);
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));

    expect(
      screen.queryByRole('menuitem', { name: /Sample brand \(active\)/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Use sample brand/i }),
    ).not.toBeInTheDocument();

    // "Start a new brand…" stays — that's the only useful action when on sample.
    expect(
      screen.getByRole('menuitem', { name: /Start a new brand/i }),
    ).toBeInTheDocument();
  });

  it('"Start a new brand" opens the upload modal', () => {
    render(<WorkspaceMenu workspaceName="Acme" isSample={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Start a new brand/i }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Start a new brand/i }),
    ).toBeInTheDocument();
  });
});
