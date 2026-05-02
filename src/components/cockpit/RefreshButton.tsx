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
      className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 disabled:opacity-40"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
      />
    </button>
  );
}
