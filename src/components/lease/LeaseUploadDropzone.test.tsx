// Sprint 13 §3f — drag-and-drop + click-to-pick upload. Posts to
// POST /api/leases. Surfaces progress / error / success states.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseUploadDropzone } from './LeaseUploadDropzone';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Default: stub fetch with a 200 response.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lease_id: 'lease-stub',
        page_count: 2,
        clause_count: 5,
      }),
    } as unknown as Response),
  );
});

function makePdfFile(name = 'lease.pdf', size = 1024): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: 'application/pdf' });
}

describe('LeaseUploadDropzone', () => {
  it('renders the drop zone with prompt copy in idle state', () => {
    render(<LeaseUploadDropzone onUploaded={() => {}} />);
    // Phase 10.5 — copy expanded to "Drop your NJ residential lease".
    expect(
      screen.getByText(/drop your nj residential lease/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('lease-upload-input')).toBeInTheDocument();
    expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
      'data-status',
      'idle',
    );
  });

  it('shows uploading copy + spinner state while the file is being parsed', async () => {
    // Hold fetch open so we can observe the "uploading" state mid-flight.
    let resolveFetch: (value: Response) => void = () => {};
    const fetchPromise = new Promise<Response>((res) => {
      resolveFetch = res;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(fetchPromise as Promise<Response>),
    );

    render(<LeaseUploadDropzone onUploaded={() => {}} />);
    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [makePdfFile('lease.pdf')],
    });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
        'data-status',
        'uploading',
      );
    });
    expect(screen.getByText(/parsing your lease/i)).toBeInTheDocument();
    // Resolve the in-flight fetch so the test can clean up cleanly.
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        lease_id: 'l',
        page_count: 1,
        clause_count: 1,
      }),
    } as unknown as Response);
    await waitFor(() => {
      expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
        'data-status',
        'success',
      );
    });
  });

  it('flips to data-status="error" when the API returns 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'PDF text layer is empty.' }),
      } as unknown as Response),
    );
    render(<LeaseUploadDropzone onUploaded={() => {}} />);

    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [makePdfFile()] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
        'data-status',
        'error',
      );
    });
    expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
    expect(screen.getByTestId('lease-upload-label')).toHaveTextContent(
      /try another file/i,
    );
  });

  it('flips to data-status="dragover" while a file is dragged over the zone', () => {
    render(<LeaseUploadDropzone onUploaded={() => {}} />);
    const dropZone = screen.getByTestId('lease-upload-dropzone');
    fireEvent.dragEnter(dropZone, {
      dataTransfer: { types: ['Files'] },
    });
    expect(dropZone).toHaveAttribute('data-status', 'dragover');
    // Sprint 15 Phase 7 — copy swapped from "Drop the PDF to upload" to
    // "Drop to scan" (briefer, action-oriented).
    expect(screen.getByText(/drop to scan/i)).toBeInTheDocument();
  });

  it('uploads the chosen file and calls onUploaded with the parsed response', async () => {
    const onUploaded = vi.fn();
    render(<LeaseUploadDropzone onUploaded={onUploaded} />);

    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    const file = makePdfFile();
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledTimes(1);
    });
    expect(onUploaded.mock.calls[0][0]).toEqual({
      lease_id: 'lease-stub',
      page_count: 2,
      clause_count: 5,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/leases',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('calls onError with the response message when the API returns 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 413,
        json: async () => ({ error: 'too large' }),
      } as unknown as Response),
    );
    const onError = vi.fn();
    render(<LeaseUploadDropzone onUploaded={() => {}} onError={onError} />);

    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [makePdfFile()] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    expect(onError.mock.calls[0][0]).toMatch(/too large|413/i);
  });

  it('rejects non-PDF selections client-side without calling fetch', async () => {
    const onError = vi.fn();
    render(<LeaseUploadDropzone onUploaded={() => {}} onError={onError} />);

    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    const txt = new File(['x'], 'lease.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [txt] });
    fireEvent.change(input);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/pdf/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('handles drop events and triggers the same upload pipeline', async () => {
    const onUploaded = vi.fn();
    render(<LeaseUploadDropzone onUploaded={onUploaded} />);

    const dropZone = screen.getByTestId('lease-upload-dropzone');
    const file = makePdfFile();
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledTimes(1);
    });
  });
});
