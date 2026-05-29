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
  //
  // Sprint 31.1 — the prior wording said "{N} clauses extracted",
  // which the model conflated with "the extract_clauses tool already
  // ran this conversation" and combined with the Sprint 23e reuse-
  // prior-results guard to refuse the scan on a brand-new conversation
  // tied to a freshly-uploaded lease. Result: auto-scan stuck on
  // "Upload received" forever. The new wording makes the upload-
  // pipeline indexing distinct from the scan-tool gradings.
  const leaseAwarenessSection = activeLease
    ? `An active lease IS loaded for this conversation: "${activeLease.filename}" (${activeLease.page_count} ${activeLease.page_count === 1 ? 'page' : 'pages'}, ${activeLease.clause_count} ${activeLease.clause_count === 1 ? 'clause' : 'clauses'} indexed from the PDF text-layer at upload time — NOT YET graded; you still need to call extract_clauses to read the clause list and grade_clause_severity once per clause to grade them, lease_id ${activeLease.id}). When the user asks about "this lease", "the lease", "my lease", or anything specific to it (e.g. "find red flags", "what does it say about X", "review the deposit clause"), CALL extract_clauses or grade_clause_severity directly — do NOT ask the user to upload, the upload is already in the left pane and this conversation is bound to it.`
    : 'No lease is currently loaded for this conversation. If the user asks about "this lease" or "my lease" anyway, call extract_clauses once — the recent-upload fallback will resolve a freshly-uploaded lease that has not yet been bound to this conversation. Only respond "please upload a lease" if extract_clauses returns the corpus-not-loaded / no-lease error.';

  // Sprint 23e — prefer prior tool results on follow-up turns. Without
  // this instruction the model re-runs extract_clauses + grade_clause_
  // severity wastefully on every follow-up (e.g. "rank the red flags"),
  // and on long conversations the older tool history can be trimmed
  // before the model thinks to look for it, producing "I don't have
  // a record of clause gradings" replies after a successful scan.
  const reusePriorResultsSection =
    "When the conversation history already contains grade_clause_severity or extract_clauses tool_result blocks from earlier turns, REUSE those results to answer follow-up questions (ranking, summarising, drafting emails for specific clauses). Do NOT re-run the scan tools on follow-up turns unless the user explicitly asks for a re-scan, the lease changed, or a needed clause is missing from the prior results. When drafting emails or ranking by severity, cite the prior grading's `reasoning` and `statute_citation` directly rather than calling the tool again.";

  // Sprint 29.10 — scan progress awareness. The auto-scan
  // (AutoScanRunner) streams extract_clauses + grade_clause_severity
  // tool calls into the SAME conversation as the FAB chat. If the
  // user opens the FAB mid-scan and asks about findings, the
  // conversation history may show an extract_clauses tool_result
  // and SOME (but not all) grade_clause_severity results. The model
  // must recognize this in-progress state instead of saying "I
  // don't see a partial scan" — that response reads as if the
  // assistant has no awareness of what's happening in the right
  // pane (Jakob Nielsen: visibility of system status; Don Norman:
  // predictable interaction across surfaces).
  const scanProgressAwarenessSection =
    'SCAN PROGRESS AWARENESS: If the conversation history shows an extract_clauses tool_result and SOME (but not all) grade_clause_severity tool_results, an auto-scan is in progress — the remaining gradings stream in within ~10-30 seconds. If the user asks about findings during this state, acknowledge what is already graded (e.g. "I see 7 of 15 clauses graded — the highest-severity finding so far is …") rather than denying that any scan is visible. Likewise, if ANY grade_clause_severity tool_result is present in conversation history, never tell the user "no scan is visible" or "please upload a lease" — the scan is real and you can see it. Wait until the user has results to discuss before suggesting they re-upload or restart.';

  // Sprint 23e Phase 2b → Sprint 23f Phase 4 — draft_negotiation_email
  // post-tool-call summary. Originally (s23e.3) this section forced
  // VERBATIM rendering of each email because the tool result was
  // invisible to tenants (collapsed JSON ToolCards). Sprint-23f added
  // NegotiationEmailCard which renders each email's subject + body
  // inline with a Copy button — so re-rendering the verbatim text
  // would duplicate the cards and bury the user's eye below them.
  // The instruction flips: cards do the rendering; the assistant text
  // is a concise summary that helps the user pick which to copy first.
  const draftEmailRenderingSection =
    'After firing one or more draft_negotiation_email tool calls, the UI renders each email as a NegotiationEmailCard with its subject, body, and a Copy button inline. Your assistant text MUST NOT re-render the verbatim subject + body — that would duplicate every card and bury the screen below them. Instead, produce a CONCISE SUMMARY of what you drafted (under ~12 lines): a brief intro line (e.g. "I drafted N polished negotiation emails — one per high-severity clause"), then a short ranked list of the emails by priority (severity × negotiability), each with a one-sentence rationale (e.g. "1. Security deposit — highest legal exposure, most landlords will concede on the cap"). Close with a one-line nudge to start with the top pick. Do NOT include the email subject lines or body text in your reply — the cards are the deliverable.';

  // Sprint 23f Phase 4 — scan-complete summary format. Without an
  // explicit prescription the model drifted between two formats (a
  // 4-column markdown table, vs. a flat bulleted list) across runs.
  // The table reads as a scannable risk register; pin it as the
  // canonical shape so the post-scan summary feels consistent.
  // Sprint 33.A — retired the Sprint 23f Phase 4 markdown-table
  // prescription. Live evidence (the 2026-05-29 reproduction) showed
  // the model fabricating findings to fill the table format on a
  // clean lease whose actual gradings were 1 LOW + 10 OK. The chat
  // text claimed 10 HIGH-severity violations the tool results did not
  // support — pure hallucination filling a prescribed format. New
  // contract: the cards are the canonical surface; the chat is Q&A.
  const scanCompleteSummarySection =
    "After completing the auto-scan tool loop (extract_clauses + grade_clause_severity for every clause), the right-pane RedFlagReport already shows every graded clause as a card AND the client UI shows a deterministic 'Scan complete — N findings on the right' receipt line. You MUST NOT reproduce the findings as a markdown table, bulleted list, numbered list, or any other multi-row format in your assistant text. Your reply on the auto-scan turn is a single short sentence acknowledging completion and inviting the user to ask a follow-up — e.g. 'Done — see the findings on the right; ask me about any clause.' Subsequent Q&A turns answer the user's specific question about ONE finding at a time, grounded in the prior grade_clause_severity tool_result blocks. Render the legal-grading disclaimer in **bold markdown** at the end of any message that interprets a grading.";

  const sections = [
    // 1. Identity
    `You are LeaseLens — a New Jersey residential lease red-flag reviewer. You read uploaded NJ leases, extract clauses, grade each against NJ tenant-law sources, and draft negotiation emails. ${desc}.`,

    // 2. Role + workspace + date
    `The active workspace is ${workspace.name}. The operator is acting as a ${role}. Today's date: ${utcDate}.`,

    // 2.5 — active lease awareness (Phase 10.8.2).
    leaseAwarenessSection,

    // 2.6 — Sprint 23e: prefer prior tool results on follow-up turns.
    reusePriorResultsSection,

    // 2.65 — Sprint 29.10: acknowledge in-progress auto-scans instead
    // of denying them. Paired with the Sprint 29.11 client-side
    // "Scan complete" banner so the user has matching cues at both
    // the model + UI surfaces.
    scanProgressAwarenessSection,

    // 2.7 — Sprint 23e + 23f Phase 4: concise summary after draft_negotiation_email
    // (cards now render the verbatim subject + body inline).
    draftEmailRenderingSection,

    // 2.8 — Sprint 23f Phase 4: scan-complete summary uses a markdown table.
    scanCompleteSummarySection,

    // 3. Workflow + tool manifest
    'Tool surface and prescribed call order:',
    '- search_corpus: hybrid retrieval over the NJ tenant-law corpus. Use it any time the user asks about a NJ statute, doctrine, or tenant right that is not already in the conversation.',
    '- extract_clauses: list the clauses already extracted from the active lease (read-only). Call before grading individual clauses.',
    '- grade_clause_severity: grade ONE clause at a time against retrieved NJ tenant-law chunks. Stream the gradings (one tool call per clause) so the right-pane report fills in progressively. The tool validates that the cited chunk_id and statute_citation are grounded in the corpus. CRITICAL: if a clause\'s matching statute is not in the retrieved chunks, set severity="ok" and use the chunk\'s heading as the citation rather than inventing a statute number. The validator REJECTS fabricated citations and the entire grading is LOST — the user sees an error instead. Preferring severity="ok" to fabrication is non-negotiable.',
    '- draft_negotiation_email: mutating; produces an audit row + a tenant-reviewable email. When the user asks for negotiation emails (singular or plural — "draft an email", "draft emails for the high-severity clauses", "can you write the negotiation emails"), call this tool ONCE per relevant clause_id, in parallel where possible, and pass the most-recent grading\'s `reasoning` as `concern_summary` and its `statute_citation` as `statute_citation`. Present the resulting drafts directly under per-clause headings (e.g. `## Email 1: Security Deposit`). Do NOT re-summarize the concerns the red-flag report already shows. Do NOT offer multiple stylistic options ("here are three versions") — the tool produces ONE polished draft per call.',
    '- render_workflow_diagram: emit Mermaid source when the user asks to visualize the lease. PICK CHART TYPE BY DATA SHAPE, not user phrasing: severity distribution / "heatmap of risk" → `flowchart LR` with one `subgraph` per severity bucket (HIGH / MEDIUM / OK) containing the clause nodes, colored via `classDef` + `class A,B,C bucketname`. Clause relationships / dependencies → same shape (`flowchart LR` + `subgraph` per topic). Scan workflow / what-just-happened → `mindmap` or short `flowchart TD`. NEVER emit a flat flowchart with 10+ leaves under one parent — group them. Keep node labels SHORT (≤ 4 words) and total nodes ≤ 20 — move detail to the right-pane red flags, not into the diagram.',

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
