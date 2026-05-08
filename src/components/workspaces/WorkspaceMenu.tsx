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
import type { Workspace } from '@/lib/workspaces/types';
import { BrandUploadModal } from './BrandUploadModal';

export interface WorkspaceMenuProps {
  workspaceName: string;
  isSample: boolean;
  /**
   * Visitor's previously-uploaded brands, excluding the active workspace
   * and the sample. Resolved server-side from the workspace cookie's
   * created_workspace_ids list, then filtered for non-expired rows.
   */
  otherBrands: Workspace[];
}

export function WorkspaceMenu({
  workspaceName,
  isSample,
  otherBrands,
}: WorkspaceMenuProps) {
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

  async function selectBrand(workspaceId: string) {
    setIsSwitching(true);
    setError(null);
    try {
      const res = await fetch('/api/workspaces/select', {
        method: 'POST',
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      if (!res.ok) {
        setError('Could not switch brand. Try again.');
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
        className="flex items-center gap-1.5 rounded-md px-1 text-sm text-fg-muted transition-colors hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
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
          className="absolute left-0 top-full z-40 mt-2 w-72 rounded-lg border border-neutral-200 bg-surface-card p-3 shadow-lift dark:border-neutral-800 dark:bg-neutral-900"
        >
          <p className="px-2 pb-2 text-xs uppercase tracking-wider text-fg-subtle">
            Active brand
          </p>
          <p className="px-2 pb-3 text-sm font-semibold text-fg-default">
            {workspaceName}
          </p>
          {otherBrands.length > 0 && (
            <div className="border-t border-neutral-100 pt-2 pb-1 dark:border-neutral-800">
              <p className="px-2 pb-1 text-xs uppercase tracking-wider text-fg-subtle">
                Your brands
              </p>
              {otherBrands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  role="menuitem"
                  onClick={() => selectBrand(brand.id)}
                  disabled={isSwitching}
                  className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-fg-default transition-colors hover:bg-surface-muted disabled:cursor-default disabled:opacity-50 dark:hover:bg-neutral-800"
                >
                  {brand.name}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-neutral-100 pt-2 dark:border-neutral-800">
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
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-fg-default transition-colors hover:bg-surface-muted disabled:cursor-default disabled:opacity-50 dark:hover:bg-neutral-800"
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
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-fg-default transition-colors hover:bg-surface-muted dark:hover:bg-neutral-800"
            >
              Start a new brand…
            </button>
          </div>
          {error && (
            <p className="mt-2 px-2 text-xs text-danger-600 dark:text-danger-100">
              {error}
            </p>
          )}
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
