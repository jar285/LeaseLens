export interface ChunkInput {
  id: string;
  level: 'document' | 'section' | 'passage';
  heading: string | null;
  content: string;
  embeddingInput: string;
}

const MAX_SECTION_WORDS = 400;
const MIN_CHUNK_WORDS = 30;
const DOCUMENT_CHAR_LIMIT = 2000;
const DOCUMENT_EMBEDDING_CHAR_LIMIT = 500;

export function chunkDocument(
  slug: string,
  title: string,
  content: string,
): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  chunks.push(buildDocumentChunk(slug, title, content));

  const sections = splitOnH2Headings(content);
  const sectionChunks = buildSectionChunks(slug, title, sections);

  for (const chunk of sectionChunks) {
    chunks.push(chunk);
  }

  return mergeUndersized(chunks);
}

function buildDocumentChunk(
  slug: string,
  title: string,
  content: string,
): ChunkInput {
  const headings = extractHeadings(content);
  const headingList = headings.length > 0 ? `${headings.join(' | ')}\n\n` : '';
  const chunkContent = (headingList + content).slice(0, DOCUMENT_CHAR_LIMIT);
  const stripped = stripMarkdown(
    content.slice(0, DOCUMENT_EMBEDDING_CHAR_LIMIT),
  );

  return {
    id: `${slug}#document:0`,
    level: 'document',
    heading: null,
    content: chunkContent,
    embeddingInput: `${title} > ${stripped}`,
  };
}

function buildSectionChunks(
  slug: string,
  title: string,
  sections: Section[],
): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let sectionIndex = 0;
  let passageIndex = 0;

  for (const section of sections) {
    const wordCount = countWords(section.body);

    if (wordCount <= MAX_SECTION_WORDS) {
      chunks.push(
        buildChunk(
          slug,
          title,
          'section',
          sectionIndex,
          section.heading,
          section.body,
        ),
      );
      sectionIndex++;
    } else {
      const passages = splitIntoPassages(section.body);
      for (const passageContent of passages) {
        chunks.push(
          buildChunk(
            slug,
            title,
            'passage',
            passageIndex,
            section.heading,
            passageContent,
          ),
        );
        passageIndex++;
      }
    }
  }

  return chunks;
}

function buildChunk(
  slug: string,
  title: string,
  level: 'section' | 'passage',
  index: number,
  heading: string | null,
  content: string,
): ChunkInput {
  const headingPart = heading ?? '';
  const stripped = stripMarkdown(content);
  const embeddingInput = `${title}: ${headingPart} > ${stripped}`;

  return {
    id: `${slug}#${level}:${index}`,
    level,
    heading,
    content: content.trim(),
    embeddingInput,
  };
}

interface Section {
  heading: string | null;
  body: string;
}

function splitOnH2Headings(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let inFencedBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFencedBlock = !inFencedBlock;
    }

    if (!inFencedBlock && line.startsWith('## ')) {
      if (currentLines.length > 0) {
        const body = currentLines.join('\n').trim();
        if (body.length > 0) {
          sections.push({ heading: currentHeading, body });
        }
      }
      currentHeading = line.slice(3).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const body = currentLines.join('\n').trim();
    if (body.length > 0) {
      sections.push({ heading: currentHeading, body });
    }
  }

  return sections;
}

function splitIntoPassages(content: string): string[] {
  const h3Sections = splitOnH3Headings(content);

  if (h3Sections.length > 1) {
    return h3Sections
      .map((s) => (s.heading ? `### ${s.heading}\n\n${s.body}` : s.body))
      .filter((p) => p.trim().length > 0);
  }

  return splitOnParagraphs(content);
}

function splitOnH3Headings(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let inFencedBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFencedBlock = !inFencedBlock;
    }

    if (!inFencedBlock && line.startsWith('### ')) {
      if (currentLines.length > 0) {
        const body = currentLines.join('\n').trim();
        if (body.length > 0) {
          sections.push({ heading: currentHeading, body });
        }
      }
      currentHeading = line.slice(4).trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const body = currentLines.join('\n').trim();
    if (body.length > 0) {
      sections.push({ heading: currentHeading, body });
    }
  }

  return sections;
}

function splitOnParagraphs(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function mergeUndersized(chunks: ChunkInput[]): ChunkInput[] {
  if (chunks.length <= 1) return chunks;

  const result: ChunkInput[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.level === 'document') {
      result.push(chunk);
      continue;
    }

    if (countWords(chunk.content) < MIN_CHUNK_WORDS && result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.level !== 'document') {
        result[result.length - 1] = {
          ...prev,
          content: `${prev.content}\n\n${chunk.content}`,
          embeddingInput: `${prev.embeddingInput} ${chunk.embeddingInput}`,
        };
        continue;
      }
    }

    result.push(chunk);
  }

  return result;
}

function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => /^#{1,3} /.test(line))
    .map((line) => line.replace(/^#{1,3} /, '').trim());
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6} /gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^> /gm, '')
    .replace(/^- /gm, '')
    .replace(/^\d+\. /gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}
