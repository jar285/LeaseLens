// Tiny line-by-line markdown subset for assistant chat responses.
//
// Supports: headings (#, ##, ###, ####, #####, ######), unordered + ordered
// lists, horizontal rule (---), inline bold (**), inline code (`).
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

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushBlocks();
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
