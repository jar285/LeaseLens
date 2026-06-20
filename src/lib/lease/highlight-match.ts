// Sprint 46.1 — clause-text → text-layer range matcher.
//
// The PDF highlight feature stores no coordinates (parse-pdf.ts discards
// pdfjs transforms). We instead match each clause's stored `text` against
// the page's rendered text-layer items and wrap the matched runs via
// react-pdf's customTextRenderer. This module is the pure heart of that.
//
// Why exact matching is usually enough: the stored clause text was
// produced by parse-pdf.ts from the SAME pdfjs items react-pdf renders
// (str + hasEOL, joined with spaces/newlines). After whitespace, quote,
// dash, and ligature normalization the two converge, so a normalized
// indexOf hits in the common case. Two refinements cover the rest:
//   - an anchored-prefix fallback for tail drift / the 1200-char clause
//     truncation in lease-tools.ts (the UI only sees a prefix);
//   - a forward scan cursor across a page's clauses (clause_index order)
//     so repeated boilerplate ("Tenant shall…") maps to distinct spans.

export interface HighlightTextItem {
  str: string;
  // pdfjs marks items followed by a line break; parse-pdf.ts honored it,
  // so we collapse it to a separating space the same way it did.
  hasEOL?: boolean;
}

/** A character sub-range within a single item to wrap in <mark>. */
export interface HighlightRange {
  itemIndex: number;
  start: number; // inclusive offset into items[itemIndex].str
  end: number; // exclusive
}

export interface ClauseQuery {
  clauseId: string;
  text: string;
}

export interface ClauseMatch {
  clauseId: string;
  ranges: HighlightRange[];
}

/** Clause texts shorter than this are too ambiguous to highlight safely. */
export const MIN_MATCH_CHARS = 12;
/** Shortest prefix the anchored fallback will accept, to avoid spurious hits. */
export const MIN_ANCHOR_CHARS = 16;

interface PageMapEntry {
  // itemIndex < 0 marks an inter-item separator (never wrapped).
  itemIndex: number;
  start: number;
  end: number;
}

export interface NormalizedPage {
  normalized: string;
  /** map[i] is the origin of normalized[i] in the original item strings. */
  map: PageMapEntry[];
}

// Single-char normalization, applied identically to page and query so
// they converge. May return '' (dropped), ' ' (whitespace), or 1+ chars
// (NFKC can expand a ligature, e.g. ﬃ → "ffi").
function normalizeChar(ch: string): string {
  if (ch === '‘' || ch === '’' || ch === '‚' || ch === '‛' || ch === '′') {
    return "'";
  }
  if (ch === '“' || ch === '”' || ch === '„' || ch === '″') {
    return '"';
  }
  if (
    ch === '‐' ||
    ch === '‑' ||
    ch === '‒' ||
    ch === '–' ||
    ch === '—' ||
    ch === '―' ||
    ch === '−'
  ) {
    return '-';
  }
  if (/\s/.test(ch)) return ' ';
  if (ch === '​' || ch === '‌' || ch === '‍' || ch === '﻿') {
    return '';
  }
  return ch.normalize('NFKC').toLowerCase();
}

export function normalizeQuery(text: string): string {
  let out = '';
  let lastSpace = true; // trims leading whitespace
  for (const ch of text) {
    const n = normalizeChar(ch);
    if (n === '') continue;
    if (n === ' ') {
      if (lastSpace) continue;
      out += ' ';
      lastSpace = true;
    } else {
      out += n;
      lastSpace = false;
    }
  }
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}

export function buildNormalizedPage(
  items: readonly HighlightTextItem[],
): NormalizedPage {
  let normalized = '';
  const map: PageMapEntry[] = [];
  let lastSpace = true;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const str = items[itemIndex]?.str ?? '';
    let offset = 0;
    for (const ch of str) {
      const chLen = ch.length; // 1, or 2 for a surrogate pair
      const n = normalizeChar(ch);
      if (n === '') {
        offset += chLen;
        continue;
      }
      if (n === ' ') {
        if (!lastSpace) {
          normalized += ' ';
          map.push({ itemIndex, start: offset, end: offset + chLen });
          lastSpace = true;
        }
      } else {
        for (const nc of n) {
          normalized += nc;
          map.push({ itemIndex, start: offset, end: offset + chLen });
        }
        lastSpace = false;
      }
      offset += chLen;
    }
    // parse-pdf.ts joined every item with a space (or newline → space).
    if (!lastSpace) {
      normalized += ' ';
      map.push({ itemIndex: -1, start: -1, end: -1 });
      lastSpace = true;
    }
  }

  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }
  return { normalized, map };
}

function spanToRanges(
  page: NormalizedPage,
  start: number,
  end: number,
): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  let cur: HighlightRange | null = null;
  const flush = () => {
    if (cur) {
      ranges.push(cur);
      cur = null;
    }
  };
  for (let i = start; i < end; i++) {
    const m = page.map[i];
    if (!m || m.itemIndex < 0) {
      flush();
      continue;
    }
    if (cur && cur.itemIndex === m.itemIndex) {
      // extend; Math.max guards ligature dupes mapping to the same offset
      cur.end = Math.max(cur.end, m.end);
    } else {
      flush();
      cur = { itemIndex: m.itemIndex, start: m.start, end: m.end };
    }
  }
  flush();
  return ranges;
}

function indexFrom(hay: string, needle: string, from: number): number {
  let i = hay.indexOf(needle, from);
  // forward cursor is a preference, not a constraint — fall back to a
  // global scan so an out-of-order clause still matches somewhere.
  if (i === -1 && from > 0) i = hay.indexOf(needle);
  return i;
}

function findInPage(
  normalized: string,
  query: string,
  fromOffset: number,
): { start: number; end: number } | null {
  if (query.length < MIN_MATCH_CHARS) return null;

  const exact = indexFrom(normalized, query, fromOffset);
  if (exact !== -1) return { start: exact, end: exact + query.length };

  // Anchored-prefix fallback (bounded to a few passes): the front of a
  // clause is usually clean; drift/truncation bites the tail. Try a
  // shrinking front anchor, then extend the highlight to the query's
  // length clipped to the page end.
  const lengths = [
    Math.floor(query.length * 0.85),
    Math.floor(query.length * 0.6),
    Math.floor(query.length * 0.4),
  ];
  const tried = new Set<number>();
  for (const len of lengths) {
    if (len < MIN_ANCHOR_CHARS || tried.has(len)) continue;
    tried.add(len);
    const aidx = indexFrom(normalized, query.slice(0, len), fromOffset);
    if (aidx !== -1) {
      return {
        start: aidx,
        end: Math.min(normalized.length, aidx + query.length),
      };
    }
  }
  return null;
}

/**
 * Match every clause on a page in clause order, threading a forward
 * cursor so repeated text resolves to successive occurrences. Builds the
 * normalized page once and reuses it for all clauses.
 */
export function matchClausesOnPage(
  items: readonly HighlightTextItem[],
  clauses: readonly ClauseQuery[],
): ClauseMatch[] {
  const page = buildNormalizedPage(items);
  let cursor = 0;
  const results: ClauseMatch[] = [];
  for (const clause of clauses) {
    const query = normalizeQuery(clause.text);
    const found = findInPage(page.normalized, query, cursor);
    if (!found) {
      results.push({ clauseId: clause.clauseId, ranges: [] });
      continue;
    }
    results.push({
      clauseId: clause.clauseId,
      ranges: spanToRanges(page, found.start, found.end),
    });
    cursor = found.end;
  }
  return results;
}
