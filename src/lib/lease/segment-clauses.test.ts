// Sprint 13 §3c — clause segmentation pipeline.
// Splits page text on numbered-section regex (1., (a), ARTICLE I) then
// classifies each segment. Zero-clause and partial-text-layer cases are
// degenerate-but-valid per spec §3c.

import { describe, expect, it } from 'vitest';
import { segmentClauses } from './segment-clauses';

describe('segmentClauses', () => {
  it('splits on numbered (1., 2., 3.) prefix', () => {
    const result = segmentClauses([
      {
        pageNumber: 1,
        text: '1. Tenant shall provide a security deposit of one month rent.\n2. Any rent received after the fifth shall incur a late fee.\n3. Tenant may not sublet without consent.',
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].clauseIndex).toBe(0);
    expect(result[0].pageNumber).toBe(1);
    expect(result[0].text).toContain('security deposit');
    expect(result[0].clauseType).toBe('security_deposit');
    expect(result[1].clauseType).toBe('late_fee');
    expect(result[2].clauseType).toBe('sublet');
  });

  it('splits on alphabetic (a), (b), (c) prefix', () => {
    const result = segmentClauses([
      {
        pageNumber: 2,
        text: '(a) Landlord shall provide 24 hours notice before entering the premises.\n(b) Tenant shall pay a pet fee of $200.',
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].clauseType).toBe('entry');
    expect(result[1].clauseType).toBe('pet');
  });

  it('splits on ARTICLE I, ARTICLE II, ARTICLE III prefix', () => {
    const result = segmentClauses([
      {
        pageNumber: 1,
        text: 'ARTICLE I\nTenant shall provide a security deposit of one month rent at execution.\nARTICLE II\nAny payment received after the fifth shall incur a late fee.',
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].clauseType).toBe('security_deposit');
    expect(result[1].clauseType).toBe('late_fee');
  });

  it('preserves pageNumber across multi-page input', () => {
    const result = segmentClauses([
      {
        pageNumber: 3,
        text: '1. Tenant shall provide a security deposit.',
      },
      {
        pageNumber: 4,
        text: '1. Any rent late on the fifth shall incur a late fee.',
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].pageNumber).toBe(3);
    expect(result[1].pageNumber).toBe(4);
  });

  it('assigns globally-monotonic clauseIndex across all pages', () => {
    const result = segmentClauses([
      {
        pageNumber: 1,
        text: '1. Security deposit of one month rent.\n2. Late fee on rent after the fifth.',
      },
      { pageNumber: 2, text: '1. Pet fee of $200.' },
    ]);

    expect(result.map((r) => r.clauseIndex)).toEqual([0, 1, 2]);
  });

  it('returns "unknown" clauseType when no keyword matches', () => {
    const result = segmentClauses([
      {
        pageNumber: 1,
        text: '1. The party of the first part hereinafter agrees to terms set forth herein.',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].clauseType).toBe('unknown');
  });

  it('returns an empty array when no numbered sections are detected (degenerate-but-valid per spec §3c)', () => {
    const result = segmentClauses([
      {
        pageNumber: 1,
        text: 'No numbered sections, just prose. Nothing to split.',
      },
    ]);

    expect(result).toEqual([]);
  });

  it('returns an empty array when given zero pages', () => {
    expect(segmentClauses([])).toEqual([]);
  });

  it('skips pages with empty text without throwing', () => {
    const result = segmentClauses([
      { pageNumber: 1, text: '' },
      {
        pageNumber: 2,
        text: '1. Security deposit of one month rent at execution.',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].pageNumber).toBe(2);
  });
});
