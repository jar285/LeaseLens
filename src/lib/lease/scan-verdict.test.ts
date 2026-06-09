import { describe, expect, it } from 'vitest';
import type { GradingResult } from '@/components/lease/grading';
import { computeScanVerdict } from './scan-verdict';

// Sprint 33.B — verdict-headline helper. Pure function. Lives in
// src/lib/lease/ so both the right pane (RedFlagReport) and the FAB
// chat's deterministic scan-complete receipt can reuse it without
// importing component-tree machinery.
//
// Contract:
//   - Picks the highest severity tier present in `gradings`.
//   - Picks the top-1 clause from that tier (lexicographic-stable
//     by clause_index, then by clause_id) so re-runs produce
//     identical strings.
//   - Returns a tier-specific headline.
//   - `idle` tier when no gradings (or all errored — caller passes
//     ungradedCount; the helper does NOT receive errored events
//     directly, only the valid gradings + the ungraded count).

function makeGrading(overrides: Partial<GradingResult>): GradingResult {
  return {
    clause_id: 'c-default',
    severity: 'ok',
    statute_citation: 'NJSA 46:8-19',
    chunk_id: 'chunk-1',
    reasoning: 'Reasoning text.',
    recommended_action: 'Action.',
    clause_type: 'unknown',
    clause_index: 0,
    page_number: 1,
    ...overrides,
  };
}

describe('computeScanVerdict', () => {
  it('returns idle tier and empty headline when no gradings and no ungraded', () => {
    const v = computeScanVerdict([], 0);
    expect(v.tier).toBe('idle');
    expect(v.headline).toBe('');
    expect(v.topClauseTitle).toBeNull();
  });

  it('returns idle when all gradings errored (zero valid gradings, ungraded > 0)', () => {
    const v = computeScanVerdict([], 4);
    expect(v.tier).toBe('idle');
    expect(v.headline).toBe('');
    expect(v.topClauseTitle).toBeNull();
  });

  it('returns ok tier with "balanced" headline when all gradings are ok', () => {
    const v = computeScanVerdict(
      [
        makeGrading({ clause_id: 'c1', severity: 'ok', clause_index: 0 }),
        makeGrading({ clause_id: 'c2', severity: 'ok', clause_index: 1 }),
      ],
      0,
    );
    expect(v.tier).toBe('ok');
    expect(v.headline).toContain('balanced');
    expect(v.headline).toContain('no high-severity');
    expect(v.topClauseTitle).toBeNull();
  });

  it('returns low tier headline when low is the highest tier', () => {
    const v = computeScanVerdict(
      [
        makeGrading({
          clause_id: 'c1',
          severity: 'low',
          clause_type: 'indemnification',
          clause_index: 10,
        }),
        makeGrading({ clause_id: 'c2', severity: 'ok', clause_index: 0 }),
      ],
      0,
    );
    expect(v.tier).toBe('low');
    expect(v.headline).toContain('Low risk');
    // Low tier reports a count of low findings (1), not findings overall.
    expect(v.headline).toContain('1 finding');
  });

  it('returns medium tier headline with top-clause callout', () => {
    const v = computeScanVerdict(
      [
        makeGrading({
          clause_id: 'c1',
          severity: 'medium',
          clause_type: 'security_deposit',
          clause_index: 3,
        }),
        makeGrading({ clause_id: 'c2', severity: 'ok', clause_index: 0 }),
      ],
      0,
    );
    expect(v.tier).toBe('medium');
    expect(v.headline).toContain('Medium risk');
    expect(v.headline).toContain('Security deposit · §4');
    expect(v.topClauseTitle).toBe('Security deposit · §4');
  });

  it('returns high tier headline with top-clause callout when high is present', () => {
    const v = computeScanVerdict(
      [
        makeGrading({
          clause_id: 'c1',
          severity: 'high',
          clause_type: 'indemnification',
          clause_index: 10,
        }),
        makeGrading({
          clause_id: 'c2',
          severity: 'medium',
          clause_type: 'security_deposit',
          clause_index: 3,
        }),
        makeGrading({ clause_id: 'c3', severity: 'ok', clause_index: 0 }),
      ],
      0,
    );
    expect(v.tier).toBe('high');
    expect(v.headline).toContain('High risk');
    // 1 high-severity finding in this fixture.
    expect(v.headline).toContain('1 finding');
    expect(v.headline).toContain('Indemnification · §11');
    expect(v.topClauseTitle).toBe('Indemnification · §11');
  });

  it('picks the smallest clause_index for the top-clause tiebreaker (deterministic)', () => {
    const v = computeScanVerdict(
      [
        makeGrading({
          clause_id: 'c1',
          severity: 'high',
          clause_type: 'late_fee',
          clause_index: 2,
        }),
        makeGrading({
          clause_id: 'c2',
          severity: 'high',
          clause_type: 'indemnification',
          clause_index: 10,
        }),
      ],
      0,
    );
    expect(v.topClauseTitle).toBe('Late fee · §3');
  });

  it('counts only same-tier findings in the "N findings" headline (high counts only high)', () => {
    const v = computeScanVerdict(
      [
        makeGrading({
          clause_id: 'c1',
          severity: 'high',
          clause_type: 'late_fee',
          clause_index: 2,
        }),
        makeGrading({
          clause_id: 'c2',
          severity: 'high',
          clause_type: 'indemnification',
          clause_index: 10,
        }),
        makeGrading({
          clause_id: 'c3',
          severity: 'medium',
          clause_type: 'security_deposit',
          clause_index: 3,
        }),
        makeGrading({ clause_id: 'c4', severity: 'ok', clause_index: 0 }),
      ],
      0,
    );
    expect(v.tier).toBe('high');
    expect(v.headline).toContain('2 findings');
  });
});
