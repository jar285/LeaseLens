'use client';

import { useState } from 'react';
import { refreshSpend } from '@/app/cockpit/actions';
import type { SpendSnapshot } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

export interface SpendPanelProps {
  initialSnapshot: SpendSnapshot;
}

export function SpendPanel({ initialSnapshot }: SpendPanelProps) {
  const [snapshot, setSnapshot] = useState<SpendSnapshot>(initialSnapshot);

  // Sprint 24 — refresh state moved into CockpitPanel; this handler just
  // fetches the new snapshot. The shell toggles `isRefreshing` around the
  // await automatically.
  async function handleRefresh() {
    const { spend } = await refreshSpend();
    setSnapshot(spend);
  }

  return (
    <CockpitPanel
      testId="spend-panel"
      title="Today's spend"
      subtitle={
        <>
          <span className="tabular">{snapshot.date}</span>
          <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] tracking-wider text-fg-muted uppercase dark:bg-neutral-800">
            Global · all workspaces
          </span>
        </>
      }
      onRefresh={handleRefresh}
    >
      <div className="grid grid-cols-1 gap-4 px-4 py-4 text-center sm:grid-cols-3">
        <div>
          <div className="text-xs text-fg-muted">Tokens in</div>
          <div className="mt-1 tabular font-semibold text-fg-default text-lg">
            {snapshot.tokens_in}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Tokens out</div>
          <div className="mt-1 tabular font-semibold text-fg-default text-lg">
            {snapshot.tokens_out}
          </div>
        </div>
        <div>
          <div className="text-xs text-fg-muted">Estimated</div>
          <div className="mt-1 tabular font-semibold text-fg-default text-lg">
            ≈ ${snapshot.estimated_dollars.toFixed(4)}
          </div>
        </div>
      </div>
    </CockpitPanel>
  );
}
