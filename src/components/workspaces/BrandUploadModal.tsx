'use client';

/**
 * Sprint 11 (revised) — modal that hosts the brand-upload form. Two
 * call sites:
 *   1. WorkspaceMenu's "Start a new brand" entry — opened with no files.
 *   2. The chat surface's FileDropZone / AttachButton — opened with
 *      prefilledFiles already chosen by the user; the file input is
 *      hidden and the selected names are shown read-only.
 *
 * Submits multipart/form-data to POST /api/workspaces, identical to the
 * pre-revision UploadForm. On 200, calls onSuccess (which typically
 * closes the modal and refreshes the route).
 */

import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MAX_FILE_BYTES = 100_000;
const MAX_FILES = 5;
const MAX_NAME = 80;
const MAX_DESC = 280;

export interface BrandUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledFiles?: File[];
}

interface FieldErrors {
  name?: string;
  description?: string;
  files?: string;
  general?: string;
}

export function BrandUploadModal({
  open,
  onClose,
  onSuccess,
  prefilledFiles,
}: BrandUploadModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveFiles = prefilledFiles ?? files;
  const hasPrefilled = (prefilledFiles?.length ?? 0) > 0;

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setFiles([]);
      setErrors({});
      setIsSubmitting(false);
      setIsDragging(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!name.trim() || name.trim().length > MAX_NAME) {
      e.name = `Brand name must be 1-${MAX_NAME} characters.`;
    }
    if (!description.trim() || description.trim().length > MAX_DESC) {
      e.description = `Description must be 1-${MAX_DESC} characters.`;
    }
    if (effectiveFiles.length === 0 || effectiveFiles.length > MAX_FILES) {
      e.files = `Upload 1-${MAX_FILES} markdown files.`;
    } else {
      for (const f of effectiveFiles) {
        if (f.size > MAX_FILE_BYTES) {
          e.files = `${f.name} exceeds ${MAX_FILE_BYTES / 1000}KB.`;
          break;
        }
        if (
          !/\.md$/i.test(f.name) &&
          f.type !== 'text/markdown' &&
          f.type !== 'text/plain'
        ) {
          e.files = `${f.name} is not a markdown file.`;
          break;
        }
      }
    }
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('description', description.trim());
      for (const f of effectiveFiles) fd.append('files', f);
      const res = await fetch('/api/workspaces', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          field?: string;
        };
        const message = body.error ?? 'Upload failed.';
        setErrors(
          body.field ? { [body.field]: message } : { general: message },
        );
        return;
      }
      onSuccess();
    } catch {
      setErrors({ general: 'Upload failed. Network error?' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    // Backdrop click closes the dialog. Keyboard users close via Escape
    // (handled in the useEffect above), so the rule's keyboard-equivalent
    // requirement is satisfied at the component level.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape key closes via keydown listener
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-upload-modal-title"
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={(e) => {
        if (e.target === dialogRef.current && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2
          id="brand-upload-modal-title"
          className="text-lg font-semibold text-gray-800"
        >
          Start a new brand
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Markdown files describing your brand identity and audience. Up to{' '}
          {MAX_FILES} files, {MAX_FILE_BYTES / 1000}KB each.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="brand-name"
              className="block text-xs font-medium text-gray-700"
            >
              Brand name
            </label>
            <input
              id="brand-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="brand-description"
              className="block text-xs font-medium text-gray-700"
            >
              Description ({description.length}/{MAX_DESC})
            </label>
            <textarea
              id="brand-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_DESC}
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description}</p>
            )}
          </div>
          <div>
            {hasPrefilled ? (
              <>
                <p className="block text-xs font-medium text-gray-700">
                  Selected files ({effectiveFiles.length})
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                  {effectiveFiles.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <label
                  htmlFor="brand-files"
                  className="block text-xs font-medium text-gray-700"
                >
                  Brand documents (.md, ≤ {MAX_FILE_BYTES / 1000}KB each, max{' '}
                  {MAX_FILES})
                </label>
                {/* Visual drop-zone: click triggers the hidden input below;
                    drag-and-drop populates files directly. The input is
                    label-associated via id so screen-readers and tests can
                    still find it by `Brand documents`. */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: the hidden <input type="file"> is keyboard-focusable via the label association above and acts as the accessible primary control */}
                <div
                  data-testid="brand-files-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const dropped = Array.from(e.dataTransfer.files);
                    if (dropped.length > 0) setFiles(dropped);
                  }}
                  className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-5 text-center text-xs transition-colors ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {files.length > 0
                      ? `${files.length} file${files.length === 1 ? '' : 's'} selected`
                      : 'Drag .md files here, or click to choose'}
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  id="brand-files"
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="sr-only"
                />
                {files.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                    {files.map((f) => (
                      <li key={f.name}>{f.name}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {errors.files && (
              <p className="mt-1 text-xs text-red-600">{errors.files}</p>
            )}
          </div>
          {errors.general && (
            <p className="text-xs text-red-600">{errors.general}</p>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating workspace…' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
