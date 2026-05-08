// Sprint 13 §3c — page-text → clauses pipeline.
//
// Splits each page on a numbered-section regex (1., 2., (a), (b),
// ARTICLE I/II/III…), then routes each segment through classify-clause
// to attach a ClauseType. clauseIndex is monotonically increasing
// across all pages so downstream consumers can render a stable order.
//
// A page with no detectable numbered sections returns no clauses —
// the upload route surfaces a one-line warning to the user (spec §3c
// zero-clause case).

import { type ClauseType, classifyClause } from './classify-clause';

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface SegmentedClause {
  clauseIndex: number;
  clauseType: ClauseType;
  text: string;
  pageNumber: number;
}

// Three prefix shapes recognised on a fresh line:
//   "1." or "12." (numeric)
//   "(a)" or "(z)" (alphabetic, single letter)
//   "ARTICLE I" / "ARTICLE IV" / "ARTICLE XIII" (roman)
// The capturing group is the prefix itself; the body of the clause is
// everything between this match and the next match (or end of text).
const SECTION_PREFIX_RE = /^\s*(\d{1,3}\.|\([a-z]\)|ARTICLE\s+[IVXLCDM]+)\s*/m;
const SECTION_PREFIX_RE_GLOBAL = new RegExp(SECTION_PREFIX_RE.source, 'gm');

interface RawSegment {
  prefix: string;
  body: string;
  pageNumber: number;
}

function splitPage(page: PageText): RawSegment[] {
  const text = page.text;
  if (!text) return [];

  const matches: { index: number; prefix: string }[] = [];
  // Iterate matches manually so we capture the byte offset of each
  // prefix; subsequent slicing yields the body text.
  for (const m of text.matchAll(SECTION_PREFIX_RE_GLOBAL)) {
    if (m.index === undefined) continue;
    matches.push({ index: m.index, prefix: m[1] });
  }

  if (matches.length === 0) return [];

  const segments: RawSegment[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].prefix.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length === 0) continue;
    segments.push({
      prefix: matches[i].prefix,
      body,
      pageNumber: page.pageNumber,
    });
  }
  return segments;
}

export function segmentClauses(pages: PageText[]): SegmentedClause[] {
  const result: SegmentedClause[] = [];
  let clauseIndex = 0;
  for (const page of pages) {
    for (const seg of splitPage(page)) {
      result.push({
        clauseIndex,
        clauseType: classifyClause(seg.body),
        text: seg.body,
        pageNumber: seg.pageNumber,
      });
      clauseIndex += 1;
    }
  }
  return result;
}
