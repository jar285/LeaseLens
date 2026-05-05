import { describe, expect, it } from 'vitest';
import { chunkDocument } from './chunk-document';

describe('chunkDocument', () => {
  it('splits a document with two ## sections into at least 3 chunks', () => {
    const sectionBody = Array.from({ length: 40 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const content = [
      '# Brand Guide',
      '',
      '## Section One',
      '',
      sectionBody,
      '',
      '## Section Two',
      '',
      sectionBody,
    ].join('\n');

    const chunks = chunkDocument('doc-test', 'Brand Guide', content);

    const documentChunks = chunks.filter((c) => c.level === 'document');
    const sectionChunks = chunks.filter((c) => c.level === 'section');

    expect(documentChunks).toHaveLength(1);
    expect(sectionChunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('splits an oversized section (> 400 words) into passage chunks', () => {
    const manyWords = Array.from({ length: 420 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const content = ['## Big Section', '', manyWords].join('\n');

    const chunks = chunkDocument('doc-test', 'Doc', content);

    const passageChunks = chunks.filter((c) => c.level === 'passage');
    expect(passageChunks.length).toBeGreaterThanOrEqual(1);
  });

  it('merges an undersized section (< 30 words) into the preceding chunk', () => {
    const normalBody = Array.from({ length: 50 }, (_, i) => `word${i}`).join(
      ' ',
    );
    const tinyBody = 'Too short.';

    const content = [
      '## Normal Section',
      '',
      normalBody,
      '',
      '## Tiny Section',
      '',
      tinyBody,
    ].join('\n');

    const chunks = chunkDocument('doc-test', 'Doc', content);

    const sectionChunks = chunks.filter((c) => c.level === 'section');
    const tinyAsOwnChunk = sectionChunks.find(
      (c) => c.content === tinyBody.trim(),
    );

    expect(tinyAsOwnChunk).toBeUndefined();
  });

  it('does not treat a ## heading inside a fenced code block as a section boundary', () => {
    const content = [
      '## Real Section',
      '',
      'Some prose here.',
      '',
      '```markdown',
      '## This Is Inside A Code Block',
      '```',
      '',
      'More prose after the code block.',
    ].join('\n');

    const chunks = chunkDocument('doc-test', 'Doc', content);

    const sectionChunks = chunks.filter((c) => c.level === 'section');
    const fakeSection = sectionChunks.find(
      (c) => c.heading === 'This Is Inside A Code Block',
    );

    expect(fakeSection).toBeUndefined();
    expect(sectionChunks).toHaveLength(1);
  });

  it('returns exactly one document-level chunk for empty content', () => {
    const chunks = chunkDocument('doc-test', 'Empty Doc', '');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].level).toBe('document');
  });

  it('Round 5 — gives all chunks IDs prefixed by documentId and matching {documentId}#{level}:{index}', () => {
    const content = [
      '## Section A',
      '',
      Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '),
      '',
      '## Section B',
      '',
      Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '),
    ].join('\n');

    const chunks = chunkDocument('doc-test', 'My Doc', content);
    const pattern = /^doc-test#(document|section|passage):\d+$/;

    for (const chunk of chunks) {
      expect(chunk.id).toMatch(pattern);
    }
  });
});
