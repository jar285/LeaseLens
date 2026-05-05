'use client';

/**
 * Sprint 11 (revised) — popover menu surfaced from the workspace label
 * in the header. Replaces the standalone /onboarding route. Three
 * actions: see the active workspace name, switch back to the sample
 * brand, or open BrandUploadModal to start a new one.
 */

import { Edit2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandUploadModal } from './BrandUploadModal';

export interface WorkspaceMenuProps {
  workspaceName: string;
  isSample: boolean;
}

export function WorkspaceMenu({ workspaceName, isSample }: WorkspaceMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function selectSample() {
    setIsSwitching(true);
    setError(null);
    try {
      const res = await fetch('/api/workspaces/select-sample', {
        method: 'POST',
      });
      if (!res.ok) {
        setError('Could not load sample brand. Try again.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1 text-sm text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>· {workspaceName}</span>
        <Edit2 className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Switch workspace</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Workspace menu"
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
        >
          <p className="px-2 pb-2 text-xs uppercase tracking-wider text-gray-400">
            Active brand
          </p>
          <p className="px-2 pb-3 text-sm font-semibold text-gray-800">
            {workspaceName}
          </p>
          <div className="border-t border-gray-100 pt-2">
            {/* Round 4 — when the active workspace IS the sample, the popover
                header above ("Active brand: …") already conveys it; a
                disabled "Sample brand (active)" menu item would be redundant.
                Hide it; only "Start a new brand…" stays. */}
            {!isSample && (
              <button
                type="button"
                role="menuitem"
                onClick={selectSample}
                disabled={isSwitching}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-default disabled:opacity-50"
              >
                {isSwitching ? 'Loading sample…' : 'Use sample brand'}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setShowUpload(true);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              Start a new brand…
            </button>
          </div>
          {error && <p className="mt-2 px-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
      <BrandUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          setShowUpload(false);
          router.refresh();
        }}
      />
    </div>
  );
}
