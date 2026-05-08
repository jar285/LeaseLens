// Sprint 13 §3f / Phase 10.5 — drag-and-drop + click-to-pick lease
// uploader with explicit visual states for idle / hover / drag-over /
// uploading / success / error. Posts to POST /api/leases. Client-side
// content-type filter so non-PDFs never reach the route.
//
// Visual hierarchy follows the Wathan/Schoger playbook: large soft
// icon at low contrast, bold concise headline, low-contrast subtext,
// pill-style affordance, and per-state accent colors that read at a
// glance. Each state is also exposed as `data-status="..."` on the
// root <section> so tests can assert without reading classnames.

'use client';

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import {
  type ChangeEvent,
  type DragEvent,
  useId,
  useRef,
  useState,
} from 'react';

export interface UploadResult {
  lease_id: string;
  page_count: number;
  clause_count: number;
}

export interface LeaseUploadDropzoneProps {
  onUploaded: (result: UploadResult) => void;
  onError?: (message: string) => void;
  conversationId?: string | null;
}

type Status = 'idle' | 'dragover' | 'uploading' | 'error' | 'success';

function classNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}

export function LeaseUploadDropzone({
  onUploaded,
  onError,
  conversationId,
}: LeaseUploadDropzoneProps): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag-enter / drag-leave fires on EVERY child entered. We track depth
  // so the dragover state only resets when the cursor truly leaves the
  // outer surface. (Same pattern Ordo's ChatInput uses.)
  const dragDepthRef = useRef(0);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [filename, setFilename] = useState<string | null>(null);

  function reportError(msg: string): void {
    setStatus('error');
    setStatusMsg(msg);
    onError?.(msg);
  }

  async function handleFile(file: File): Promise<void> {
    setFilename(file.name);

    if (file.type !== 'application/pdf') {
      reportError('Please upload a PDF (application/pdf).');
      return;
    }

    setStatus('uploading');
    setStatusMsg('Parsing lease…');

    try {
      const form = new FormData();
      form.append('file', file);
      if (conversationId) form.append('conversationId', conversationId);

      const res = await fetch('/api/leases', {
        method: 'POST',
        body: form,
      });
      const body = (await res.json()) as UploadResult | { error?: string };

      if (!res.ok) {
        const errMsg =
          (body as { error?: string }).error ?? `HTTP ${res.status}`;
        reportError(errMsg);
        return;
      }

      const ok = body as UploadResult;
      setStatus('success');
      const pluralPages = ok.page_count !== 1 ? 's' : '';
      const pluralClauses = ok.clause_count !== 1 ? 's' : '';
      setStatusMsg(
        `${ok.page_count} page${pluralPages} · ${ok.clause_count} clause${pluralClauses}`,
      );
      onUploaded(ok);
    } catch (err) {
      reportError(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    dragDepthRef.current = 0;
    if (status === 'dragover') setStatus('idle');
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (status === 'idle' || status === 'error') {
      setStatus('dragover');
    }
  }

  function onDragLeave(): void {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0 && status === 'dragover') {
      setStatus('idle');
    }
  }

  const isDragOver = status === 'dragover';
  const isUploading = status === 'uploading';
  const isError = status === 'error';
  const isSuccess = status === 'success';

  return (
    <section
      data-testid="lease-upload-dropzone"
      data-status={status}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Lease PDF upload area"
      className={classNames(
        'group relative flex w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200',
        isDragOver &&
          'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100',
        isUploading && 'border-indigo-200 bg-indigo-50/30',
        isError && 'border-red-200 bg-red-50/40',
        isSuccess && 'border-emerald-200 bg-emerald-50/40',
        !isDragOver &&
          !isUploading &&
          !isError &&
          !isSuccess &&
          'border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50/80',
      )}
    >
      {/* Status icon */}
      <div
        data-testid="lease-upload-icon"
        className={classNames(
          'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors duration-200',
          isDragOver && 'bg-indigo-100 text-indigo-600',
          isUploading && 'bg-indigo-50 text-indigo-500',
          isError && 'bg-red-50 text-red-500',
          isSuccess && 'bg-emerald-50 text-emerald-600',
          !isDragOver &&
            !isUploading &&
            !isError &&
            !isSuccess &&
            'bg-gray-100 text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-500',
        )}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : isError ? (
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        ) : isSuccess ? (
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        ) : (
          <FileUp className="h-6 w-6" aria-hidden="true" />
        )}
      </div>

      {/* Headline + subtext */}
      <div className="space-y-1">
        <p className="text-[15px] font-semibold tracking-tight text-gray-900">
          {isDragOver
            ? 'Drop the PDF to upload'
            : isUploading
              ? 'Parsing your lease…'
              : isError
                ? 'Upload failed'
                : isSuccess
                  ? 'Lease ready'
                  : 'Drop your NJ residential lease'}
        </p>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-gray-500">
          {isDragOver
            ? 'Release to start parsing'
            : isUploading
              ? (filename ?? 'Reading clauses and pages…')
              : isError
                ? statusMsg
                : isSuccess
                  ? statusMsg
                  : 'or click to browse. We’ll scan it against NJ tenant law and surface red flags in seconds.'}
        </p>
      </div>

      {/* Affordance — hidden during uploading and on success */}
      {!isUploading && !isSuccess ? (
        <label
          htmlFor={inputId}
          data-testid="lease-upload-label"
          className={classNames(
            'cursor-pointer rounded-md border px-3.5 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            isError
              ? 'border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 focus-visible:ring-red-200'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 focus-visible:ring-indigo-200',
          )}
        >
          {isError ? 'Try another file' : 'Choose a file'}
        </label>
      ) : null}

      {/* Hint */}
      {status === 'idle' ? (
        <p className="text-[11px] text-gray-400">PDF files up to 10 MB</p>
      ) : null}

      <input
        id={inputId}
        ref={inputRef}
        data-testid="lease-upload-input"
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={onChange}
      />

      {/* Hidden text consumed by tests + screen readers */}
      {statusMsg ? (
        <span
          data-testid="lease-upload-status"
          data-status={status}
          className="sr-only"
        >
          {statusMsg}
        </span>
      ) : null}
    </section>
  );
}
