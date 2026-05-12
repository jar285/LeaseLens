import { cleanup, render } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderMarkdown } from './render-markdown';

describe('renderMarkdown — tables', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a GFM table with header + separator + data rows', () => {
    const content = [
      '| Clause | Issue | Statute |',
      '|--------|-------|---------|',
      '| Security Deposit | Exceeds 1.5-month cap | NJ Stat 46:8-19 |',
      '| Subletting | Blanket prohibition | NJ common law |',
    ].join('\n');

    const { container } = render(renderMarkdown(content) as React.ReactElement);
    const table = container.querySelector('table');
    expect(table).not.toBeNull();

    const headerCells = container.querySelectorAll('thead th');
    expect(headerCells).toHaveLength(3);
    expect(headerCells[0]).toHaveTextContent('Clause');
    expect(headerCells[1]).toHaveTextContent('Issue');
    expect(headerCells[2]).toHaveTextContent('Statute');

    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);

    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells[0]).toHaveTextContent('Security Deposit');
    expect(firstRowCells[2]).toHaveTextContent('NJ Stat 46:8-19');
  });

  it('respects column alignment from the separator row', () => {
    const content = [
      '| Left | Center | Right |',
      '| :--- | :----: | ----: |',
      '| a    | b      | c     |',
    ].join('\n');

    const { container } = render(renderMarkdown(content) as React.ReactElement);
    const headerCells = container.querySelectorAll('thead th');
    expect(headerCells[0].className).toContain('text-left');
    expect(headerCells[1].className).toContain('text-center');
    expect(headerCells[2].className).toContain('text-right');
  });

  it('pads short rows with empty cells to match the header width', () => {
    const content = ['| A | B | C |', '|---|---|---|', '| only-one |'].join(
      '\n',
    );

    const { container } = render(renderMarkdown(content) as React.ReactElement);
    const cells = container.querySelectorAll('tbody td');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('only-one');
    expect(cells[1]).toHaveTextContent('');
    expect(cells[2]).toHaveTextContent('');
  });

  it('returns paragraph rendering for table-like lines without a valid separator', () => {
    // The first line looks like a row but the second line isn't a valid
    // separator → should NOT render as a table.
    const content = '| not | really | a | table |\nsome paragraph text';
    const { container } = render(renderMarkdown(content) as React.ReactElement);
    expect(container.querySelector('table')).toBeNull();
  });

  it('renders inline bold and code inside table cells', () => {
    const content = [
      '| Severity | Action |',
      '|----------|--------|',
      '| **HIGH** | run `npm run db:seed` |',
    ].join('\n');

    const { container } = render(renderMarkdown(content) as React.ReactElement);
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('code')).not.toBeNull();
  });

  it('places the table inside a horizontally-scrollable wrapper', () => {
    const content = '| a | b |\n|---|---|\n| 1 | 2 |';
    const { container } = render(renderMarkdown(content) as React.ReactElement);
    // Wrapper has overflow-x-auto so wide tables don't break narrow panes.
    const wrapper = container.querySelector('.overflow-x-auto');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector('table')).not.toBeNull();
  });
});

describe('renderMarkdown — preserves existing behaviour for non-tables', () => {
  afterEach(() => {
    cleanup();
  });

  it('still renders headings correctly', () => {
    const { container } = render(
      renderMarkdown('## A heading') as React.ReactElement,
    );
    expect(container.querySelector('h3')).not.toBeNull();
  });

  it('still renders lists correctly', () => {
    const { container } = render(
      renderMarkdown('- one\n- two') as React.ReactElement,
    );
    const lis = container.querySelectorAll('li');
    expect(lis).toHaveLength(2);
  });

  it('still renders horizontal rules', () => {
    const { container } = render(
      renderMarkdown('text\n\n---\n\nmore') as React.ReactElement,
    );
    expect(container.querySelector('hr')).not.toBeNull();
  });
});
