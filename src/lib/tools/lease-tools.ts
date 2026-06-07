// Sprint 13 §3b — three new tools that wrap the lease pipeline:
//
//   - extract_clauses        (read-only, ALL roles)
//   - grade_clause_severity  (read-only, ALL roles, RAG + Anthropic)
//   - draft_negotiation_email (mutating, ALL roles, audit + rollback)
//
// `draft_negotiation_email` uses the new `prepare` step on
// ToolDescriptor (added in Sprint 13) so the Anthropic call runs
// BEFORE the sync better-sqlite3 transaction. The transaction wraps
// only the `negotiation_emails` INSERT and the audit-row write — both
// land atomically per spec §2.4.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { env } from '@/lib/env';
import { assertLeaseOwnership } from '@/lib/lease/assert-lease-ownership';
import { type ClauseRow, getLease, listClauses } from '@/lib/lease/queries';
import { resolveLeaseId } from '@/lib/lease/resolve-lease-id';
import { logger } from '@/lib/log/logger';
import { type RetrievedChunk, retrieve } from '@/lib/rag/retrieve';
import type {
  MutationOutcome,
  ToolDescriptor,
  ToolExecutionContext,
} from './domain';

/**
 * Minimal shape of the Anthropic SDK we use here. Keeping this an
 * interface rather than importing `Anthropic` lets the unit tests pass
 * a stub without dragging the whole SDK type surface into the mock.
 */
