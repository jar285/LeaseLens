'use client';

import { useState } from 'react';
import { refreshEvalHealth } from '@/app/cockpit/actions';
import type { EvalHealthSnapshot } from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface EvalHealthPanelProps {
  initialSnapshot: EvalHealthSnapshot | null;
}

function formatRelative(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function EvalHealthPanel({ initialSnapshot }: EvalHealthPanelProps) {
  const [snapshot, setSnapshot] = useState<EvalHealthSnapshot | null>(
    initialSnapshot,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const { snapshot: next } = await refreshEvalHealth();
      setSnapshot(next);
    } finally {
      setIsRefreshing(false);
    }
  }

  const allPassed =
    snapshot !== null && snapshot.passedCount === snapshot.totalCases;
  const badgeClass = allPassed
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700';

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">
            Is retrieval grounded?
          </h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Golden eval against the sample brand
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>
      {snapshot === null ? (
        <div className="px-4 py-6 text-xs text-gray-500">
          No eval runs recorded yet — run <code>npm run eval:golden</code>.
        </div>
      ) : (
        <div className="px-4 py-4">
          <div
            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${badgeClass}`}
          >
            {snapshot.passedCount} / {snapshot.totalCases} passed
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {snapshot.totalScore.toFixed(1)} / {snapshot.maxScore.toFixed(1)}{' '}
            points · {formatRelative(snapshot.lastRunAt)}
          </p>
        </div>
      )}
    </section>
  );
}
