import type React from 'react';

function renderInline(text: string, key: string | number): React.ReactNode {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const match = m[0];
    if (match.startsWith('**')) {
      parts.push(
        <strong key={`${match.slice(2, -2)}-${m.index}`}>
          {match.slice(2, -2)}
        </strong>,
      );
    } else if (match.startsWith('`')) {
      parts.push(
        <code
          key={`c-${m.index}`}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-indigo-600"
        >
          {match.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + match.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return null;
  return <span key={key}>{parts}</span>;
}

export function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ');
    elements.push(
      <p
        key={`p-${elements.length}`}
        className="mb-2 leading-relaxed last:mb-0"
      >
        {renderInline(text, `ps-${elements.length}`)}
      </p>,
    );
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = [...listBuffer];
    elements.push(
      <ul
        key={`ul-${elements.length}`}
        className="mb-2 ml-4 list-disc space-y-1"
      >
        {items.map((item) => (
          <li key={item.slice(0, 40)} className="leading-relaxed">
            {renderInline(item, item.slice(0, 40))}
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      flushList();
      elements.push(
        <h4
          key={`h4-${elements.length}`}
          className="mb-1 mt-4 text-sm font-bold text-gray-800"
        >
          {renderInline(trimmed.slice(4), `h4s-${elements.length}`)}
        </h4>,
      );
    } else if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      elements.push(
        <h3
          key={`h3-${elements.length}`}
          className="mb-1 mt-4 text-base font-bold text-gray-800"
        >
          {renderInline(trimmed.slice(3), `h3s-${elements.length}`)}
        </h3>,
      );
    } else if (trimmed.startsWith('# ')) {
      flushParagraph();
      flushList();
      elements.push(
        <h2
          key={`h2-${elements.length}`}
          className="mb-1 mt-4 text-lg font-bold text-gray-800"
        >
          {renderInline(trimmed.slice(2), `h2s-${elements.length}`)}
        </h2>,
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      listBuffer.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushParagraph();
      listBuffer.push(trimmed.replace(/^\d+\.\s/, ''));
    } else if (trimmed === '---') {
      flushParagraph();
      flushList();
      elements.push(
        <hr key={`hr-${elements.length}`} className="my-3 border-gray-200" />,
      );
    } else if (!trimmed) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraphBuffer.push(trimmed);
    }
  }

  flushParagraph();
  flushList();

  return <>{elements}</>;
}
