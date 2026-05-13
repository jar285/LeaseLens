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

  // S22.1 — pdfjs text-extraction injects MULTIPLE spaces between every
  // word ("LATE   FEE.   Any   rent   payment   received   after...").
  // The keyword phrases are single-spaced ('late fee', 'security
  // deposit', 'enter the premises'); a literal substring check misses
  // every clause whose text comes from the parser. Whitespace must be
  // normalised before the includes() check.
  describe('S22.1 — multi-space PDF text from pdfjs', () => {
    it('classifies "LATE   FEE." correctly (3-space pdfjs output)', () => {
      expect(
        classifyClause('LATE   FEE.   Any   rent   payment   received'),
      ).toBe('late_fee');
    });

    it('classifies "SECURITY   DEPOSIT." correctly', () => {
      expect(
        classifyClause('SECURITY   DEPOSIT.   Tenant   shall   provide'),
      ).toBe('security_deposit');
    });

    it('classifies "ATTORNEYS   FEES." correctly', () => {
      expect(classifyClause('ATTORNEYS   FEES.   In   any   action')).toBe(
        'attorneys_fees',
      );
    });

    it('classifies "LANDLORD   ENTRY." correctly (enter the premises)', () => {
      expect(
        classifyClause(
          'LANDLORD   ENTRY.   Landlord   may   enter   the   Premises',
        ),
      ).toBe('entry');
    });

    it('classifies "PETS." correctly (no pets phrasing)', () => {
      expect(
        classifyClause('PETS.   No   pets   of   any   kind   are   permitted'),
      ).toBe('pet');
    });

    it('classifies "PARKING." correctly', () => {
      expect(
        classifyClause(
          'PARKING.   Tenant   is   assigned   one   parking   space',
        ),
      ).toBe('parking');
    });

    it('classifies "EARLY   TERMINATION." correctly', () => {
      expect(
        classifyClause('EARLY   TERMINATION.   Tenant   may   not   terminate'),
      ).toBe('early_termination');
    });

    it('classifies an auto-renewal clause with multi-space text', () => {
      // "automatically renew" runs verbatim — check the phrase still
      // matches when its component words sit behind multi-space gaps.
      expect(
        classifyClause(
          'TERM.   The   lease   shall   automatically   renew   for   one-year   terms.',
        ),
      ).toBe('automatic_renewal');
    });

    it('normalises tabs and newlines the same as runs of spaces', () => {
      expect(classifyClause('late\t\tfee')).toBe('late_fee');
      expect(classifyClause('late\n\nfee')).toBe('late_fee');
    });
  });

  // S22.1 — rule-order: distinct-topic clauses win over clauses that
  // merely mention another topic in passing. The original sample
  // lease's SUBLETTING clause body says "...attempted sublet shall
  // result in forfeiture of the security deposit", which currently
  // mis-classifies as security_deposit because the rule for that type
  // is checked before sublet. The sublet rule should win because
  // 'sublet' / 'sublease' are far more specific to subletting than
  // 'security deposit' is to that clause's subject.
  describe('S22.1 — rule-order: distinct-topic phrases win over passing mentions', () => {
    it('classifies a SUBLETTING clause that incidentally mentions "security deposit" as sublet', () => {
      expect(
        classifyClause(
          'SUBLETTING. Tenant shall not sublet, assign, or otherwise transfer. Any attempted sublet shall be a material breach and result in forfeiture of the security deposit.',
        ),
      ).toBe('sublet');
    });

    it('classifies a RETALIATION clause that mentions "security deposit" as retaliation', () => {
      expect(
        classifyClause(
          "RETALIATION CLAUSE. Tenant agrees that Landlord may, at Landlord's sole discretion, terminate this Lease and retain the security deposit if Tenant complains.",
        ),
      ).toBe('retaliation');
    });

    it('classifies an INDEMNIFICATION clause that mentions "attorneys fees" as indemnification', () => {
      // The lease's indemnification + fees stack: indemnification rule
      // should still win because 'indemnify' / 'hold harmless' are
      // more distinctive than 'attorneys fees'.
      expect(
        classifyClause(
          'INDEMNIFICATION. Tenant agrees to indemnify and hold harmless Landlord, including all attorneys fees incurred.',
        ),
      ).toBe('indemnification');
    });
  });
});
