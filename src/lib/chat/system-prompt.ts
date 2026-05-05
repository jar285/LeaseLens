import type { Role } from '@/lib/auth/types';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import type { Workspace } from '@/lib/workspaces/types';

const MAX_PASSAGE_CHARS = 400;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Strip a single trailing period from the workspace description so the
 * brand-identity sentence in the system prompt always reads cleanly,
 * regardless of operator input. Spec §4.7 / spec-QA L1.
 */
function normalizeDescription(d: string): string {
  return d.trim().replace(/\.$/, '');
}

function formatContextBlock(
  workspace: Workspace,
  chunks: RetrievedChunk[],
): string {
  const header =
    `The following passages are from the ${workspace.name} brand documents.\n` +
    'Use them to ground your response. Cite the source heading when relevant.';

  const entries = chunks.map((chunk, i) => {
    const heading = chunk.heading ?? '(no heading)';
    const label = `[${i + 1}] ${chunk.documentSlug} > ${heading}`;
    return `${label}\n"${truncate(chunk.content, MAX_PASSAGE_CHARS)}"`;
  });

  return `<context>\n${header}\n\n${entries.join('\n\n')}\n</context>`;
}

/**
 * Sprint 11: parameterized on the active workspace. The first argument
 * accepts either the legacy Role-only signature or the new options object
 * for backwards compatibility with existing call sites that haven't
 * migrated yet. The test suite uses both shapes.
 *
 * Preferred shape: buildSystemPrompt({ role, workspace, context }).
 * Legacy shape:    buildSystemPrompt(role, context?) — uses sample workspace.
 */
export function buildSystemPrompt(
  arg: Role | { role: Role; workspace?: Workspace; context?: RetrievedChunk[] },
  context?: RetrievedChunk[],
): string {
  const role = typeof arg === 'string' ? arg : arg.role;
  const workspace: Workspace =
    typeof arg === 'string' || !arg.workspace
      ? {
          id: SAMPLE_WORKSPACE.id,
          name: SAMPLE_WORKSPACE.name,
          description: SAMPLE_WORKSPACE.description,
          is_sample: 1,
          created_at: 0,
          expires_at: null,
        }
      : arg.workspace;
  const ragChunks =
    typeof arg === 'string' ? context : (arg.context ?? context);

  const utcDate = new Date().toISOString().slice(0, 10);
  const desc = normalizeDescription(workspace.description);

  const base = [
    `You are an AI assistant for ${workspace.name}. ${desc}.`,
    'You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling content for this brand.',
    `The operator's role is ${role}.`,
    `Today's date: ${utcDate}.`,
    'Be concise and practical.',
    // Tool-usage guidance (Sprint 8 follow-up, Issue 2 in dev-server feedback):
    'When using tools that take a `document_slug`, prefer to call `list_documents` (or `search_corpus`) first to find the exact slug rather than guessing — guessed slugs trigger validation errors and waste a turn.',
    'When invoking `schedule_content_item`, pass the `scheduled_for` time as an ISO 8601 string (e.g. "2026-05-02T09:00:00Z") — the server parses it. In your conversational reply, phrase scheduled times in human-friendly form (e.g. "Tomorrow at 9:00 AM UTC"); never expose Unix timestamps or raw numeric values.',
    "When asked to draw, visualize, map, or diagram a workflow, taxonomy, state machine, or relationship — call `render_workflow_diagram` with Mermaid source code. Common topics: approval pipeline, content calendar layout, brand voice taxonomy, publishing state machine. When the diagram describes the active brand's content, call `search_corpus` first to ground the diagram nodes in real brand material.",
  ].join(' ');

  if (!ragChunks || ragChunks.length === 0) return base;

  return `${base}\n\n${formatContextBlock(workspace, ragChunks)}`;
}
