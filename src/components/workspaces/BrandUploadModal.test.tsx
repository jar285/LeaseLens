import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandUploadModal } from './BrandUploadModal';

describe('BrandUploadModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when open=false', () => {
    render(
      <BrandUploadModal open={false} onClose={() => {}} onSuccess={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blank submit shows inline errors for name + description + files', () => {
    render(<BrandUploadModal open onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));
    expect(
      screen.getByText(/Brand name must be 1-80 characters/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Description must be 1-280 characters/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Upload 1-5 markdown files/i)).toBeInTheDocument();
  });

  it('valid submit POSTs multipart to /api/workspaces and calls onSuccess', async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ workspace_id: 'ws-1' }), {
        status: 200,
      }),
    );
    window.fetch = fetchMock;

    render(<BrandUploadModal open onClose={() => {}} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/Brand name/i), {
      target: { value: 'Acme' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'A test brand' },
    });
    const fileInput = screen.getByLabelText(/Brand documents/i);
    const file = new File(['# Brand\n\ncontent'], 'brand.md', {
      type: 'text/markdown',
    });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workspaces',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('hides the file input and lists prefilledFiles when provided', () => {
    const file1 = new File(['x'], 'a.md', { type: 'text/markdown' });
    const file2 = new File(['y'], 'b.md', { type: 'text/markdown' });
    render(
      <BrandUploadModal
        open
        onClose={() => {}}
        onSuccess={() => {}}
        prefilledFiles={[file1, file2]}
      />,
    );
    expect(screen.queryByLabelText(/Brand documents/i)).not.toBeInTheDocument();
    expect(screen.getByText('a.md')).toBeInTheDocument();
    expect(screen.getByText('b.md')).toBeInTheDocument();
    expect(screen.getByText(/Selected files \(2\)/i)).toBeInTheDocument();
  });

  it('renders the drop-zone with click-to-choose copy', () => {
    render(<BrandUploadModal open onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByTestId('brand-files-dropzone')).toBeInTheDocument();
    expect(
      screen.getByText(/Drag \.md files here, or click to choose/i),
    ).toBeInTheDocument();
  });

  it('drag-and-dropping markdown files populates the selected list', () => {
    render(<BrandUploadModal open onClose={() => {}} onSuccess={() => {}} />);
    const dropzone = screen.getByTestId('brand-files-dropzone');
    const file = new File(['# Brand\n\ncontent'], 'brand.md', {
      type: 'text/markdown',
    });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByText('brand.md')).toBeInTheDocument();
    expect(screen.getByText(/1 file selected/i)).toBeInTheDocument();
  });

  it('shows server error message when /api/workspaces returns non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'File too large', field: 'files' }),
        {
          status: 400,
        },
      ),
    );
    window.fetch = fetchMock;

    render(<BrandUploadModal open onClose={() => {}} onSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Brand name/i), {
      target: { value: 'Acme' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'A test brand' },
    });
    const fileInput = screen.getByLabelText(/Brand documents/i);
    const file = new File(['x'], 'brand.md', { type: 'text/markdown' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByRole('button', { name: /Create workspace/i }));

    await waitFor(() =>
      expect(screen.getByText(/File too large/i)).toBeInTheDocument(),
    );
  });
});
