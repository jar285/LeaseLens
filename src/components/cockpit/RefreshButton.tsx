'use client';

import { RefreshCw } from 'lucide-react';

export interface RefreshButtonProps {
  isRefreshing: boolean;
  onClick: () => void;
}

export function RefreshButton({ isRefreshing, onClick }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRefreshing}
      aria-label="Refresh panel"
      className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
      />
    </button>
  );
}
