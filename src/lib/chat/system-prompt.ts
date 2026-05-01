import type { Role } from '@/lib/auth/types';
import type { RetrievedChunk } from '@/lib/rag/retrieve';

const MAX_PASSAGE_CHARS = 400;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatContextBlock(chunks: RetrievedChunk[]): string {
  const header =
    'The following passages are from the Side Quest Syndicate brand documents.\n' +
    'Use them to ground your response. Cite the source heading when relevant.';

  const entries = chunks.map((chunk, i) => {
    const heading = chunk.heading ?? '(no heading)';
    const label = `[${i + 1}] ${chunk.documentSlug} > ${heading}`;
    return `${label}\n"${truncate(chunk.content, MAX_PASSAGE_CHARS)}"`;
  });

  return `<context>\n${header}\n\n${entries.join('\n\n')}\n</context>`;
}

export function buildSystemPrompt(
  role: Role,
  context?: RetrievedChunk[],
): string {
  const utcDate = new Date().toISOString().slice(0, 10);

  const base = [
    'You are an AI assistant for Side Quest Syndicate, a gaming content brand.',
    'You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling gaming content.',
    `The operator's role is ${role}.`,
    `Today's date: ${utcDate}.`,
    'Be concise and practical.',
    // Tool-usage guidance (Sprint 8 follow-up, Issue 2 in dev-server feedback):
    'When using tools that take a `document_slug`, prefer to call `list_documents` (or `search_corpus`) first to find the exact slug rather than guessing — guessed slugs trigger validation errors and waste a turn.',
    'When invoking `schedule_content_item`, pass the `scheduled_for` time as an ISO 8601 string (e.g. "2026-05-02T09:00:00Z") — the server parses it. In your conversational reply, phrase scheduled times in human-friendly form (e.g. "Tomorrow at 9:00 AM UTC"); never expose Unix timestamps or raw numeric values.',
  ].join(' ');

  if (!context || context.length === 0) return base;

  return `${base}\n\n${formatContextBlock(context)}`;
}
