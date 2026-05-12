// Tiny line-by-line markdown subset for assistant chat responses.
//
// Supports: headings (#, ##, ###, ####, #####, ######), unordered + ordered
// lists, horizontal rule (---), GFM tables, inline bold (**), inline code (`).
// Everything else falls through to a paragraph.
//
// The page already owns a global <h1> (the workspace title), so a single
// `#` in chat content renders as <h2> to keep the document outline well
// formed; deeper levels offset accordingly. All colours come from the
// Sprint 15 design tokens so headings stay readable in both schemes.

import type React from 'react';

// --- Inline ------------------------------------------------------------------

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function renderInline(text: string, key: string | number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(renderInlineMatch(match[0], match.index));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  if (parts.length === 0) return null;
  return <span key={key}>{parts}</span>;
}

function renderInlineMatch(match: string, index: number): React.ReactNode {
  if (match.startsWith('**')) {
    const inner = match.slice(2, -2);
    return <strong key={`b-${inner}-${index}`}>{inner}</strong>;
  }
  // Inline code — accent-coloured on a muted surface; tokenised so dark
  // mode flips automatically (was bg-gray-100 / text-indigo-600 before).
  const inner = match.slice(1, -1);
  return (
    <code
      key={`c-${index}`}
      className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.85em] text-accent-600 dark:bg-neutral-800 dark:text-accent-300"
    >
      {inner}
    </code>
  );
}

// --- Block-level helpers -----------------------------------------------------

