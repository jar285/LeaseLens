import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '@/lib/workspaces/types';
import { WorkspaceMenu } from './WorkspaceMenu';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function makeBrand(id: string, name: string): Workspace {
  return {
    id,
    name,
    description: `${name} description`,
    is_sample: 0,
    created_at: 0,
    expires_at: 9_999_999_999,
  };
}

describe('WorkspaceMenu', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it('renders the workspace name and a switch affordance', () => {
    render(
      <WorkspaceMenu workspaceName="Acme" isSample={false} otherBrands={[]} />,
    );
    expect(screen.getByText(/· Acme/)).toBeInTheDocument();
    expect(screen.getByText('Switch workspace')).toBeInTheDocument();
  });

  it('toggling the trigger reveals menu items', () => {
    render(
      <WorkspaceMenu workspaceName="Acme" isSample={false} otherBrands={[]} />,
    );
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
    render(
      <WorkspaceMenu workspaceName="Acme" isSample={false} otherBrands={[]} />,
    );
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
    render(
      <WorkspaceMenu
        workspaceName="Side Quest Syndicate"
        isSample
        otherBrands={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));

    expect(
      screen.queryByRole('menuitem', { name: /Sample brand \(active\)/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Use sample brand/i }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('menuitem', { name: /Start a new brand/i }),
    ).toBeInTheDocument();
  });

  it('"Start a new brand" opens the upload modal', () => {
    render(
      <WorkspaceMenu workspaceName="Acme" isSample={false} otherBrands={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Start a new brand/i }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Start a new brand/i }),
    ).toBeInTheDocument();
  });

  it('renders previously-created brands as menuitems', () => {
    const otherBrands = [
      makeBrand('ws-gitlab', 'GitLab'),
      makeBrand('ws-mailchimp', 'MailChimp'),
    ];
    render(
      <WorkspaceMenu
        workspaceName="Acme"
        isSample={false}
        otherBrands={otherBrands}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    expect(
      screen.getByRole('menuitem', { name: /GitLab/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /MailChimp/i }),
    ).toBeInTheDocument();
  });

  it('clicking a previously-created brand POSTs to /api/workspaces/select and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace_id: 'ws-gitlab' }), {
        status: 200,
      }),
    );
    window.fetch = fetchMock;
    const otherBrands = [makeBrand('ws-gitlab', 'GitLab')];
    render(
      <WorkspaceMenu
        workspaceName="Acme"
        isSample={false}
        otherBrands={otherBrands}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Switch workspace/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /GitLab/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workspaces/select',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ workspace_id: 'ws-gitlab' }),
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
