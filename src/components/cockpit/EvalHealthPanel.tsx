// Sprint 14 / Phase 12 — two-tier eval display.
//
// Tier 1 (retrieval): the existing pass/fail badge + score over the
// 12 NJ tenant-law golden cases. Cheap to run, gates Tier 1 regression
// in CI on every PR.
//
// Tier 2 (lease grading): precision / recall / F1 / groundedness +
// latency p50-p95 over the 12 lease-grading cases. Real Anthropic call
// per case; operator-triggered locally via `npm run eval:leases`.

'use client';

import { useState } from 'react';
import { refreshEvalHealth } from '@/app/cockpit/actions';
import type {
  EvalHealthSnapshot,
  LeaseGradingSnapshot,
} from '@/lib/cockpit/types';
import { RefreshButton } from './RefreshButton';

export interface EvalHealthPanelProps {
  initialSnapshot: EvalHealthSnapshot | null;
  initialLeaseGradingSnapshot: LeaseGradingSnapshot | null;
}

function formatRelative(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function EvalHealthPanel({
  initialSnapshot,
  initialLeaseGradingSnapshot,
}: EvalHealthPanelProps) {
  const [snapshot, setSnapshot] = useState<EvalHealthSnapshot | null>(
    initialSnapshot,
  );
  const [leaseGrading, setLeaseGrading] = useState<LeaseGradingSnapshot | null>(
    initialLeaseGradingSnapshot,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    try {
      const next = await refreshEvalHealth();
      setSnapshot(next.snapshot);
      setLeaseGrading(next.leaseGrading);
    } finally {
      setIsRefreshing(false);
    }
  }

  const allPassed =
    snapshot !== null && snapshot.passedCount === snapshot.totalCases;
  const tier1BadgeClass = allPassed
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700';

  return (
    <section
      data-testid="eval-health-panel"
      className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Eval health</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Tier 1 retrieval · Tier 2 lease grading
          </p>
        </div>
        <RefreshButton isRefreshing={isRefreshing} onClick={refresh} />
      </header>

      {/* Tier 1: retrieval golden eval */}
      <div
        data-testid="eval-tier1"
        className="border-b border-gray-100 px-4 py-4"
      >
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Tier 1 · Retrieval
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Golden eval against NJ tenant-law corpus
            </p>
          </div>
        </div>
        {snapshot === null ? (
          <p className="mt-2 text-xs text-gray-500">
            No eval runs recorded yet — run <code>npm run eval:golden</code>.
          </p>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-3">
              <div
                className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${tier1BadgeClass}`}
              >
                {snapshot.passedCount} / {snapshot.totalCases} passed
              </div>
              <span className="text-xs text-gray-600">
                {snapshot.totalScore.toFixed(1)} /{' '}
                {snapshot.maxScore.toFixed(1)} pts
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              {formatRelative(snapshot.lastRunAt)}
            </p>
          </>
        )}
      </div>

      {/* Tier 2: lease-grading eval */}
      <div data-testid="eval-tier2" className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Tier 2 · Lease grading
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Sample lease graded against NJ statutes
            </p>
          </div>
        </div>
        {leaseGrading === null ? (
          <p className="mt-2 text-xs text-gray-500">
            No Tier 2 runs yet — run <code>npm run eval:leases</code> (real
            Anthropic; ~$0.10–0.50 per run).
          </p>
        ) : (
          <>
            <div
              data-testid="eval-tier2-metrics"
              className="mt-2 grid grid-cols-3 gap-2"
            >
              <Metric label="Precision" value={pct(leaseGrading.precision)} />
              <Metric label="Recall" value={pct(leaseGrading.recall)} />
              <Metric label="F1" value={pct(leaseGrading.f1)} />
              <Metric
                label="Groundedness"
                value={pct(leaseGrading.groundedness)}
              />
              <Metric
                label="Statute hit"
                value={pct(leaseGrading.statuteHitRate)}
              />
              <Metric
                label="Exact match"
                value={pct(leaseGrading.exactMatch)}
              />
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              {leaseGrading.totalCases} cases · p50{' '}
              {leaseGrading.latencyP50Ms.toFixed(0)}ms · p95{' '}
              {leaseGrading.latencyP95Ms.toFixed(0)}ms ·{' '}
              {formatRelative(leaseGrading.lastRunAt)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 bg-gray-50/60 px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}
