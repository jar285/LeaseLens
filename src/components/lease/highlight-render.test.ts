// Sprint 46.4 — pure helpers that turn matched ranges into the HTML
// string react-pdf's customTextRenderer expects, plus the per-item mark
// computation and the accessible label. Kept pure (no DOM) so the risky
// escaping + range-merging logic is unit-tested directly; the PdfViewer
// integration test only confirms the wiring.

import { describe, expect, it } from 'vitest';
import type { HighlightTextItem } from '@/lib/lease/highlight-match';
import {
  buildHighlightLabel,
  buildItemHtml,
  computePageItemMarks,
  type HighlightDrawTarget,
  type ItemMark,
} from './highlight-render';

const alwaysVisible = () => true;

describe('buildItemHtml', () => {
  it('returns escaped passthrough when there are no marks', () => {
    expect(buildItemHtml('a <b> & c', [])).toBe('a &lt;b&gt; &amp; c');
  });

  it('wraps a mid-string mark and escapes both inside and outside', () => {
    const marks: ItemMark[] = [
      { clauseId: 'c1', severity: 'high', start: 2, end: 5, label: 'L' },
    ];
    // str: "a <b>" → indices 0:a 1:space 2:< 3:b 4:>; mark covers [2,5) = "<b>"
    const html = buildItemHtml('a <b>', marks);
    expect(html).toBe(
      'a <mark class="ll-hl ll-hl--high" data-clause-id="c1" data-severity="high" aria-label="L">&lt;b&gt;</mark>',
    );
  });

  it('carries class, data-clause-id, data-severity and aria-label', () => {
    const marks: ItemMark[] = [
      {
        clauseId: 'c-9',
        severity: 'medium',
        start: 0,
        end: 4,
        label: 'Highlighted clause: Late fee, medium concern, page 2',
      },
    ];
    const html = buildItemHtml('late fee', marks);
    expect(html).toContain('class="ll-hl ll-hl--medium"');
    expect(html).toContain('data-clause-id="c-9"');
    expect(html).toContain('data-severity="medium"');
    expect(html).toContain(
      'aria-label="Highlighted clause: Late fee, medium concern, page 2"',
    );
  });

  it('escapes quotes in clause id / label attribute values', () => {
    const marks: ItemMark[] = [
      { clauseId: 'a"b', severity: 'low', start: 0, end: 3, label: "x'y" },
    ];
    const html = buildItemHtml('abc', marks);
    expect(html).toContain('data-clause-id="a&quot;b"');
    expect(html).toContain('aria-label="x&#39;y"');
  });

  it('orders and clamps multiple marks without overlap', () => {
    const marks: ItemMark[] = [
      { clauseId: 'b', severity: 'low', start: 6, end: 999, label: 'B' },
      { clauseId: 'a', severity: 'high', start: 0, end: 3, label: 'A' },
    ];
    const html = buildItemHtml('abcdefgh', marks);
    // 'a' mark first, then 'b' mark; out-of-range end clamps to length
    expect(html.indexOf('data-clause-id="a"')).toBeLessThan(
      html.indexOf('data-clause-id="b"'),
    );
    expect(html).not.toContain('undefined');
  });
});

describe('computePageItemMarks', () => {
  const items: HighlightTextItem[] = [
    {
      str: 'Tenant shall provide a security deposit equal to two months rent.',
    },
  ];
  const targets: HighlightDrawTarget[] = [
    {
      clauseId: 'c1',
      text: 'security deposit equal to two months',
      severity: 'high',
      label: 'L',
    },
  ];

  it('produces per-item marks for a matched, visible clause', () => {
    const perItem = computePageItemMarks(items, targets, alwaysVisible);
    const marks = perItem.get(0);
    expect(marks?.length).toBeGreaterThan(0);
    expect(marks?.[0]).toMatchObject({ clauseId: 'c1', severity: 'high' });
  });

  it('flags the first fragment of a clause as isFirst (for the icon channel)', () => {
    const multiItem: HighlightTextItem[] = [
      { str: 'the security deposit equal' },
      { str: 'to two months rent is due' },
    ];
    const perItem = computePageItemMarks(
      multiItem,
      [
        {
          clauseId: 'c1',
          text: 'security deposit equal to two months',
          severity: 'high',
          label: 'L',
        },
      ],
      alwaysVisible,
    );
    expect(perItem.get(0)?.[0].isFirst).toBe(true);
    expect(perItem.get(1)?.[0].isFirst).toBe(false);
  });

  it('excludes a clause whose severity is filtered out', () => {
    const perItem = computePageItemMarks(items, targets, (s) => s !== 'high');
    expect(perItem.size).toBe(0);
  });

  it('produces nothing when the clause text is not on the page', () => {
    const perItem = computePageItemMarks(
      items,
      [
        {
          clauseId: 'x',
          text: 'parking garage access rules',
          severity: 'low',
          label: 'L',
        },
      ],
      alwaysVisible,
    );
    expect(perItem.size).toBe(0);
  });
});

describe('buildHighlightLabel', () => {
  it('reads "Highlighted clause: <type>, <severity> concern, page N"', () => {
    expect(
      buildHighlightLabel({
        clauseType: 'security_deposit',
        severity: 'medium',
        pageNumber: 1,
      }),
    ).toBe('Highlighted clause: Security deposit, medium concern, page 1');
  });

  it('says "no concern" for an ok clause and falls back for unknown type', () => {
    expect(
      buildHighlightLabel({
        clauseType: undefined,
        severity: 'ok',
        pageNumber: 3,
      }),
    ).toBe('Highlighted clause: Other clause, no concern, page 3');
  });
});
