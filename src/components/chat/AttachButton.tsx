'use client';

/**
 * Sprint 11 (revised) — accessibility-first companion to FileDropZone.
 * Renders a paperclip button next to the send affordance; clicking it
 * opens the OS file picker. Drag-and-drop alone fails keyboard-only
 * users and most touch devices, so this button is the canonical path.
 */

import { Paperclip } from 'lucide-react';
import { useRef } from 'react';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 100_000;

export interface AttachButtonProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

function isMarkdown(file: File): boolean {
  return (
    /\.md$/i.test(file.name) ||
    file.type === 'text/markdown' ||
    file.type === 'text/plain'
  );
}

export function AttachButton({ onFiles, disabled }: AttachButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        className="hidden"
        data-testid="attach-button-input"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          const accepted = picked
            .filter(isMarkdown)
            .filter((f) => f.size <= MAX_FILE_BYTES)
            .slice(0, MAX_FILES);
          if (accepted.length > 0) onFiles(accepted);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-label="Attach brand files"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 disabled:opacity-35"
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
      </button>
    </>
  );
}
