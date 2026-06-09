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

  // Sprint 23b Phase 1 — document-tray hierarchy. The pre-upload state
  // should read as a calm document tray, not a landing-page hero: smaller
  // icon, tighter padding, single-line footnote hint instead of a three-
  // line stack.
  describe('Sprint 23b — document-tray hierarchy', () => {
    it('icon wrapper uses h-12 w-12 (tighter than the prior h-14 w-14)', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} />);
      const icon = screen.getByTestId('lease-upload-icon');
      expect(icon.className).toMatch(/\bh-12\b/);
      expect(icon.className).toMatch(/\bw-12\b/);
      expect(icon.className).not.toMatch(/\bh-14\b/);
    });

    it('idle hints render as a single footnote line, not three stacked paragraphs', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} />);
      // One node carries the combined footnote text with `·` separators.
      const footnote = screen.getByText(
        /pdf up to 10 mb.*text-layer required.*informational/i,
      );
      expect(footnote).toBeInTheDocument();
      // The legacy three-line variants must not coexist.
      expect(
        screen.queryByText('Your lease text stays in this session.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Informational analysis, not legal advice.'),
      ).not.toBeInTheDocument();
    });

    it('outer section drops to p-6 (tighter than the prior p-8)', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} />);
      const section = screen.getByTestId('lease-upload-dropzone');
      expect(section.className).toMatch(/\bp-6\b/);
      expect(section.className).not.toMatch(/\bp-8\b/);
    });
  });

  // Sprint 29.x — hero landing uses a lighter tray that sits inside the
  // ambient blob instead of reading as a heavy card stacked on top.
  describe('Sprint 29.x — hero presentation', () => {
    it('defaults to tray presentation for workspace / re-upload surfaces', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} />);
      expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
        'data-presentation',
        'tray',
      );
    });

    it('hero idle state uses translucent elevated fill and hairline border', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} presentation="hero" />);
      const section = screen.getByTestId('lease-upload-dropzone');
      expect(section).toHaveAttribute('data-presentation', 'hero');
      expect(section.className).toMatch(/bg-surface-elevated\/50/);
      expect(section.className).toMatch(/border-border-default/);
      expect(section.className).toMatch(/dark:bg-surface-elevated\/20/);
      expect(section.className).not.toMatch(/bg-surface-card/);
    });

    it('hero presentation uses a taller drop target (CloudConvert-style)', () => {
      render(<LeaseUploadDropzone onUploaded={() => {}} presentation="hero" />);
      expect(screen.getByTestId('lease-upload-dropzone').className).toMatch(
        /min-h-\[13\.5rem\]/,
      );
    });
  });

  // Sprint 23b Phase 6.2 — drag-drop file passthrough. The drop path
  // bypasses the <input> element entirely (file goes straight into
  // handleFile), so callers can't recover the File via the DOM. The
  // dropzone must forward the File as a second arg to onUploaded so
  // the parent shell can build a Blob URL for the PDF viewer.
  describe('Sprint 23b — onUploaded file passthrough', () => {
    it('passes the File object alongside UploadResult on click-to-upload', async () => {
      const onUploaded = vi.fn();
      render(<LeaseUploadDropzone onUploaded={onUploaded} />);

      const input = screen.getByTestId(
        'lease-upload-input',
      ) as HTMLInputElement;
      const file = makePdfFile('click-path.pdf');
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(onUploaded).toHaveBeenCalledTimes(1);
      });
      const [result, passedFile] = onUploaded.mock.calls[0];
      expect(result.lease_id).toBe('lease-stub');
      expect(passedFile).toBeInstanceOf(File);
      expect((passedFile as File).name).toBe('click-path.pdf');
    });

    it('passes the File object alongside UploadResult on drag-drop', async () => {
      const onUploaded = vi.fn();
      render(<LeaseUploadDropzone onUploaded={onUploaded} />);

      const dropZone = screen.getByTestId('lease-upload-dropzone');
      const file = makePdfFile('drop-path.pdf');
      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      await waitFor(() => {
        expect(onUploaded).toHaveBeenCalledTimes(1);
      });
      const [, passedFile] = onUploaded.mock.calls[0];
      expect(passedFile).toBeInstanceOf(File);
      expect((passedFile as File).name).toBe('drop-path.pdf');
    });
  });
});
