// Sprint 46.1 — clause-text → text-layer range matcher.
//
// The PDF highlight feature has no stored coordinates (parse-pdf.ts
// discards pdfjs transforms). Instead we match each clause's stored
// `text` against the page's text-layer items at render time and wrap
// the matched runs. This module is the pure heart of that: given a
// page's ordered text items and the clauses on that page, return the
// per-item character ranges to wrap in <mark>.
//
// Reliability note: the stored clause text was produced by parse-pdf.ts
// from the SAME pdfjs items react-pdf renders, so after whitespace/
// ligature/quote normalization an exact (or prefix) match is the common
// case. Forward-cursor ordering disambiguates repeated text.

import { describe, expect, it } from 'vitest';
import {
  type HighlightRange,
  type HighlightTextItem,
  MIN_MATCH_CHARS,
  matchClausesOnPage,
  normalizeQuery,
} from './highlight-match';

/** Reconstruct the matched passage from ranges, joining cross-item runs
 *  with a space (the inter-item separator the matcher skips). */
function sliceRanges(
  items: HighlightTextItem[],
  ranges: HighlightRange[],
): string {
  return ranges
    .map((r) => items[r.itemIndex].str.slice(r.start, r.end))
    .join(' ');
}

describe('normalizeQuery', () => {
  it('folds quotes/dashes, collapses whitespace, lowercases, trims', () => {
    expect(normalizeQuery('  Tenant’s  “quote”—dash ')).toBe(
      'tenant\'s "quote"-dash',
    );
  });
});

describe('matchClausesOnPage', () => {
  it('matches a clause within a single item and returns its range', () => {
    const items: HighlightTextItem[] = [
      {
        str: 'Tenant shall provide a security deposit equal to two months rent.',
      },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'security deposit equal to two months' },
    ]);

    expect(result.clauseId).toBe('c1');
    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      'security deposit equal to two months',
    );
  });

  it('matches a clause spanning multiple items', () => {
    const items: HighlightTextItem[] = [
      { str: 'Tenant shall provide' },
      { str: 'a security deposit equal' },
      { str: 'to two months rent.' },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'security deposit equal to two months' },
    ]);

    expect(result.ranges.map((r) => r.itemIndex)).toEqual([1, 2]);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      'security deposit equal to two months',
    );
  });

  it('matches across a hasEOL line break', () => {
    const items: HighlightTextItem[] = [
      { str: 'security deposit equal to', hasEOL: true },
      { str: 'two months rent' },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'equal to two months' },
    ]);

    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      'equal to two months',
    );
  });

  it('normalizes collapsed whitespace in the query', () => {
    const items: HighlightTextItem[] = [
      { str: 'Any rent received after the fifth incurs a late fee.' },
    ];
    const [result] = matchClausesOnPage(items, [
      // double spaces in the stored text must still match single spaces
      { clauseId: 'c1', text: 'rent  received   after the fifth' },
    ]);

    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      'rent received after the fifth',
    );
  });

  it('folds curly quotes so straight-quote queries match', () => {
    const items: HighlightTextItem[] = [
      { str: 'Tenant’s obligations under the lease agreement' },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: "tenant's obligations under the lease" },
    ]);

    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      "tenant's obligations under the lease",
    );
  });

  it('folds ligatures (ﬃ) so plain-ascii queries match', () => {
    const items: HighlightTextItem[] = [
      { str: 'oﬃce of the landlord premises' },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'office of the landlord' },
    ]);

    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toBe(
      'office of the landlord',
    );
  });

  it('disambiguates repeated text with a forward cursor (clause order)', () => {
    const items: HighlightTextItem[] = [
      {
        str: 'Tenant shall pay rent on time. Tenant shall pay rent on time.',
      },
    ];
    const results = matchClausesOnPage(items, [
      { clauseId: 'first', text: 'Tenant shall pay rent on time' },
      { clauseId: 'second', text: 'Tenant shall pay rent on time' },
    ]);

    const first = results.find((r) => r.clauseId === 'first');
    const second = results.find((r) => r.clauseId === 'second');
    expect(first?.ranges[0].start).toBe(0);
    // second clause matches the LATER occurrence, not the same span
    expect(second?.ranges[0].start).toBeGreaterThan(first?.ranges[0].end ?? 0);
  });

  it('degrades to an anchored prefix when the tail drifts/truncates', () => {
    const items: HighlightTextItem[] = [
      { str: 'security deposit equal to two months rent' },
    ];
    // query is longer than the page text (e.g. clause continued elsewhere)
    const [result] = matchClausesOnPage(items, [
      {
        clauseId: 'c1',
        text: 'security deposit equal to two months rent paid upfront at signing',
      },
    ]);

    expect(result.ranges.length).toBeGreaterThan(0);
    expect(normalizeQuery(sliceRanges(items, result.ranges))).toContain(
      'security deposit equal to two months',
    );
  });

  it('returns no ranges when the clause is not on the page', () => {
    const items: HighlightTextItem[] = [
      { str: 'This page is only about parking spaces and garage access.' },
    ];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'security deposit equal to two months rent' },
    ]);
    expect(result.ranges).toEqual([]);
  });

  it('ignores clause text shorter than MIN_MATCH_CHARS as too ambiguous', () => {
    expect(MIN_MATCH_CHARS).toBeGreaterThan(4);
    const items: HighlightTextItem[] = [{ str: 'rent is due monthly' }];
    const [result] = matchClausesOnPage(items, [
      { clauseId: 'c1', text: 'rent' },
    ]);
    expect(result.ranges).toEqual([]);
  });

  it('returns ranges in document order and non-overlapping', () => {
    const items: HighlightTextItem[] = [
      { str: 'Section one covers the security deposit equal to two months' },
      { str: 'and section two covers the late fee of ten percent per day.' },
    ];
    const results = matchClausesOnPage(items, [
      { clauseId: 'a', text: 'security deposit equal to two months' },
      { clauseId: 'b', text: 'late fee of ten percent per day' },
    ]);

    const flat = results.flatMap((r) =>
      r.ranges.map((rng) => ({ ...rng, clauseId: r.clauseId })),
    );
    for (let i = 1; i < flat.length; i++) {
      const prev = flat[i - 1];
      const cur = flat[i];
      // either a later item, or a later start within the same item
      const ordered =
        cur.itemIndex > prev.itemIndex ||
        (cur.itemIndex === prev.itemIndex && cur.start >= prev.end);
      expect(ordered).toBe(true);
    }
  });
});
