import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUI } from './ChatUI';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

/**
 * Sprint 11 (revised) — verifies the full drop → modal → POST flow
 * inside ChatUI: dropping a .md file on the chat surface opens the
 * BrandUploadModal with the file prefilled, submitting POSTs to
 * /api/workspaces, and a 200 response triggers router.refresh.
 */
describe('ChatUI brand upload via drop', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it('drop -> modal opens prefilled -> submit POSTs to /api/workspaces -> refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace_id: 'ws-new' }), {
        status: 200,
      }),
    );
    window.fetch = fetchMock;

    render(<ChatUI workspaceName="Side Quest Syndicate" />);
    const zone = screen.getByTestId('file-drop-zone');
    const file = new File(['# Brand\n\ncontent'], 'brand.md', {
      type: 'text/markdown',
    });
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    });

    // Modal renders with the file prefilled (file input hidden, file name shown).
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Start a new brand/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/Brand documents/i)).not.toBeInTheDocument();
    expect(screen.getByText('brand.md')).toBeInTheDocument();

    // Fill metadata and submit.
    fireEvent.change(screen.getByLabelText(/Brand name/i), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'A fictional brand for testing.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workspaces',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // Modal closed after success.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Start a new brand/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('cancel button closes modal without firing fetch', async () => {
    const fetchMock = vi.fn();
    window.fetch = fetchMock;

    render(<ChatUI workspaceName="Side Quest Syndicate" />);
    const zone = screen.getByTestId('file-drop-zone');
    const file = new File(['x'], 'brand.md', { type: 'text/markdown' });
    fireEvent.drop(zone, {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Start a new brand/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Start a new brand/i }),
      ).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
