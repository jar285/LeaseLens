// Sprint 46.4 — turn matched clause ranges into the HTML string that
// react-pdf's customTextRenderer expects.
//
// react-pdf re-parses the returned string as HTML and sanitizes it
// (strips on*/srcdoc/dangerous URLs; KEEPS class/data-*/aria-*/tabindex).
// So we can attach data-clause-id / data-severity / aria-label for the
// emphasis + a11y layers, but interactivity must be delegated (no inline
// handlers survive). Every text segment is escaped before injection —
// the clause text is untrusted PDF content.

import { escapeHtml } from '@/lib/lease/escape-html';
import {
  type HighlightTextItem,
  matchClausesOnPage,
} from '@/lib/lease/highlight-match';
import { CLAUSE_TYPE_LABEL, type Severity } from './grading';

export interface HighlightDrawTarget {
  clauseId: string;
  /** Clause text to match against the page's text layer. */
  text: string;
  severity: Severity;
  /** Pre-built accessible label for the <mark> (see buildHighlightLabel). */
  label: string;
}

export interface ItemMark {
  clauseId: string;
  severity: Severity;
  start: number;
  end: number;
  label: string;
  /**
   * True for the FIRST fragment of a clause (its first item + first range).
   * CSS hangs an absolutely-positioned severity glyph off this one so the
   * "icon" channel shows once per clause without shifting text-layer glyphs
   * (react-pdf needs them aligned to the canvas for selection).
   */
  isFirst?: boolean;
}

const SEVERITY_WORD: Record<Severity, string> = {
  high: 'high concern',
  medium: 'medium concern',
  low: 'low concern',
  ok: 'no concern',
};

export function buildHighlightLabel(opts: {
  clauseType?: string;
  severity: Severity;
  pageNumber: number;
}): string {
  const typeLabel = opts.clauseType
    ? (CLAUSE_TYPE_LABEL[opts.clauseType] ?? CLAUSE_TYPE_LABEL.unknown)
    : CLAUSE_TYPE_LABEL.unknown;
  return `Highlighted clause: ${typeLabel}, ${SEVERITY_WORD[opts.severity]}, page ${opts.pageNumber}`;
}

/**
 * Build the sanitized HTML for one text item: escape everything, wrap the
 * marked sub-ranges in <mark>. Ranges are sorted, clamped to the string,
 * and any overlap is dropped (the running cursor never goes backwards).
 */
export function buildItemHtml(str: string, marks: ItemMark[]): string {
  if (marks.length === 0) return escapeHtml(str);
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  for (const mark of sorted) {
    const start = Math.max(cursor, Math.min(mark.start, str.length));
    const end = Math.max(start, Math.min(mark.end, str.length));
    if (start > cursor) html += escapeHtml(str.slice(cursor, start));
    if (end > start) {
      const inner = escapeHtml(str.slice(start, end));
      html +=
        `<mark class="ll-hl ll-hl--${mark.severity}"` +
        ` data-clause-id="${escapeHtml(mark.clauseId)}"` +
        ` data-severity="${mark.severity}"` +
        (mark.isFirst ? ' data-hl-first="true"' : '') +
        ` aria-label="${escapeHtml(mark.label)}">${inner}</mark>`;
      cursor = end;
    }
  }
  if (cursor < str.length) html += escapeHtml(str.slice(cursor));
  return html;
}

/**
 * Match every draw target against the page once (clause order → stable
 * occurrence assignment for repeated text) and bucket the resulting
 * ranges by text-item index. Targets whose severity is currently hidden
 * are matched (to keep occurrence assignment stable) but not emitted.
 */
export function computePageItemMarks(
  items: readonly HighlightTextItem[],
  targets: readonly HighlightDrawTarget[],
  isVisible: (severity: Severity) => boolean,
): Map<number, ItemMark[]> {
  const perItem = new Map<number, ItemMark[]>();
  if (targets.length === 0) return perItem;

  const matches = matchClausesOnPage(
    items,
    targets.map((t) => ({ clauseId: t.clauseId, text: t.text })),
  );
  const byId = new Map(targets.map((t) => [t.clauseId, t]));

  for (const match of matches) {
    const target = byId.get(match.clauseId);
    if (!target || !isVisible(target.severity)) continue;
    match.ranges.forEach((range, rangeIndex) => {
      const list = perItem.get(range.itemIndex);
      const mark: ItemMark = {
        clauseId: match.clauseId,
        severity: target.severity,
        start: range.start,
        end: range.end,
        label: target.label,
        // ranges come back in document order, so range 0 is the clause start.
        isFirst: rangeIndex === 0,
      };
      if (list) list.push(mark);
      else perItem.set(range.itemIndex, [mark]);
    });
  }
  return perItem;
}
