// Sprint 13 §3h — system prompt rewritten for LeaseLens.
//
// The prompt is parameterized on { role, workspace, context } per the
// existing Sprint 11 contract. Sprint 13 swapped the prose; S19.1
// finished the LeaseLens-name unification, so Role values
// (Tenant/Reviewer/Admin) flow straight into the prompt without a
// label bridge.

import type { Role } from '@/lib/auth/types';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import type { Workspace } from '@/lib/workspaces/types';

/**
 * Phase 10.8.2 — minimal active-lease summary the chat route resolves
 * before each turn and threads into the system prompt. Without this,
 * the agent sees no signal that a lease is loaded (the lease lives in
 * a separate pane, not the chat history) and incorrectly tells the
 * user "I don't see an uploaded lease" — even when one was JUST
 * uploaded and is sitting in the left pane.
 */
export interface ActiveLeaseSummary {
  id: string;
  filename: string;
  page_count: number;
  clause_count: number;
}

const MAX_PASSAGE_CHARS = 400;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Strip a single trailing period from the workspace description so the
 * identity sentence in the system prompt always reads cleanly,
 * regardless of operator input. Sprint 11 spec-QA L1 / Sprint 13.
 */
function normalizeDescription(d: string): string {
  return d.trim().replace(/\.$/, '');
}

function formatContextBlock(
  workspace: Workspace,
  chunks: RetrievedChunk[],
): string {
  const header =
    `The following passages are from the ${workspace.name} corpus (NJ tenant law).\n` +
    'Use them to ground your response. Cite the source heading when relevant.';

  const entries = chunks.map((chunk, i) => {
    const heading = chunk.heading ?? '(no heading)';
    const label = `[${i + 1}] ${chunk.documentSlug} > ${heading}`;
    return `${label}\n"${truncate(chunk.content, MAX_PASSAGE_CHARS)}"`;
  });

  return `<context>\n${header}\n\n${entries.join('\n\n')}\n</context>`;
}

/**
 * Build the LeaseLens system prompt. Accepts either the legacy
 * Role-only signature or the options-object signature for backwards
 * compatibility with Sprint 11 call sites.
 *
 * Preferred shape: buildSystemPrompt({ role, workspace, context }).
 * Legacy shape:    buildSystemPrompt(role, context?) — uses sample workspace.
 */
