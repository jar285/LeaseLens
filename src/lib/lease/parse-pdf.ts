// Sprint 13 §3c — server-side PDF text extraction.
//
// Uses the pdfjs-dist legacy build (verified via Context7 against
// /mozilla/pdf.js — the legacy build is the supported Node entry point;
// the default ESM build expects DOM globals). Returns one record per
// page with the concatenated text-content items. Layout / coordinates
// are out of scope here — clause segmentation works off plain text.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface ParsedPdf {
  pageCount: number;
  pages: PageText[];
}

/**
 * Heuristic: pages whose extracted text is shorter than this are
 * treated as text-layer-empty. Used by the upload route (spec §3c) to
 * detect scanned-image PDFs and surface a paste-text fallback. Tunable
 * without spec edits — kept as an exported constant.
 */
export const MIN_PAGE_TEXT_CHARS = 30;

interface PdfTextItem {
  str?: string;
  // pdfjs-dist exposes `hasEOL: true` on items followed by an end-of-
  // line break in the source PDF. Honoring it preserves the line
  // structure that downstream segmenters (segment-clauses) depend on.
  hasEOL?: boolean;
}

interface PdfTextContent {
  items: PdfTextItem[];
}

interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

export async function parsePdf(data: Uint8Array): Promise<ParsedPdf> {
  if (data.byteLength === 0) {
    throw new Error('parsePdf: input buffer is empty');
  }

  // pdfjs-dist's legacy build returns a "loading task" with a `.promise`
  // that resolves to the document. Empty/malformed PDFs reject this
  // promise, which we let bubble up — the route layer translates it
  // into a 422 response.
  const loadingTask = getDocument({ data });
  const pdf = (await loadingTask.promise) as PdfDocument;
  const pageCount = pdf.numPages;

  const pages: PageText[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    try {
      const content = await page.getTextContent();
      // Items are ordered roughly top-to-bottom, left-to-right by
      // pdfjs-dist. Honor `hasEOL` to preserve newline structure so
      // the downstream segmenter can anchor its numbered-section
      // regex on real line starts; non-EOL gaps become single spaces.
      const parts: string[] = [];
      for (const item of content.items) {
        const str = item.str ?? '';
        if (str.length === 0 && !item.hasEOL) continue;
        parts.push(str);
        parts.push(item.hasEOL ? '\n' : ' ');
      }
      const text = parts
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .trim();
      pages.push({ pageNumber: i, text });
    } finally {
      page.cleanup();
    }
  }

  return { pageCount, pages };
}
