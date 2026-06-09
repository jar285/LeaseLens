/*
 * Sprint 33.B — synthesized verdict headline.
 *
 * Pure function consumed by RedFlagReport (right pane) and the FAB chat's
 * deterministic scan-complete receipt. Lives outside the component tree
 * so both surfaces stay in lockstep without re-importing component
 * helpers or duplicating the tier-decision logic.
 *
 * Contract:
 *   - Picks the highest severity tier present in `gradings`.
 *   - Picks the top-1 clause from that tier via the smallest
 *     clause_index (stable, deterministic; re-runs produce identical
 *     strings).
 *   - Returns a tier-specific headline that compensates for the cards
 *     being a list, not a verdict (per Sprint 33 brainstorm Appendix
 *     meta-concern 2 from the user review — "a good summary answers
 *     'is this lease bad, and what do I worry about first'").
 *   - Receives only valid gradings; ungradedCount is captured for
 *     future "all errored" idle-handling (not currently used in the
 *     headline copy — the RedFlagReport renders a separate ungraded
 *     line per Sprint 33.B3).
 */

import {
  clauseLabel,
  type GradingResult,
  SEVERITY_ORDER,
  type Severity,
} from '@/components/lease/grading';

export type VerdictTier = Severity | 'idle';

export interface ScanVerdict {
  tier: VerdictTier;
  headline: string;
  topClauseTitle: string | null;
}

const EMPTY_VERDICT: ScanVerdict = {
  tier: 'idle',
  headline: '',
  topClauseTitle: null,
};

function highestPresentTier(
  gradings: readonly GradingResult[],
): Severity | null {
  for (const tier of SEVERITY_ORDER) {
    if (gradings.some((g) => g.severity === tier)) return tier;
  }
  return null;
}

function pluralizeFindings(n: number): string {
  return n === 1 ? '1 finding' : `${n} findings`;
}

export function computeScanVerdict(
  gradings: readonly GradingResult[],
  _ungradedCount: number,
): ScanVerdict {
  if (gradings.length === 0) return EMPTY_VERDICT;

  const tier = highestPresentTier(gradings);
  if (tier === null) return EMPTY_VERDICT;

  if (tier === 'ok') {
    return {
      tier: 'ok',
      headline: 'Lease is balanced — no high-severity issues found.',
      topClauseTitle: null,
    };
  }

  const inTier = gradings
    .filter((g) => g.severity === tier)
    .slice()
    .sort((a, b) => {
      const ai = typeof a.clause_index === 'number' ? a.clause_index : 999;
      const bi = typeof b.clause_index === 'number' ? b.clause_index : 999;
      if (ai !== bi) return ai - bi;
      return a.clause_id.localeCompare(b.clause_id);
    });
  const topClauseTitle = clauseLabel(inTier[0]);
  const count = pluralizeFindings(inTier.length);

  if (tier === 'low') {
    return {
      tier: 'low',
      headline: `Low risk — ${count} reviewed.`,
      topClauseTitle,
    };
  }

  const tierLabel = tier === 'high' ? 'High risk' : 'Medium risk';
  return {
    tier,
    headline: `${tierLabel} — ${count}, biggest concern is ${topClauseTitle}.`,
    topClauseTitle,
  };
}
