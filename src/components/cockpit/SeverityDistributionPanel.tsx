'use client';

import { useState } from 'react';
import { refreshSeverityDistribution } from '@/app/cockpit/actions';
import { SEVERITY_BAR } from '@/components/lease/grading';
import { SeverityBadge } from '@/components/lease/SeverityBadge';
import type { SeverityDistribution } from '@/lib/cockpit/types';
import { CockpitPanel } from './CockpitPanel';

export interface SeverityDistributionPanelProps {
  initialDistribution: SeverityDistribution;
}

const SEVERITIES = ['high', 'medium', 'low', 'ok'] as const;
type SeverityKey = (typeof SEVERITIES)[number];

/**
 * Sprint 24 — severity-distribution KPI. Answers "across all leases
 * scanned, what's the shape of risk?" — Tier-1 KPI #3 from the
 * brainstorm. Four rows, one per severity, with the SeverityBadge
 * primitive carrying the triple-channel signal (icon + label + colour)
 * and a CSS-only horizontal bar at `width = count / max * 100%`.
 *
 * Bars are normalised against the largest bucket (not against `total`)
 * so even an OK-only workspace shows a full-width OK bar and the
 * relative magnitude across non-zero buckets stays readable.
 */
export function SeverityDistributionPanel({
  initialDistribution,
}: SeverityDistributionPanelProps) {
  const [dist, setDist] = useState<SeverityDistribution>(initialDistribution);

  async function handleRefresh() {
    const { distribution } = await refreshSeverityDistribution();
    setDist(distribution);
  }

  const maxCount = Math.max(dist.high, dist.medium, dist.low, dist.ok, 1);
  const counts: Record<SeverityKey, number> = {
    high: dist.high,
    medium: dist.medium,
    low: dist.low,
    ok: dist.ok,
  };

  return (
    <CockpitPanel
      testId="severity-distribution-panel"
      title="Severity distribution"
      subtitle={
        <>
          All clauses graded · total{' '}
          <span className="tabular">{dist.total}</span>
        </>
      }
      onRefresh={handleRefresh}
    >
      {dist.total === 0 ? (
        <div className="px-4 py-6 text-xs text-fg-muted">
          No clauses graded yet — run a scan to populate the distribution.
        </div>
      ) : (
        <ul className="m-0 list-none space-y-2 p-4">
          {SEVERITIES.map((sev) => {
            const count = counts[sev];
            const widthPct = (count / maxCount) * 100;
            return (
              <li
                key={sev}
                data-testid={`severity-row-${sev}`}
                data-severity={sev}
                className="flex items-center gap-3 text-xs"
              >
                <div className="w-16 shrink-0">
                  <SeverityBadge severity={sev} size="sm" />
                </div>
                <div className="relative min-w-0 flex-1">
                  <div
                    aria-hidden="true"
                    className={`h-2 rounded-full ${SEVERITY_BAR[sev]} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <div className="w-10 shrink-0 text-right tabular font-semibold text-fg-default">
                  {count}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CockpitPanel>
  );
}