interface ParsedHeading {
  level: number;
  text: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

function parseHeading(trimmed: string): ParsedHeading | null {
  const match = HEADING_RE.exec(trimmed);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

function renderHeading(
  level: number,
  text: string,
  key: string,
): React.ReactNode {
  const inline = renderInline(text, `${key}-inline`);
  // The page's <h1> belongs to the workspace title; offset chat headings
  // by one so a single `#` renders as <h2>.
  switch (level) {
    case 1:
      return (
        <h2 key={key} className="mb-1 mt-4 text-lg font-bold text-fg-default">
          {inline}
        </h2>
      );
    case 2:
      return (
        <h3 key={key} className="mb-1 mt-4 text-base font-bold text-fg-default">
          {inline}
        </h3>
      );
    case 3:
      return (
        <h4 key={key} className="mb-1 mt-4 text-sm font-bold text-fg-default">
          {inline}
        </h4>
      );
    case 4:
      return (
        <h5
          key={key}
          className="mb-1 mt-3 text-sm font-semibold text-fg-default"
        >
          {inline}
        </h5>
      );
    default:
      // Levels 5 and 6 — render as a small uppercase label so they read
      // as section eyebrows rather than headings.
      return (
        <h6
          key={key}
          className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-fg-muted"
        >
          {inline}
        </h6>
      );
  }
}

function renderParagraph(text: string, key: string): React.ReactNode {
  return (
    <p key={key} className="mb-2 leading-relaxed last:mb-0">
      {renderInline(text, `${key}-inline`)}
    </p>
  );
}

function renderList(items: string[], key: string): React.ReactNode {
  return (
    <ul key={key} className="mb-2 ml-4 list-disc space-y-1">
      {items.map((item) => (
        <li key={item.slice(0, 40)} className="leading-relaxed">
          {renderInline(item, item.slice(0, 40))}
        </li>
      ))}
    </ul>
  );
}

function renderHr(key: string): React.ReactNode {
  return (
    <hr key={key} className="my-3 border-neutral-200 dark:border-neutral-800" />
  );
}

const LIST_ITEM_RE = /^(?:[-*]|\d+\.)\s+(.*)$/;

function parseListItem(trimmed: string): string | null {
  const match = LIST_ITEM_RE.exec(trimmed);
  return match ? match[1] : null;
}

// --- Tables (GitHub-flavored markdown) ---------------------------------------
//
// A table is recognised when we see two consecutive lines:
//   1. A row line: `| col1 | col2 | col3 |` — has at least one `|`
//      separator and starts/ends with `|`.
//   2. A separator line: `|---|---|---|` — pipes + hyphens + optional
//      colons for alignment. Same column count as the row above.
//
// Subsequent rows are data until the first non-row line. This handles the
// common assistant output `| Clause | Issue | Statute | |---|---|---|`
// instead of falling through to paragraph rendering.

// Matches `| anything | anything |` etc. — at least one inner `|`.
const TABLE_ROW_RE = /^\|(.+)\|$/;
// Matches `|---|---|` or `| :--- | ---: |` with optional alignment colons.
const TABLE_SEPARATOR_RE = /^\|(\s*:?-+:?\s*\|)+$/;

interface ParsedTable {
  header: string[];
  rows: string[][];
  /** Per-column alignment derived from the separator line. */
  align: ('left' | 'center' | 'right')[];
}

function parseTableRow(trimmed: string): string[] | null {
  const match = TABLE_ROW_RE.exec(trimmed);
  if (!match) return null;
  // Split on `|` and trim each cell. The regex captures content between
  // the outer pipes, so we don't need to discard empty edge cells.
  return match[1].split('|').map((cell) => cell.trim());
}

function parseTableAlign(
  separator: string,
): ('left' | 'center' | 'right')[] | null {
  if (!TABLE_SEPARATOR_RE.test(separator)) return null;
  return separator
    .slice(1, -1) // drop outer pipes
    .split('|')
    .map((cell) => {
      const c = cell.trim();
      const left = c.startsWith(':');
      const right = c.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });
}

/**
 * Try to parse a table starting at `startIdx`. Returns the parsed shape +
 * how many lines were consumed (header + separator + N data rows), or
 * null if the lines don't form a valid table.
 */
function tryParseTable(
  lines: string[],
  startIdx: number,
): { table: ParsedTable; consumed: number } | null {
  const header = parseTableRow(lines[startIdx]?.trim() ?? '');
  if (!header) return null;

  const align = parseTableAlign(lines[startIdx + 1]?.trim() ?? '');
  if (!align) return null;
  // Header + separator must have matching column counts.
  if (align.length !== header.length) return null;

  const rows: string[][] = [];
  let i = startIdx + 2;
  while (i < lines.length) {
    const row = parseTableRow(lines[i].trim());
    if (!row) break;
    // Pad / truncate so every row matches the header column count.
    if (row.length < header.length) {
      while (row.length < header.length) row.push('');
    } else if (row.length > header.length) {
      row.length = header.length;
    }
    rows.push(row);
    i++;
  }

  return { table: { header, rows, align }, consumed: i - startIdx };
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function renderTable(table: ParsedTable, key: string): React.ReactNode {
  return (
    <div
      key={key}
      className="my-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800"
    >
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="bg-surface-muted dark:bg-neutral-800/60">
          <tr>
            {table.header.map((cell, ci) => (
              <th
                // biome-ignore lint/suspicious/noArrayIndexKey: header cells are positional; column count is fixed by the separator line, never reorders.
                key={ci}
                className={`border-b border-neutral-200 px-3 py-2 font-semibold text-fg-default dark:border-neutral-800 ${ALIGN_CLASS[table.align[ci] ?? 'left']}`}
              >
                {renderInline(cell, `${key}-h-${ci}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: streaming markdown rows are positional — the assistant emits them in a fixed order, content can repeat (e.g. same severity word in multiple rows), no row identity to key by.
              key={ri}
              className="border-t border-neutral-100 dark:border-neutral-800"
            >
              {row.map((cell, ci) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional column cells, fixed by the header.
                  key={ci}
                  className={`px-3 py-2 align-top text-fg-default ${ALIGN_CLASS[table.align[ci] ?? 'left']}`}
                >
                  {renderInline(cell, `${key}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Top-level renderer ------------------------------------------------------

export function renderMarkdown(content: string): React.ReactNode {
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    elements.push(
      renderParagraph(paragraphBuffer.join(' '), `p-${elements.length}`),
    );
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(renderList(listBuffer, `ul-${elements.length}`));
    listBuffer = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    // Tables claim priority over paragraphs — a table-row line followed
    // by a separator line must be parsed as a table, not as two pipe-
    // delimited paragraphs. Tables consume 2 + N lines.
    const tableResult = tryParseTable(lines, i);
    if (tableResult) {
      flushBlocks();
      elements.push(renderTable(tableResult.table, `t-${elements.length}`));
      i += tableResult.consumed - 1; // for-loop's i++ adds one more
      continue;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      flushBlocks();
      elements.push(
        renderHeading(heading.level, heading.text, `h-${elements.length}`),
      );
      continue;
    }

    const listItem = parseListItem(trimmed);
    if (listItem !== null) {
      flushParagraph();
      listBuffer.push(listItem);
      continue;
    }

    if (trimmed === '---') {
      flushBlocks();
      elements.push(renderHr(`hr-${elements.length}`));
      continue;
    }

    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushBlocks();

  return <>{elements}</>;
}
