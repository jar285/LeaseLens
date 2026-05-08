// Sprint 13 §3c — server-side PDF text extraction via pdfjs-dist.
// Tests use real fixture PDFs at __fixtures__/ — committed binaries
// generated with macOS cupsfilter (simple.pdf) and a hand-written
// non-PDF byte sequence (malformed.pdf). Hermetic — no network, no
// flaky generation at test time.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_PAGE_TEXT_CHARS, parsePdf } from './parse-pdf';

const FIXTURES = join(__dirname, '__fixtures__');

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

describe('parsePdf', () => {
  it('extracts text from a real one-page PDF fixture', async () => {
    const result = await parsePdf(loadFixture('simple.pdf'));

    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pages).toHaveLength(result.pageCount);
    expect(result.pages[0].pageNumber).toBe(1);
    // The fixture was generated from a known plain-text source containing
    // "LeaseLens" and "fixture" — assertion guards against silent breakage
    // if pdfjs-dist's text extraction shape changes.
    expect(result.pages[0].text).toMatch(/LeaseLens/i);
    expect(result.pages[0].text).toMatch(/fixture/i);
  });

  it('returns pages in 1-indexed order', async () => {
    const result = await parsePdf(loadFixture('simple.pdf'));

    for (let i = 0; i < result.pages.length; i++) {
      expect(result.pages[i].pageNumber).toBe(i + 1);
    }
  });

  it('throws on a malformed (non-PDF) byte sequence', async () => {
    await expect(parsePdf(loadFixture('malformed.pdf'))).rejects.toThrow();
  });

  it('throws on an empty buffer', async () => {
    await expect(parsePdf(new Uint8Array(0))).rejects.toThrow();
  });

  it('exports MIN_PAGE_TEXT_CHARS as a tunable heuristic constant', () => {
    expect(typeof MIN_PAGE_TEXT_CHARS).toBe('number');
    expect(MIN_PAGE_TEXT_CHARS).toBeGreaterThan(0);
  });
});