export interface AnthropicLike {
  messages: {
    create: (args: unknown) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
}

const CLAUSE_TEXT_TRUNCATE = 1200;
const RETRIEVAL_K = 4;

function loadOwnedLease(
  db: Database.Database,
  leaseId: string,
  ctx: ToolExecutionContext,
) {
  const lease = getLease(db, leaseId, ctx.workspaceId);
  if (!lease) {
    throw new Error(`Lease ${leaseId} not found in active workspace`);
  }
  assertLeaseOwnership(lease, ctx);
  return lease;
}

function loadOwnedLeaseFromClauseId(
  db: Database.Database,
  clauseId: string,
  ctx: ToolExecutionContext,
): ClauseRow {
  const clause = db
    .prepare('SELECT * FROM clauses WHERE id = ? AND workspace_id = ?')
    .get(clauseId, ctx.workspaceId) as ClauseRow | undefined;
  if (!clause) {
    throw new Error(`Clause ${clauseId} not found in active workspace`);
  }
  loadOwnedLease(db, clause.lease_id, ctx);
  return clause;
}

// -----------------------------------------------------------------------------
// extract_clauses
// -----------------------------------------------------------------------------

export function createExtractClausesTool(
  db: Database.Database,
): ToolDescriptor {
  return {
    name: 'extract_clauses',
    description:
      'List the clauses already extracted from a lease PDF. Returns each clause with its index, classified type, page number, and a truncated text excerpt. Use this before grading individual clauses.',
    inputSchema: {
      type: 'object',
      properties: {
        lease_id: {
          type: 'string',
          description:
            'Lease id. Optional when the conversation has an active_lease_id; required when called via MCP.',
        },
      },
    },
    roles: 'ALL',
    category: 'lease',
    execute: async (input, ctx) => {
      const leaseId = resolveLeaseId(db, input, {
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        // Phase 10 hotfix F — chat path opts in to the recent-upload
        // fallback so a freshly-uploaded lease binds to a brand-new
        // conversation that hasn't seen extract_clauses yet. MCP path
        // (mcp/leaselens-server.ts) leaves this off per spec H5.
        enableRecentLeaseFallback: true,
      });
      const lease = loadOwnedLease(db, leaseId, ctx);
      const clauses = listClauses(db, leaseId, ctx.workspaceId);

      return {
        lease_id: leaseId,
        page_count: lease.page_count,
        clauses: clauses.map((c) => ({
          clause_id: c.id,
          clause_index: c.clause_index,
          clause_type: c.clause_type,
          text:
            c.text.length > CLAUSE_TEXT_TRUNCATE
              ? c.text.slice(0, CLAUSE_TEXT_TRUNCATE)
              : c.text,
          page_number: c.page_number,
        })),
      };
    },
  };
}

// -----------------------------------------------------------------------------
// grade_clause_severity
// -----------------------------------------------------------------------------

interface GradingPayload {
  severity: 'high' | 'medium' | 'low' | 'ok';
  statute_citation: string;
  chunk_id: string;
  reasoning: string;
  recommended_action: string;
}

const GRADING_INSTRUCTION = `
You are grading a single residential-lease clause against NJ tenant-law sources retrieved from the corpus. Output ONE JSON object — no commentary, no markdown fences, no leading text — with exactly these keys:

- severity:           "high" | "medium" | "low" | "ok"
- statute_citation:   A human-readable statute or case reference (e.g. "NJSA 46:8-21.2", "42 USC §3604(f)(3)(B)", "Marini v. Ireland, 56 N.J. 130 (1970)", "N.J. Const. Art. I, ¶9") that appears VERBATIM, character-for-character, in the cited chunk's CONTENT below. DO NOT use the bracketed chunk identifier (anything containing '#section:'). The chunk identifier goes in chunk_id, not here.

  **CRITICAL — anti-fabrication policy.** Before you commit a citation, search the chunk CONTENT for the exact string. If you cannot find a verbatim match (allowing only whitespace and case flex), DO NOT INVENT one. Examples of fabrication that the validator rejects: writing "NJ anti-retaliation law" when the chunk only contains "NJSA 2A:42-10.10"; writing "NJ Stat 46:8-9" when no such NJSA appears in any chunk; writing "common law" as the citation. Each rejection means the user sees an error instead of your grading — the whole grading is LOST.

  When no verbatim statute/case string matches: set severity to "ok" and set statute_citation to the chunk's section HEADING (e.g. "Late Fees on Rent — Marini v. Ireland, 56 N.J. 130 (1970); NJSA 56:8-1 et seq.") rather than fabricating. Choosing severity="ok" with a heading citation is ALWAYS preferable to fabrication.
- chunk_id:           The EXACT chunk identifier (e.g. "security-deposit-cap#section:1") copied from the bracketed prefix of the chunk you cite. No fabrication.
- reasoning:          A 200-400 character explanation of why the clause is graded as it is.
- recommended_action: A short next step the tenant could take.

If none of the chunks supports a clear grading, set severity to "ok" and statute_citation + chunk_id to a chunk that addresses the clause topic.`.trim();

function extractJsonBlock(text: string): string {
  // Models occasionally wrap JSON in code fences. Strip them and trim.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

function buildGradingPrompt(
  clauseText: string,
  retrieved: RetrievedChunk[],
): string {
  const chunkBlock = retrieved
    .map((c) => `[${c.chunkId}]: ${c.content}`)
    .join('\n\n');
  return `${GRADING_INSTRUCTION}

CLAUSE TEXT:
${clauseText}

RELEVANT NJ TENANT LAW (cite by the bracketed chunk_id):
${chunkBlock}`;
}

/*
 * Sprint 34.1 — humanise a corpus chunk-pointer into a domain-readable
 * label. The corpus convention is `slug-with-dashes#section:N` (e.g.
 * `late-fees-general#section:5`). We:
 *   - drop the `-general` suffix (top-level chunk marker, not a name);
 *   - capitalise the first word; keep the rest lower-case;
 *   - append the section number as `§N` so the user sees the source.
 * Examples:
 *   late-fees-general#section:5      → "Late fees (NJ tenant-law corpus, §5)"
 *   early-termination-general#section:4 → "Early termination (NJ tenant-law corpus, §4)"
 *   parking-and-storage#section:5    → "Parking and storage (NJ tenant-law corpus, §5)"
 * If the input doesn't match the canonical chunk-pointer pattern, return
 * it unchanged (defensive: future shapes shouldn't be silently mangled).
 */
const CHUNK_POINTER_RE = /^([a-z0-9-]+)#section:(\d+)$/;

// Sprint 34.2 — the slug words behind a chunk pointer, e.g.
// "attorneys-fees-clauses#section:1" → ["attorneys", "fees", "clauses"].
// Shared by humaniseChunkPointer (label form) and the D.2 title match so
// the slug→words rule lives in one place.
function chunkSlugWords(chunkId: string): string[] {
  const match = CHUNK_POINTER_RE.exec(chunkId);
  if (!match) return [];
  return match[1]
    .replace(/-general$/, '')
    .split('-')
    .filter(Boolean);
}

// Sprint 34.2 — normalise a citation/title to a comparable token stream:
// lowercase, collapse any non-alphanumeric run to a single space, trim.
function normaliseCitation(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Sprint 34.3 (E.1) — normalise a chunk body / citation for the grounding
// substring match: lowercase, strip markdown emphasis markers (*, _, `)
// — they're presentation, not content, and the corpus emphasises citations
// inconsistently (`**whole citation**` vs `*case name*,`) — then collapse
// whitespace. Stripping only REMOVES characters, so a citation newly
// matches ONLY when the sole difference was emphasis/whitespace; a citation
// genuinely absent from the body still fails.
function normaliseForGrounding(s: string): string {
  return s.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

function humaniseChunkPointer(chunkId: string): string {
  const match = CHUNK_POINTER_RE.exec(chunkId);
  if (!match) return chunkId;
  const words = chunkSlugWords(chunkId);
  if (words.length === 0) return chunkId;
  const phrase = words
    .map((w, i) => (i === 0 ? (w[0]?.toUpperCase() ?? '') + w.slice(1) : w))
    .join(' ');
  return `${phrase} (NJ tenant-law corpus, §${match[2]})`;
}

function validateGrading(
  raw: GradingPayload,
  retrieved: RetrievedChunk[],
): GradingPayload {
  const cited = retrieved.find((c) => c.chunkId === raw.chunk_id);
  // Sprint 34.0 — enrichment for the route-level `[chat-diag s32.2]`
  // log. The route catch site only sees the thrown error message; it
  // can't see the rejected citation, the cited chunk's heading, or a
  // peek at the chunk body. Emit a sibling `[chat-diag s32.2-reject]`
  // line here, gated on NODE_ENV like the route diagnostic, so the
  // grading-rejection failure mode is debuggable without rerunning.
  if (!cited) {
    logger.debug(
      {
        rejectedCitation: raw.statute_citation,
        citedChunkId: raw.chunk_id,
        rejectionReason: 'chunk_id_not_retrieved',
      },
      'grade.citation_rejected',
    );
    throw new Error(
      `grade_clause_severity: cited chunk_id "${raw.chunk_id}" was not in the retrieved set — citation not grounded in corpus.`,
    );
  }

  // Sprint 34.1 — chunk-pointer canonicalisation. The Sprint 34.0
  // diagnostic showed ~75% of rejections are this pattern: the model
  // passes the chunk_id literally as `statute_citation`. The chunk_id
  // is already validated against the retrieved set above, so this IS
  // a grounded reference — just in the wrong form. Accept and rewrite
  // the citation to a humanised, domain-readable label so the right-
  // pane card surfaces something meaningful (e.g. "Late fees (NJ
  // tenant-law corpus, §5)") instead of the raw chunk identifier.
  //
  // Sprint 34.2 (D.1) — generalised from `=== chunk_id` to
  // `includes(chunk_id)`: the model also wraps the pointer in a label
  // (e.g. "Early Termination — early-termination-general#section:1").
  // The chunk_id (slug#section:N) won't occur coincidentally in a real
  // statute string, so an includes-match is still a grounded chunk
  // reference. Exact match is a subset → behaviour-preserving for 34.1.
  if (raw.statute_citation.includes(raw.chunk_id)) {
    return { ...raw, statute_citation: humaniseChunkPointer(raw.chunk_id) };
  }

  // Sprint 34.1 — concatenated multi-statute citation. When the model
  // joins multiple statute strings with `;`, ` & `, or ` and `, accept
  // if ANY part appears verbatim in the chunk body. Canonicalise the
  // stored citation to the first matching part so the card shows the
  // grounded portion, not the concatenated soup.
  // Sprint 34.2 (D.3) — also split on a whitespace-bounded dash (em `—`,
  // en `–`, or spaced hyphen ` - `), so a "Label — NJSA …" concatenation
  // isolates the grounded statute part. Spaces on BOTH sides are required
  // so intra-token hyphens (NJSA 56:8-1, repair-and-deduct) are untouched.
  const parts = raw.statute_citation
    .split(/\s*[;&]\s*|\s+(?:and|[—–-])\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  // Sprint 34.3 — the citation is grounded if a part appears (modulo
  // markdown emphasis + whitespace, per normaliseForGrounding — E.1) in the
  // body of ANY chunk the model was shown (E.2), not only the labeled one.
  // Try the cited chunk first (preferred attribution), then the rest; on a
  // cross-chunk hit, re-point chunk_id to where the evidence actually lives.
  const orderedChunks = [
    cited,
    ...retrieved.filter((c) => c.chunkId !== cited.chunkId),
  ];
  for (const chunk of orderedChunks) {
    const haystack = normaliseForGrounding(chunk.content);
    for (const part of parts) {
      const needle = normaliseForGrounding(part);
      // `needle &&` guards against a part that is only emphasis/whitespace
      // normalising to '' (includes('') is always true) — a false accept.
      if (needle && haystack.includes(needle)) {
        // Single-part match → citation unchanged; multi-part → canonicalise
        // to the matched part; cross-chunk → re-point chunk_id.
        const citation = parts.length === 1 ? raw.statute_citation : part;
        return { ...raw, statute_citation: citation, chunk_id: chunk.chunkId };
      }
    }
  }

  // Sprint 34.2 (D.2) — de-slugged chunk title. The model sometimes cites
  // the chunk by its own NAME (the de-slugged chunk_id, e.g. "Attorneys'
  // Fees Clauses") rather than verbatim statute text. That still refers to
  // the already-validated cited chunk, so accept and canonicalise to the
  // humanised label. EXACT normalised equality only — a partial or looser
  // match falls through to rejection so a fabricated citation can't sneak
  // in by coincidentally overlapping the slug words.
  const slugPhrase = chunkSlugWords(raw.chunk_id).join(' ');
  if (
    slugPhrase &&
    normaliseCitation(raw.statute_citation) === normaliseCitation(slugPhrase)
  ) {
    return { ...raw, statute_citation: humaniseChunkPointer(raw.chunk_id) };
  }

  logger.debug(
    {
      rejectedCitation: raw.statute_citation,
      citedChunkId: raw.chunk_id,
      chunkHeading: cited.heading ?? null,
      chunkBodyLength: cited.content.length,
      rejectionReason: 'citation_not_in_body',
    },
    'grade.citation_rejected',
  );
  throw new Error(
    `grade_clause_severity: statute_citation "${raw.statute_citation}" does not appear in the cited chunk's text — citation not grounded.`,
  );
}

export function createGradeClauseSeverityTool(
  db: Database.Database,
  anthropic: AnthropicLike,
): ToolDescriptor {
  return {
    name: 'grade_clause_severity',
    description:
      'Grade a single lease clause against NJ tenant law. Returns severity (high/medium/low/ok), a verifiable statute citation, the supporting chunk_id, plain-English reasoning, and a recommended next step. Call after extract_clauses.',
    inputSchema: {
      type: 'object',
      properties: {
        clause_id: {
          type: 'string',
          description:
            'The clause_id returned by extract_clauses for the clause to grade.',
        },
      },
      required: ['clause_id'],
    },
    roles: 'ALL',
    category: 'lease',
    execute: async (input, ctx) => {
      const clauseId = String(input.clause_id ?? '');
      if (!clauseId) {
        throw new Error('grade_clause_severity: clause_id is required');
      }
      const clause = loadOwnedLeaseFromClauseId(db, clauseId, ctx);

      const retrieved = await retrieve(clause.text, db, {
        workspaceId: ctx.workspaceId,
        maxResults: RETRIEVAL_K,
      });

      if (retrieved.length === 0) {
        // Distinguish "corpus is empty for this workspace" (a setup/seed
        // problem the user can fix) from "corpus is loaded but the
        // retriever didn't match this clause" (a query/coverage issue).
        // Phase 10.7 — surface the actionable hint when applicable.
        const corpusSize =
          (
            db
              .prepare(
                'SELECT COUNT(*) AS n FROM chunks WHERE workspace_id = ?',
              )
              .get(ctx.workspaceId) as { n: number } | undefined
          )?.n ?? 0;
        if (corpusSize === 0) {
          throw new Error(
            'grade_clause_severity: NJ tenant-law corpus is not loaded in this workspace. Run `npm run db:seed` (or restart the dev server — predev auto-seeds).',
          );
        }
        throw new Error(
          `grade_clause_severity: no NJ tenant-law chunks matched clause ${clauseId} (corpus has ${corpusSize} chunks but none retrieved for this query).`,
        );
      }

      const response = await anthropic.messages.create({
        model: env.LEASELENS_ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: buildGradingPrompt(clause.text, retrieved),
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const rawText = textBlock?.text ?? '';
      const jsonText = extractJsonBlock(rawText);
      const parsed = JSON.parse(jsonText) as GradingPayload;
      const validated = validateGrading(parsed, retrieved);

      // Sprint 24.1 — persist the validated severity back to the
      // clauses row. This is the source of truth the cockpit
      // SeverityDistribution panel reads from. The write happens
      // AFTER validation so a failed citation grounding never poisons
      // the clauses table with an unverified grade. Idempotent: a
      // re-grade overwrites the prior severity in place.
      db.prepare(
        `UPDATE clauses SET severity = ? WHERE id = ? AND workspace_id = ?`,
      ).run(validated.severity, clauseId, ctx.workspaceId);

      return {
        clause_id: clauseId,
        clause_type: clause.clause_type,
        clause_index: clause.clause_index,
        page_number: clause.page_number,
        severity: validated.severity,
        statute_citation: validated.statute_citation,
        chunk_id: validated.chunk_id,
        reasoning: validated.reasoning,
        recommended_action: validated.recommended_action,
      };
    },
  };
}

// -----------------------------------------------------------------------------
// draft_negotiation_email (mutating + prepare)
// -----------------------------------------------------------------------------

interface DraftPayload {
  subject: string;
  body: string;
}

interface DraftPrepared extends DraftPayload {
  clauseId: string;
  tone: 'polite' | 'firm' | 'formal';
  clause: ClauseRow;
}

// Phase 10.8 — tenant-friendly template, baked-in few-shot from the
// operator's gold-standard example. Goal: the model produces a single
// polished, ready-to-edit draft rather than legalistic boilerplate or
// "here are three options" output. The agent is responsible for
// passing concern_summary + statute_citation from the most-recent
// grade_clause_severity result so the email is grounded in the actual
// concern, not a generic framing.
const DRAFT_INSTRUCTION = (
  tone: 'polite' | 'firm' | 'formal',
  concernSummary: string | null,
  statuteCitation: string | null,
) => {
  const toneGuidance =
    tone === 'firm'
      ? 'Direct but respectful — the tenant has a clear ask and is not negotiating on the principle, only on the language. Avoid hedging like "I was wondering if maybe", but stay collaborative. Never aggressive or threatening.'
      : tone === 'formal'
        ? 'Slightly more reserved than "polite". Use "Dear" instead of "Hi". Still warm and collaborative.'
        : 'Warm, soft, and collaborative. The tenant is asking, not demanding. Use phrases like "wanted to ask about", "would you be open to", "I appreciate".';

  const concernBlock = concernSummary
    ? `\nCONCERN SUMMARY (incorporate this into the email body, paraphrased gently — NEVER copy verbatim if it contains words like "violates" / "unenforceable"):\n${concernSummary}`
    : '\nNo concern summary was provided. Read the clause text yourself and identify the most concerning aspect in plain English.';

  const citationBlock = statuteCitation
    ? `\nSTATUTE CITATION (cite informally with soft framing like "My understanding is that New Jersey ... per ${statuteCitation}." NEVER assert "the clause violates X"; the tenant is not a lawyer):\n${statuteCitation}`
    : '\nNo statute citation provided. Do NOT fabricate one. Frame the concern in plain English without legal claims.';

  return `You are drafting a single negotiation email from a NJ tenant to their landlord about ONE specific lease clause. The tenant is reviewing the lease BEFORE signing and wants to ask for a revision politely. Tone: ${tone}. ${toneGuidance}

Output ONE JSON object — no commentary, no markdown fences, no leading or trailing prose — with exactly:

- subject: action-oriented and specific, under 80 characters (e.g. "Request to Revise Security Deposit Language").
- body: a complete, ready-to-edit email of 150–300 words, structured as:
  1. Greeting: "Hi [Landlord Name]," (literal placeholder — DO NOT invent a name).
  2. Gracious opening (one sentence): something like "Thank you for sending over the lease. I reviewed the [topic] section and wanted to ask about one part before signing."
  3. Plain-English description of the concern incorporating the CONCERN SUMMARY below.
  4. Soft legal framing IF a statute citation is provided: "My understanding is that New Jersey [summary of the rule] per [citation]." NEVER write "the clause violates X" or "this is unenforceable" — the tenant is not asserting law.
  5. Specific requested change: "Would you be open to revising this section so that [concrete edit]?"
  6. Collaborative closing: "I am happy to move forward once this section is updated. I appreciate your help and just want to make sure the lease language is clear for both sides."
  7. Sign-off: "Best,\\n[Your Name]" (literal placeholder).

Forbidden phrases: "I demand", "you must", "violates", "unenforceable", "illegal", "we need to", "you cannot". Forbidden patterns: bullet lists in the email body; threats; legal citations dropped without "My understanding is..." softening; multiple alternative drafts; productivity preambles like "Here is your draft:". The body MUST be flowing prose paragraphs. Use real newlines (\\n) inside the JSON string for paragraph breaks.
${concernBlock}${citationBlock}

EXAMPLE (gold standard — match this style and length):
{"subject": "Request to Revise Security Deposit Language", "body": "Hi [Landlord Name],\\n\\nThank you for sending over the lease. I reviewed the security deposit section and wanted to ask about one part before signing.\\n\\nThe lease currently states that the deposit is $4,800, which appears to equal two months of rent. My understanding is that New Jersey generally limits residential security deposits to one and a half months' rent. Would you be open to revising this section so the deposit matches the legal limit and clarifies that any required interest will be handled according to New Jersey law?\\n\\nI am happy to move forward once this section is updated. I appreciate your help and just want to make sure the lease language is clear for both sides.\\n\\nBest,\\n[Your Name]"}

Return ONLY the JSON object.`;
};

const ALLOWED_TONES = new Set(['polite', 'firm', 'formal'] as const);
type ToneLiteral = typeof ALLOWED_TONES extends Set<infer T> ? T : never;

function normalizeTone(input: unknown): ToneLiteral {
  const t = String(input ?? 'polite');
  return ALLOWED_TONES.has(t as ToneLiteral) ? (t as ToneLiteral) : 'polite';
}

export function createDraftNegotiationEmailTool(
  db: Database.Database,
  anthropic: AnthropicLike,
): ToolDescriptor {
  return {
    name: 'draft_negotiation_email',
    description:
      'Draft a negotiation email from the tenant to the landlord about a single lease clause. Mutating: writes a negotiation_emails row and an audit log entry. Returns the subject and body the tenant can review and send.',
    inputSchema: {
      type: 'object',
      properties: {
        clause_id: {
          type: 'string',
          description:
            'The clause_id (from extract_clauses) the email negotiates.',
        },
        tone: {
          type: 'string',
          enum: ['polite', 'firm', 'formal'],
          description: 'Tone of the email. Defaults to "polite".',
        },
        concern_summary: {
          type: 'string',
          description:
            'A 1-2 sentence plain-English explanation of why this clause is concerning. Pass the `reasoning` field from the most-recent grade_clause_severity result for this clause if available — the email will be grounded in the specific concern instead of generic framing.',
        },
        statute_citation: {
          type: 'string',
          description:
            'Optional grounded statute reference (e.g. "NJ Stat 46:8-19"). Pass the `statute_citation` field from grade_clause_severity if it was citation-grounded. Leave empty otherwise — DO NOT fabricate.',
        },
      },
      required: ['clause_id'],
    },
    roles: ['Tenant', 'Reviewer', 'Admin'],
    category: 'lease',

    // Async pre-step: ownership check + Anthropic call. Runs BEFORE the
    // sync transaction. Throws here propagate out with no DB write.
    prepare: async (input, ctx): Promise<DraftPrepared> => {
      const clauseId = String(input.clause_id ?? '');
      if (!clauseId) {
        throw new Error('draft_negotiation_email: clause_id is required');
      }
      const tone = normalizeTone(input.tone);
      const clause = loadOwnedLeaseFromClauseId(db, clauseId, ctx);

      // Phase 10.8 — concern + citation are optional but improve
      // grounding dramatically. Trim/normalize to defensive defaults
      // so the prompt branch stays simple.
      const concernSummary =
        typeof input.concern_summary === 'string' &&
        input.concern_summary.trim().length > 0
          ? input.concern_summary.trim()
          : null;
      const statuteCitation =
        typeof input.statute_citation === 'string' &&
        input.statute_citation.trim().length > 0 &&
        // Reject the chunk_id format if the agent confuses fields.
        !input.statute_citation.includes('#section:')
          ? input.statute_citation.trim()
          : null;

      const response = await anthropic.messages.create({
        model: env.LEASELENS_ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `${DRAFT_INSTRUCTION(tone, concernSummary, statuteCitation)}

CLAUSE TEXT:
${clause.text}`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const rawText = textBlock?.text ?? '';
      const jsonText = extractJsonBlock(rawText);
      const parsed = JSON.parse(jsonText) as DraftPayload;
      if (!parsed.subject || !parsed.body) {
        throw new Error(
          'draft_negotiation_email: model response missing subject or body',
        );
      }

      return {
        clauseId,
        tone,
        clause,
        subject: parsed.subject,
        body: parsed.body,
      };
    },

    // Sync: INSERT + return MutationOutcome. The registry wraps this in
    // db.transaction() with the audit-row insert, so both land atomically
    // (or neither does).
    execute: (_input, ctx, prepared): MutationOutcome => {
      const draft = prepared as DraftPrepared;
      const id = randomUUID();
      db.prepare(
        `INSERT INTO negotiation_emails
           (id, clause_id, workspace_id, tone, subject, body, drafted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        draft.clauseId,
        ctx.workspaceId,
        draft.tone,
        draft.subject,
        draft.body,
        ctx.userId,
        Math.floor(Date.now() / 1000),
      );

      return {
        result: {
          email_id: id,
          clause_id: draft.clauseId,
          tone: draft.tone,
          subject: draft.subject,
          body: draft.body,
        },
        compensatingActionPayload: { email_id: id },
      };
    },

    compensatingAction: (payload) => {
      const id = String(payload.email_id ?? '');
      if (!id) return;
      db.prepare('DELETE FROM negotiation_emails WHERE id = ?').run(id);
    },
  };
}
