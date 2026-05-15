import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('opens with the LeaseLens identity sentence (Sprint 13 §3h §1)', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt).toContain('LeaseLens');
    expect(prompt).toMatch(/NJ residential lease|New Jersey residential/i);
  });

  it('renders the LeaseLens role names directly (Tenant/Reviewer/Admin)', () => {
    expect(buildSystemPrompt('Tenant')).toMatch(/Tenant/);
    expect(buildSystemPrompt('Reviewer')).toMatch(/Reviewer/);
    expect(buildSystemPrompt('Admin')).toMatch(/Admin/);
  });

  it('includes the LEASELENS_DISCLAIMER string verbatim (spec §2.8 invariant)', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt.toLowerCase()).toContain('not legal advice');
    expect(prompt).toMatch(/attorney|legal[\s-]aid|clinic/);
  });

  it('names the LeaseLens tool surface and the prescribed call order', () => {
    const prompt = buildSystemPrompt('Tenant');
    // Three new tools surface in the prompt; old ContentOps tools do not.
    expect(prompt).toMatch(/extract_clauses/);
    expect(prompt).toMatch(/grade_clause_severity/);
    expect(prompt).toMatch(/draft_negotiation_email/);
    expect(prompt).not.toMatch(/schedule_content_item/);
    expect(prompt).not.toMatch(/approve_draft\b/);
  });

  it('refuses non-NJ leases (spec §2.7)', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt).toMatch(/New Jersey|NJ-only|NJ\b/);
    expect(prompt).toMatch(/refuse|decline/i);
  });

  it('includes a UTC date in YYYY-MM-DD format', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt).toMatch(/Today's date: \d{4}-\d{2}-\d{2}/);
  });

  it('produces different output for different roles', () => {
    const tenant = buildSystemPrompt('Tenant');
    const admin = buildSystemPrompt('Admin');
    expect(tenant).not.toBe(admin);
  });

  it('includes <context> block when chunks provided', () => {
    const mockChunks: RetrievedChunk[] = [
      {
        chunkId: 'brand-identity#section:0',
        documentSlug: 'brand-identity',
        heading: 'Brand Voice',
        content: 'We write like a knowledgeable friend.',
        rrfScore: 0.05,
        vectorRank: 1,
        bm25Rank: 1,
      },
    ];
    const prompt = buildSystemPrompt('Tenant', mockChunks);
    expect(prompt).toContain('<context>');
    expect(prompt).toContain('[1] brand-identity > Brand Voice');
  });

  it('omits <context> block when no chunks provided', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt).not.toContain('<context>');
  });

  it('parameterizes on a workspace via options-object signature (Sprint 11; Sprint 13 prose update)', () => {
    const prompt = buildSystemPrompt({
      role: 'Reviewer',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A test brand for measurement',
        is_sample: 0,
        created_at: 0,
        expires_at: 9_999_999_999,
      },
    });
    // Sprint 13 — workspace name appears in the active-workspace section.
    expect(prompt).toContain('The active workspace is Acme.');
    expect(prompt).toContain('A test brand for measurement.');
    expect(prompt).not.toContain('Side Quest Syndicate');
  });

  it('description normalization: trailing period in input does not double-period the output (sprint-QA L1)', () => {
    const withPeriod = buildSystemPrompt({
      role: 'Reviewer',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A demo brand.',
        is_sample: 0,
        created_at: 0,
        expires_at: null,
      },
    });
    const withoutPeriod = buildSystemPrompt({
      role: 'Reviewer',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A demo brand',
        is_sample: 0,
        created_at: 0,
        expires_at: null,
      },
    });
    // Both produce exactly one trailing period after the description sentence.
    // Sprint 13: the description appears in the LeaseLens identity sentence
    // (not as a "brand-onboarding" tagline).
    expect(withPeriod).toContain('A demo brand.');
    expect(withPeriod).not.toContain('A demo brand..');
    expect(withoutPeriod).toContain('A demo brand.');
    expect(withoutPeriod).not.toContain('A demo brand..');
  });

  it('mentions render_workflow_diagram and the LeaseLens diagram shapes (Sprint 13)', () => {
    const prompt = buildSystemPrompt('Tenant');
    expect(prompt).toMatch(/render_workflow_diagram/);
    // Sprint 13 §3f: LeaseLens repurposes the diagram tool for a clause-
    // dependency map and a severity heatmap.
    expect(prompt).toMatch(/clause|severity|heatmap|dependency/i);
  });

  // Sprint 23e — closes the "model forgets prior gradings on follow-up
  // turns" bug. The prompt must explicitly instruct the model to REUSE
  // grade_clause_severity / extract_clauses tool_result blocks already
  // in conversation history, and must carve out the explicit re-scan
  // case so users can still ask for a fresh pass.
  describe('Sprint 23e — prefer prior tool results on follow-ups', () => {
    it('instructs the model to REUSE prior tool_result blocks', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // Match either "reuse … prior … tool_result" or the more general
      // "reuse … prior … results" wording.
      expect(prompt).toMatch(/reuse.*prior.*(tool_result|results)/i);
    });

    it('carves out an explicit re-scan exception so re-runs still work', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // Match any of: "re-scan", "scan again", "lease changed", or
      // "user explicitly asks".
      expect(prompt).toMatch(
        /(re-scan|scan again|lease changed|user (?:asks|explicitly))/i,
      );
    });

    it('names the specific tools whose results should be reused', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // The reuse instruction calls out the two tools by name so the
      // model knows which prior results to look for.
      expect(prompt).toMatch(/grade_clause_severity/);
      expect(prompt).toMatch(/extract_clauses/);
    });
  });

  // Sprint 23f Phase 4 — supersedes the s23e.3 "render verbatim"
  // instruction. NegotiationEmailCard now renders each email's subject
  // and body inline with a Copy button; the assistant text should be a
  // concise summary that helps the user pick which to copy first, NOT
  // a duplicate of the email content.
  describe('Sprint 23f Phase 4 — concise summary after draft_negotiation_email', () => {
    it('forbids re-rendering the verbatim subject + body in assistant text', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // The flipped instruction says the cards are the deliverable —
      // the text must not re-render the verbatim email content.
      expect(prompt).toMatch(/must not re-render.*verbatim/i);
      expect(prompt).toMatch(/cards are the deliverable/i);
    });

    it('requires a concise ranked summary by priority/severity', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // The summary should be a concise ranked list.
      expect(prompt).toMatch(/concise summary/i);
      expect(prompt).toMatch(/ranked.*(priority|severity)|priority.*severity/i);
    });

    it('names the NegotiationEmailCard surface so the model knows the rendering exists', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      expect(prompt).toMatch(/NegotiationEmailCard/);
    });
  });

  // Sprint 23f Phase 4 — scan-complete summary uses a markdown table
  // with deterministic columns. Without this prescription the model
  // drifted between table and bulleted-list formats across runs.
  describe('Sprint 23f Phase 4 — scan-complete summary table format', () => {
    it('prescribes a markdown table with the canonical column set', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      // The four-column header (or close paraphrase) must be present
      // so the model has a concrete template.
      expect(prompt).toMatch(/markdown\s+table/i);
      expect(prompt).toMatch(/#\s*\|\s*Clause\s*\|\s*Issue\s*\|\s*Statute/i);
    });

    it('describes the sort order (severity then clause_index)', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      expect(prompt).toMatch(/sorted by severity/i);
      expect(prompt).toMatch(/clause_index|clause index/i);
    });

    it('requires OK + Ungraded lines and a Next steps bulleted block under the table', () => {
      const prompt = buildSystemPrompt({
        role: 'Tenant',
        activeLease: {
          id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 15,
        },
      });
      expect(prompt).toMatch(/\bOK\b/);
      expect(prompt).toMatch(/Ungraded/i);
      expect(prompt).toMatch(/Next steps/i);
    });
  });
});
