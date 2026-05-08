// Sprint 13 §3c — naive keyword-match classifier across 13 known
// clause types. Each known type has a small set of distinctive
// keywords. Anything that doesn't match returns 'unknown' so the
// upstream pipeline preserves clauses for human review.

import { describe, expect, it } from 'vitest';
import type { ClauseType } from './classify-clause';
import { CLAUSE_TYPES, classifyClause } from './classify-clause';

describe('classifyClause', () => {
  // One representative phrase per known type.
  const planted: Array<[ClauseType, string]> = [
    [
      'security_deposit',
      'Tenant shall provide a security deposit of one and a half months rent at lease execution.',
    ],
    [
      'late_fee',
      'Any rent payment received after the fifth day of the month shall incur a late fee of $75.',
    ],
    [
      'early_termination',
      'Tenant may terminate this lease early upon payment of two months rent as an early termination fee.',
    ],
    [
      'sublet',
      'Tenant shall not sublet or assign any portion of the premises without prior written consent of Landlord.',
    ],
    [
      'repair',
      'Landlord shall maintain the premises in habitable condition and respond to repair requests within 14 days.',
    ],
    [
      'entry',
      'Landlord may enter the premises with at least 24 hours notice to inspect or perform repairs.',
    ],
    [
      'retaliation',
      'Landlord shall not engage in retaliatory eviction following a complaint to the local housing authority.',
    ],
    [
      'automatic_renewal',
      'This lease shall automatically renew for successive one-year terms unless either party provides 60 days written notice.',
    ],
    [
      'attorneys_fees',
      'In any action arising under this lease, the prevailing party shall be entitled to reasonable attorneys fees.',
    ],
    [
      'indemnification',
      'Tenant shall indemnify and hold Landlord harmless from all claims, liabilities, and damages arising from Tenant use of the premises.',
    ],
    [
      'jury_waiver',
      'The parties hereby waive their right to a trial by jury in any action arising under this lease.',
    ],
    ['pet', 'Tenant agrees to pay a non-refundable pet fee of $300 per pet.'],
    [
      'parking',
      'Tenant is assigned one parking space; additional parking is at the discretion of Landlord.',
    ],
  ];

  for (const [expected, text] of planted) {
    it(`classifies a ${expected} clause`, () => {
      expect(classifyClause(text)).toBe(expected);
    });
  }

  it('returns "unknown" for text that matches no keyword set', () => {
    expect(
      classifyClause(
        'The party of the first part hereinafter agrees to the terms set forth herein.',
      ),
    ).toBe('unknown');
  });

  it('returns "unknown" for empty input', () => {
    expect(classifyClause('')).toBe('unknown');
  });

  it('CLAUSE_TYPES exposes all 13 known types plus "unknown"', () => {
    expect(CLAUSE_TYPES).toEqual(
      expect.arrayContaining([
        'security_deposit',
        'late_fee',
        'early_termination',
        'sublet',
        'repair',
        'entry',
        'retaliation',
        'automatic_renewal',
        'attorneys_fees',
        'indemnification',
        'jury_waiver',
        'pet',
        'parking',
        'unknown',
      ]),
    );
    expect(CLAUSE_TYPES).toHaveLength(14);
  });

  it('is case-insensitive', () => {
    expect(
      classifyClause('TENANT SHALL PROVIDE A SECURITY DEPOSIT OF ONE MONTH'),
    ).toBe('security_deposit');
  });
});
