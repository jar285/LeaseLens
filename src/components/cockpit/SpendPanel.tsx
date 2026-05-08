'use client';

import { useState } from 'react';
import { refreshSpend } from '@/app/cockpit/actions';
import type { SpendSnapshot } from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface SpendPanelProps {
  initialSnapshot: SpendSnapshot;
}

export function SpendPanel({ initialSnapshot }: SpendPanelProps) {
  const [snapshot, setSnapshot] = useState<SpendSnapshot>(initialSnapshot);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const { spend } = await refreshSpend();
      setSnapshot(spend);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-fg-default">
            Today&rsquo;s spend
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
            <span className="tabular">{snapshot.date}</span>
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-muted dark:bg-neutral-800">
              Global · all workspaces
            </span>
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 text-center sm:grid-cols-3">
        <div>
          <div className="text-xs text-fg-muted">Tokens in</div>
          <div className="mt-1 text-lg font-semibold tabular text-fg-default">
            {snapshot.tokens_in}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Tokens out</div>
          <div className="mt-1 text-lg font-semibold tabular text-fg-default">
            {snapshot.tokens_out}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Estimated</div>
          <div className="mt-1 text-lg font-semibold tabular text-fg-default">
            ≈ ${snapshot.estimated_dollars.toFixed(4)}
          </div>
        </div>
      </div>
    </section>
  );
}
