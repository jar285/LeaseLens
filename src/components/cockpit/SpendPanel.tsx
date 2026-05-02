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
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Spend ({snapshot.date})
        </h2>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 text-center sm:grid-cols-3">
        <div>
          <div className="text-xs text-gray-500">Tokens in</div>
          <div className="mt-1 text-lg font-semibold text-gray-800">
            {snapshot.tokens_in}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Tokens out</div>
          <div className="mt-1 text-lg font-semibold text-gray-800">
            {snapshot.tokens_out}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Estimated</div>
          <div className="mt-1 text-lg font-semibold text-gray-800">
            ≈ ${snapshot.estimated_dollars.toFixed(4)}
          </div>
        </div>
      </div>
    </section>
  );
}
