'use client';

/**
 * Sprint 11 (revised) — drop zone wrapping the chat surface. Filters
 * dropped files to .md, max 5, max 100KB each (matches server-side
 * validation in src/lib/workspaces/ingest-upload.ts). Calls onFiles
 * with the accepted list. Non-md drops are silently ignored so
 * accidental drag-overs of unrelated files don't pop a modal.
 */

import { type ReactNode, useState } from 'react';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 100_000;

export interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

function isMarkdown(file: File): boolean {
  return (
    /\.md$/i.test(file.name) ||
    file.type === 'text/markdown' ||
    file.type === 'text/plain'
  );
}

export function FileDropZone({ onFiles, children }: FileDropZoneProps) {
  const [isOver, setIsOver] = useState(false);

  return (
    // The drop zone wraps the chat surface. Keyboard users use the
    // AttachButton paperclip in the composer, which opens the OS file
    // picker — so this drop target is a pointer-only enhancement.
    // biome-ignore lint/a11y/noStaticElementInteractions: AttachButton provides the keyboard-accessible path
    <div
      data-testid="file-drop-zone"
      className={`relative h-full ${
        isOver ? 'ring-2 ring-indigo-300 ring-offset-2' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const dropped = Array.from(e.dataTransfer.files);
        const accepted = dropped
          .filter(isMarkdown)
          .filter((f) => f.size <= MAX_FILE_BYTES)
          .slice(0, MAX_FILES);
        if (accepted.length === 0) return;
        onFiles(accepted);
      }}
    >
      {children}
      {isOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-indigo-50/60">
          <p className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm">
            Drop .md files to start a brand
          </p>
        </div>
      )}
    </div>
  );
}
