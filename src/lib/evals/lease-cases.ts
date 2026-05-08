// Sprint 14 / Phase 11 — Tier 2 lease-grading evaluation cases.
//
// 12 labeled cases referencing clauses from the seeded sample lease
// (`src/corpus/sample-lease/sample-nj-residential-lease.pdf`, ingested
// at SAMPLE_LEASE_ID by `src/db/seed.ts`). Each case names the clause
// by its 0-based `clause_index` (matches the `clauses` table after
// seed) and labels the ground-truth severity + the statute citation
// the model should reach for. The Tier 2 runner iterates these cases,
// invokes `grade_clause_severity` directly, and computes:
//
//   precision = correctly-flagged-as-red / total-flagged-as-red-by-tool
//   recall    = correctly-flagged-as-red / total-true-red-flags-in-set
//   groundedness = the tool's own `validateGrading` already enforces
//     verbatim citation in the cited chunk's content (lease-tools.ts);
//     groundedness here = % of cases where grading completed without
//     throwing the citation-not-grounded error.
//   cost+latency are captured per case via tool wallclock + tokens.
//
// "Red flag" semantics: severity in {high, medium} = red flag.
// severity in {ok, low} = not a red flag. This collapses the 4-level
// scale to a binary classifier so precision/recall remain interpretable.

export interface LeaseGradingCase {
  id: string;
  /** 0-based index into the clauses table for the seeded sample lease. */
  clauseIndex: number;
  /** One-sentence note for human review of why this case is labeled this way. */
  description: string;
  /** Ground-truth severity. */
  expectedSeverity: 'high' | 'medium' | 'low' | 'ok';
  /**
   * Substring (case-insensitive) the model's `statute_citation` should
   * START WITH or CONTAIN. Use the most specific NJ stat / federal cite
   * we'd expect a tenant attorney to reach for. Empty string when the
   * clause has no clear statutory hook (e.g. boilerplate governing law).
   */
  expectedStatutePrefix: string;
}

export const LEASE_GRADING_SET: LeaseGradingCase[] = [
  {
    id: 'auto-renewal-120day-notice',
    clauseIndex: 0,
    description:
      'TERM clause with 120-day non-renewal notice requirement. NJ default is month-to-month; the long opt-out window is unfavorable but not clearly unenforceable.',
    expectedSeverity: 'medium',
    expectedStatutePrefix: 'NJ Stat',
  },
  {
    id: 'rent-amount-only',
    clauseIndex: 1,
    description: 'RENT clause states amount + due date. Standard, no red flag.',
    expectedSeverity: 'ok',
    expectedStatutePrefix: '',
  },
  {
    id: 'late-fee-no-grace',
    clauseIndex: 2,
    description:
      'LATE FEE: $150 + $10/day, no grace period, accrues immediately. Under NJ common-law expectation, late fees must be reasonable + commonly include a grace period. Stacking daily fee on flat penalty is a red flag.',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ',
  },
  {
    id: 'security-deposit-over-cap',
    clauseIndex: 3,
    description:
      'SECURITY DEPOSIT: 2 months rent ($4,800), exceeds NJ Stat 46:8-21.2 cap of 1.5 months. Also: interest belongs to landlord (violates NJ Stat 46:8-19) and "non-refundable" language is unenforceable.',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ Stat 46:8',
  },
  {
    id: 'early-termination-no-mitigation',
    clauseIndex: 4,
    description:
      'EARLY TERMINATION: 3-month penalty PLUS all remaining rent, "regardless of whether Landlord re-rents". Conflicts with NJ\'s landlord duty to mitigate damages.',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ',
  },
  {
    id: 'sublet-blanket-prohibition',
    clauseIndex: 5,
    description:
      'SUBLETTING: blanket prohibition + automatic deposit forfeiture. NJ tenant-rights doctrine disfavors unreasonable restraints on alienation; deposit forfeiture for breach also conflicts with itemization rules.',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ',
  },
  {
    id: 'repairs-waive-habitability',
    clauseIndex: 6,
    description:
      'REPAIRS: tenant responsible for $500-and-under repairs, "AS IS", waives implied warranty of habitability and repair-and-deduct remedy. The habitability waiver is unenforceable as against public policy.',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ',
  },
  {
    id: 'entry-no-notice',
    clauseIndex: 7,
    description:
      'LANDLORD ENTRY: any reasonable time, with or without notice, any purpose. Conflicts with the implied covenant of quiet enjoyment + common-law reasonable-notice rule.',
    expectedSeverity: 'high',
    expectedStatutePrefix: '',
  },
  {
    id: 'pets-no-esa-exception',
    clauseIndex: 8,
    description:
      'PETS: no exception for service or emotional support animals. Violates 42 USC §3604(f)(3)(B) — Fair Housing Act reasonable-accommodation requirement.',
    expectedSeverity: 'high',
    expectedStatutePrefix: '42 USC',
  },
  {
    id: 'attorneys-fees-one-way',
    clauseIndex: 9,
    description:
      "ATTORNEYS FEES: tenant pays landlord's fees regardless of outcome. NJ Stat 46:8-21.1 / 2A:42-10.10 grant tenants statutory fee-shifting rights that this clause cannot waive; one-way clauses also conflict with NJ's reciprocity doctrine.",
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ',
  },
  {
    id: 'jury-trial-waiver',
    clauseIndex: 11,
    description:
      'JURY TRIAL WAIVER: NJ courts treat residential jury-trial waivers with significant skepticism; not automatically void but disfavored.',
    expectedSeverity: 'medium',
    expectedStatutePrefix: '',
  },
  {
    id: 'retaliation-15-day-eviction',
    clauseIndex: 12,
    description:
      'RETALIATION CLAUSE: explicit 15-day eviction following any tenant complaint to a governmental authority. Violates NJ Stat 2A:42-10.10 (anti-retaliation statute).',
    expectedSeverity: 'high',
    expectedStatutePrefix: 'NJ Stat 2A:42-10',
  },
];
