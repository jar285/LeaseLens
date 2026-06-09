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
//
// Sprint 15 Phase 7 — dragover dashed→solid accent, copy swap to
// "Drop to scan", single-pulse icon scale on dragover entry, full
// token sweep + dark-mode coverage.

'use client';

import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type ChangeEvent,
  type DragEvent,
  useEffect,
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
  /**
   * Sprint 23b Phase 6.2 — the File object is forwarded alongside the
   * parsed UploadResult so the parent can build a Blob URL for the
   * PDF viewer without re-reading `<input>.files`. The earlier DOM-
   * sniff pattern only worked for the click-to-upload path and broke
   * silently on drag-drop (the dropzone bypasses the <input> element).
   */
  onUploaded: (result: UploadResult, file: File) => void;
  onError?: (message: string) => void;
  conversationId?: string | null;
  /**
   * Sprint 29.x — `hero` softens idle chrome on Mode A so the tray
   * blends with the ambient blob instead of stacking a heavy card on
   * top. Default `tray` keeps the document-dock treatment everywhere
   * else (workspace shell, re-upload paths).
   */
  presentation?: 'tray' | 'hero';
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
  presentation = 'tray',
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
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

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
      onUploaded(ok, file);
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

  const isHero = presentation === 'hero';

  // Sprint 15 Phase 7 — dragover takes a solid accent border (drops the
  // dashed treatment); idle keeps dashed. Other states keep a solid edge.
  // Sprint 29.x — hero idle uses a lighter hairline + translucent fill so
  // the tray reads as part of the ambient landing field, not a second card.
  const borderStyle = isDragOver
    ? 'border-2 border-solid border-accent-400 bg-accent-50/60 ring-2 ring-accent-100 dark:border-accent-400 dark:bg-accent-500/10 dark:ring-accent-500/15'
    : isUploading
      ? 'border-2 border-solid border-accent-200 bg-accent-50/30 dark:border-accent-500/40 dark:bg-accent-500/5'
      : isError
        ? 'border-2 border-solid border-danger-100 bg-danger-100/40 dark:border-danger-600/40 dark:bg-danger-600/5'
        : isSuccess
          ? 'border-2 border-solid border-success-100 bg-success-100/40 dark:border-success-600/40 dark:bg-success-600/5'
          : isHero
            ? 'border border-dashed border-border-default/70 bg-surface-elevated/50 shadow-hairline backdrop-blur-[3px] motion-safe:[@media(hover:hover)]:hover:shadow-md hover:border-accent-300/70 hover:bg-surface-elevated/65 dark:border-border-default/50 dark:bg-surface-elevated/20 dark:motion-safe:[@media(hover:hover)]:hover:shadow-md dark:hover:border-accent-500/30 dark:hover:bg-surface-elevated/28'
            : 'border-2 border-dashed border-neutral-200 bg-surface-card hover:border-accent-300 hover:bg-surface-muted dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-accent-500/40 dark:hover:bg-neutral-800/60';

  const iconWrapperClass = classNames(
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
    isDragOver &&
      'bg-accent-100 text-accent-600 dark:bg-accent-500/25 dark:text-accent-200',
    isUploading &&
      'bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300',
    isError &&
      'bg-danger-100/60 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100',
    isSuccess &&
      'bg-success-100/60 text-success-600 dark:bg-success-600/15 dark:text-success-100',
    !isDragOver &&
      !isUploading &&
      !isError &&
      !isSuccess &&
      (isHero
        ? 'bg-surface-elevated/70 text-fg-muted group-hover:bg-accent-50/80 group-hover:text-accent-500 dark:bg-surface-elevated/40 dark:text-fg-subtle dark:group-hover:bg-accent-500/15 dark:group-hover:text-accent-300'
        : 'bg-neutral-100 text-fg-subtle group-hover:bg-accent-50 group-hover:text-accent-500 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:bg-accent-500/15 dark:group-hover:text-accent-300'),
  );

  const iconNode = isUploading ? (
    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
  ) : isError ? (
    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
  ) : isSuccess ? (
    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
  ) : (
    <FileUp className="h-6 w-6" aria-hidden="true" />
  );

  return (
    <section
      data-testid="lease-upload-dropzone"
      data-status={status}
      data-presentation={presentation}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label="Lease PDF upload area"
      className={classNames(
        'group relative flex w-full flex-1 flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl p-6 text-center transition-all duration-200',
        isHero && 'min-h-[13.5rem] sm:min-h-[15rem]',
        borderStyle,
      )}
    >
      {/* Status icon — pulses once when dragover begins. Reduced-motion
          renders a plain div with the same styles. */}
      {animate ? (
        <motion.div
          data-testid="lease-upload-icon"
          className={iconWrapperClass}
          // re-mount the animation each time isDragOver flips on
          key={isDragOver ? 'over' : 'rest'}
          animate={isDragOver ? { scale: [1, 1.08, 1] } : { scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {iconNode}
        </motion.div>
      ) : (
        <div data-testid="lease-upload-icon" className={iconWrapperClass}>
          {iconNode}
        </div>
      )}

      {/* Headline + subtext */}
      <div className="space-y-1">
        <p className="text-[15px] font-semibold tracking-tight text-fg-default">
          {isDragOver
            ? 'Drop to scan'
            : isUploading
              ? 'Parsing your lease…'
              : isError
                ? 'Upload failed'
                : isSuccess
                  ? 'Lease ready'
                  : 'Drop your NJ residential lease'}
        </p>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-fg-muted">
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
            'cursor-pointer rounded-md border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            isError
              ? 'border-danger-100 bg-surface-card text-danger-600 hover:border-danger-100/80 hover:bg-danger-100/40 focus-visible:ring-danger-100 dark:border-danger-600/40 dark:bg-neutral-900 dark:text-danger-100 dark:hover:bg-danger-600/15'
              : isHero
                ? 'border-border-hairline bg-surface-elevated/60 text-fg-default hover:border-accent-300/60 hover:bg-surface-elevated/80 focus-visible:ring-accent-300 dark:border-border-default/60 dark:bg-surface-elevated/30 dark:hover:border-accent-500/35 dark:hover:bg-surface-elevated/45'
                : 'border-neutral-200 bg-surface-card text-fg-default hover:border-neutral-300 hover:bg-surface-muted focus-visible:ring-accent-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800',
          )}
        >
          {isError ? 'Try another file' : 'Choose a file'}
        </label>
      ) : null}

      {/*
        Hints — idle state only. Sprint 17 §5.2 added privacy + legal
        disclaimer lines so a tenant pausing before uploading a real
        document sees what LeaseLens does (and doesn't) do. Sprint 23b
        Phase 1 collapsed the three-line stack into one footnote so the
        dropzone reads as a document tray, not a landing-page hero.
      */}
      {status === 'idle' ? (
        <p className="text-[11px] leading-tight text-fg-subtle">
          PDF up to 10 MB · text-layer required · informational analysis only,
          not legal advice
        </p>
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