export function buildSystemPrompt(
  arg:
    | Role
    | {
        role: Role;
        workspace?: Workspace;
        context?: RetrievedChunk[];
        activeLease?: ActiveLeaseSummary | null;
      },
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
  const activeLease =
    typeof arg === 'string' ? null : (arg.activeLease ?? null);

  const utcDate = new Date().toISOString().slice(0, 10);
  const desc = normalizeDescription(workspace.description);

  // Phase 10.8.2 — active lease awareness. When the chat route has
  // resolved a lease for this conversation (or the user uploaded one
  // recently), tell the agent so it stops responding "I don't see a
  // lease" and starts calling extract_clauses immediately when the
  // user asks "find the red flags in this lease" / "review my lease"
  // / etc. The pluralization helper keeps the rendered line clean.
  const leaseAwarenessSection = activeLease
    ? `An active lease IS loaded for this conversation: "${activeLease.filename}" (${activeLease.page_count} ${activeLease.page_count === 1 ? 'page' : 'pages'}, ${activeLease.clause_count} ${activeLease.clause_count === 1 ? 'clause' : 'clauses'} extracted, lease_id ${activeLease.id}). When the user asks about "this lease", "the lease", "my lease", or anything specific to it (e.g. "find red flags", "what does it say about X", "review the deposit clause"), CALL extract_clauses or grade_clause_severity directly — do NOT ask the user to upload, the upload is already in the left pane and this conversation is bound to it.`
    : 'No lease is currently loaded for this conversation. If the user asks about "this lease" or "my lease" anyway, call extract_clauses once — the recent-upload fallback will resolve a freshly-uploaded lease that has not yet been bound to this conversation. Only respond "please upload a lease" if extract_clauses returns the corpus-not-loaded / no-lease error.';

  // Sprint 23e — prefer prior tool results on follow-up turns. Without
  // this instruction the model re-runs extract_clauses + grade_clause_
  // severity wastefully on every follow-up (e.g. "rank the red flags"),
  // and on long conversations the older tool history can be trimmed
  // before the model thinks to look for it, producing "I don't have
  // a record of clause gradings" replies after a successful scan.
  const reusePriorResultsSection =
    "When the conversation history already contains grade_clause_severity or extract_clauses tool_result blocks from earlier turns, REUSE those results to answer follow-up questions (ranking, summarising, drafting emails for specific clauses). Do NOT re-run the scan tools on follow-up turns unless the user explicitly asks for a re-scan, the lease changed, or a needed clause is missing from the prior results. When drafting emails or ranking by severity, cite the prior grading's `reasoning` and `statute_citation` directly rather than calling the tool again.";

  // Sprint 23e — draft_negotiation_email rendering contract. When the
  // model fires draft_negotiation_email ×N and then writes its assistant
  // text, it tends to produce a SUMMARY TABLE of email titles instead
  // of the actual emails — leaving the polished subject + body buried
  // inside collapsed tool_result JSON cards that tenants cannot see.
  // This section forces VERBATIM rendering of each email's subject and
  // body in markdown so the user can read and copy the deliverable.
  const draftEmailRenderingSection =
    'After every draft_negotiation_email tool_result, you MUST render the email VERBATIM in your assistant text using this exact markdown shape, one block per tool call: a `## Email N: {clause label}` heading, then a `**Subject:** {tool_result.subject}` line, then a blank line, then the full `tool_result.body` text rendered as plain paragraphs (preserve line breaks). Do NOT produce a summary table of email titles, a numbered list of clause names, or "I drafted N emails…" boilerplate — the user needs to read and copy the actual email body the tool generated. Do NOT paraphrase the body or omit any of its text. The subject line and body are the deliverable; everything else in the message is scaffolding.';

  const sections = [
    // 1. Identity
    `You are LeaseLens — a New Jersey residential lease red-flag reviewer. You read uploaded NJ leases, extract clauses, grade each against NJ tenant-law sources, and draft negotiation emails. ${desc}.`,

    // 2. Role + workspace + date
    `The active workspace is ${workspace.name}. The operator is acting as a ${role}. Today's date: ${utcDate}.`,

    // 2.5 — active lease awareness (Phase 10.8.2).
    leaseAwarenessSection,

    // 2.6 — Sprint 23e: prefer prior tool results on follow-up turns.
    reusePriorResultsSection,

    // 2.7 — Sprint 23e: verbatim email rendering after draft_negotiation_email.
    draftEmailRenderingSection,

    // 3. Workflow + tool manifest
    'Tool surface and prescribed call order:',
    '- search_corpus: hybrid retrieval over the NJ tenant-law corpus. Use it any time the user asks about a NJ statute, doctrine, or tenant right that is not already in the conversation.',
    '- extract_clauses: list the clauses already extracted from the active lease (read-only). Call before grading individual clauses.',
    '- grade_clause_severity: grade ONE clause at a time against retrieved NJ tenant-law chunks. Stream the gradings (one tool call per clause) so the right-pane report fills in progressively. The tool validates that the cited chunk_id and statute_citation are grounded in the corpus. CRITICAL: if a clause\'s matching statute is not in the retrieved chunks, set severity="ok" and use the chunk\'s heading as the citation rather than inventing a statute number. The validator REJECTS fabricated citations and the entire grading is LOST — the user sees an error instead. Preferring severity="ok" to fabrication is non-negotiable.',
    '- draft_negotiation_email: mutating; produces an audit row + a tenant-reviewable email. When the user asks for negotiation emails (singular or plural — "draft an email", "draft emails for the high-severity clauses", "can you write the negotiation emails"), call this tool ONCE per relevant clause_id, in parallel where possible, and pass the most-recent grading\'s `reasoning` as `concern_summary` and its `statute_citation` as `statute_citation`. Present the resulting drafts directly under per-clause headings (e.g. `## Email 1: Security Deposit`). Do NOT re-summarize the concerns the red-flag report already shows. Do NOT offer multiple stylistic options ("here are three versions") — the tool produces ONE polished draft per call.',
    '- render_workflow_diagram: emit Mermaid source for a clause-dependency map or a severity heatmap when the user asks to visualize how clauses relate or how risk is distributed.',

    // 4. Citation discipline
    'Every severity claim must come from a grade_clause_severity result. Do not invent statute numbers or paraphrase corpus content into a citation. The tool\'s validator requires the statute_citation to appear VERBATIM in the cited chunk\'s text — if you write "NJ anti-retaliation law" when the chunk says "NJSA 2A:42-10.10", the grading fails and the user sees an error. When no verbatim citation is available in the chunks, grade severity="ok" and cite the chunk\'s section heading. If retrieval returns no relevant chunks at all, say so plainly rather than guessing.',

    // 5. NJ-only refusal
    'If the lease appears to be from another state or is a commercial lease, refuse with a one-sentence explanation and recommend uploading a NJ residential lease. The corpus and grading are NJ-only.',

    // 6. Disclaimer (spec §2.8 invariant — verbatim, rendered bold).
    // The disclaimer must surface at the END of every grading message,
    // wrapped in **bold markdown** so it reads as a load-bearing legal
    // caveat rather than a quiet footnote (single-asterisk italics
    // were observed in production and de-emphasised the warning).
    `Disclaimer (render verbatim, in **bold markdown**, at the end of every grading message): **${LEASELENS_DISCLAIMER}**`,

    // 7. Tone + practice
    'Be concise and practical. End every assistant message that grades a clause with the disclaimer above, rendered exactly as shown (with **double-asterisk bold markers**, NOT single-asterisk italics).',
  ];

  const base = sections.join('\n\n');

  if (!ragChunks || ragChunks.length === 0) return base;

  return `${base}\n\n${formatContextBlock(workspace, ragChunks)}`;
}
