// Sprint 13 §3b — three new tools wrapping the lease pipeline:
//   extract_clauses (read-only, ALL roles)
//   grade_clause_severity (read-only, ALL roles, uses Anthropic + RAG)
//   draft_negotiation_email (mutating + audit + rollback, ALL roles)
//
// The tests inject a fake Anthropic client so they remain hermetic and
// deterministic. The chunk_id + statute_citation groundedness checks
// (spec §2.6) are exercised against a seeded corpus chunk.

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertClause, insertLease } from '@/lib/lease/queries';
import { createTestDb } from '@/lib/test/db';
import { seedChunk, seedDocument } from '@/lib/test/seed';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import type { ToolExecutionContext } from './domain';
import {
  type AnthropicLike,
  createDraftNegotiationEmailTool,
  createExtractClausesTool,
  createGradeClauseSeverityTool,
} from './lease-tools';

vi.mock('@/lib/rag/embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

const TENANT_ID = 'u-tenant';
const REVIEWER_ID = 'u-reviewer';

function seedWorkspace(db: Database.Database): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    now,
  );
}

function seedTenantLawCorpusChunk(db: Database.Database): string {
  const docId = seedDocument(db, 'security-deposit-cap');
  const chunkId = 'security-deposit-cap#section:1';
  seedChunk(db, docId, {
    id: chunkId,
    content:
      'Under New Jersey law, a residential landlord may not collect a security deposit greater than one and one-half (1.5) times the monthly rent. NJ Stat 46:8-21.2 sets the cap.',
    index: 1,
    level: 'section',
  });
  return chunkId;
}

function seedSampleLease(
  db: Database.Database,
  uploadedBy = TENANT_ID,
): { leaseId: string; clauseId: string } {
  const leaseId = insertLease(db, {
    workspaceId: SAMPLE_WORKSPACE.id,
    filename: 'sample.pdf',
    textExtract: 'full lease text',
    pageCount: 2,
    uploadedBy,
  });
  insertClause(db, {
    leaseId,
    workspaceId: SAMPLE_WORKSPACE.id,
    clauseIndex: 0,
    clauseType: 'security_deposit',
    text: 'Tenant shall provide a security deposit equal to two months rent at lease execution.',
    pageNumber: 1,
  });
  const clauseId = (
    db.prepare('SELECT id FROM clauses WHERE lease_id = ?').get(leaseId) as {
      id: string;
    }
  ).id;
  return { leaseId, clauseId };
}

function ctx(
  role: 'Tenant' | 'Reviewer' | 'Admin',
  userId: string,
): ToolExecutionContext {
  return {
    role,
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    conversationId: 'conv-test',
  };
}

function buildAnthropicMock(text: string): AnthropicLike {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
      }),
    },
  };
}

describe('extract_clauses tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedWorkspace(db);
  });

  it('returns clauses for the active lease', async () => {
    const { leaseId } = seedSampleLease(db);
    const tool = createExtractClausesTool(db);

    const result = (await tool.execute(
      { lease_id: leaseId },
      ctx('Tenant', TENANT_ID),
    )) as { lease_id: string; page_count: number; clauses: unknown[] };

    expect(result.lease_id).toBe(leaseId);
    expect(result.page_count).toBe(2);
    expect(result.clauses).toHaveLength(1);
    expect((result.clauses[0] as { clause_type: string }).clause_type).toBe(
      'security_deposit',
    );
  });

  it('truncates clause text to 1200 chars in the result envelope (spec §3b)', async () => {
    const longText = 'x'.repeat(2000);
    const leaseId = insertLease(db, {
      workspaceId: SAMPLE_WORKSPACE.id,
      filename: 's.pdf',
      textExtract: 'x',
      pageCount: 1,
      uploadedBy: TENANT_ID,
    });
    insertClause(db, {
      leaseId,
      workspaceId: SAMPLE_WORKSPACE.id,
      clauseIndex: 0,
      clauseType: 'unknown',
      text: longText,
      pageNumber: 1,
    });

    const tool = createExtractClausesTool(db);
    const result = (await tool.execute(
      { lease_id: leaseId },
      ctx('Tenant', TENANT_ID),
    )) as { clauses: { text: string }[] };

    expect(result.clauses[0].text.length).toBeLessThanOrEqual(1200);
  });

  it('throws when Tenant tries to access a lease they did not upload (spec §2.12)', async () => {
    const { leaseId } = seedSampleLease(db, REVIEWER_ID);
    const tool = createExtractClausesTool(db);

    await expect(
      tool.execute({ lease_id: leaseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow(/own|tenant|access/i);
  });

  it('Reviewer can extract clauses from any lease in the workspace', async () => {
    const { leaseId } = seedSampleLease(db, TENANT_ID);
    const tool = createExtractClausesTool(db);

    const result = (await tool.execute(
      { lease_id: leaseId },
      ctx('Reviewer', REVIEWER_ID),
    )) as { lease_id: string };

    expect(result.lease_id).toBe(leaseId);
  });
});

describe('grade_clause_severity tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedWorkspace(db);
  });

  it('returns a graded clause when the LLM cites a live chunk and a substring statute', async () => {
    const chunkId = seedTenantLawCorpusChunk(db);
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({
        severity: 'high',
        statute_citation: 'NJ Stat 46:8-21.2',
        chunk_id: chunkId,
        reasoning:
          'Two months rent exceeds the 1.5-month statutory cap on security deposits.',
        recommended_action: 'Negotiate the deposit down to 1.5 months rent.',
      }),
    );
    const tool = createGradeClauseSeverityTool(db, anthropic);

    const result = (await tool.execute(
      { clause_id: clauseId },
      ctx('Tenant', TENANT_ID),
    )) as { severity: string; chunk_id: string };

    expect(result.severity).toBe('high');
    expect(result.chunk_id).toBe(chunkId);
  });

  it('throws when the LLM cites a chunk_id not in the retrieved set (spec §2.6)', async () => {
    seedTenantLawCorpusChunk(db);
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({
        severity: 'high',
        statute_citation: 'NJ Stat 46:8-21.2',
        chunk_id: 'fabricated#chunk:99',
        reasoning: 'reasoning',
        recommended_action: 'action',
      }),
    );
    const tool = createGradeClauseSeverityTool(db, anthropic);

    await expect(
      tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow(/chunk|grounded|cite/i);
  });

  it('throws when the statute_citation does not appear in the cited chunk text (spec §2.6)', async () => {
    const chunkId = seedTenantLawCorpusChunk(db);
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({
        severity: 'high',
        // The cited chunk's text mentions "NJ Stat 46:8-21.2" but the
        // model's citation here is a different statute that doesn't
        // appear there.
        statute_citation: 'NJ Stat 99:99-99 (fabricated)',
        chunk_id: chunkId,
        reasoning: 'reasoning',
        recommended_action: 'action',
      }),
    );
    const tool = createGradeClauseSeverityTool(db, anthropic);

    await expect(
      tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow(/statute|citation|grounded/i);
  });

  it('throws when the LLM returns malformed JSON', async () => {
    seedTenantLawCorpusChunk(db);
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock('not json at all');
    const tool = createGradeClauseSeverityTool(db, anthropic);

    await expect(
      tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow();
  });

  // Sprint 34.1 — citation-grounding robustness. The validator
  // previously rejected (a) chunk_id-form citations (e.g.
  // "late-fees-general#section:5") even when the model correctly
  // identified the chunk via chunk_id, and (b) concatenated multi-
  // statute citations where one part DID appear in the body. Both
  // patterns are legitimate grounding — the model's wording is just
  // off. Now we accept them (with canonicalisation) while STILL
  // rejecting genuine fabrications.
  describe('Sprint 34.1 — citation-grounding robustness', () => {
    it('accepts a chunk_id-form citation when it matches the chunk_id, canonicalised to a humanised label', async () => {
      // Seed a corpus chunk that resembles the dev fixture: chunk
      // body talks about late fees but doesn't repeat the chunk_id
      // string verbatim. Model passes the chunk_id literally as the
      // statute_citation — this previously errored.
      const docId = seedDocument(db, 'late-fees-general');
      const chunkId = 'late-fees-general#section:5';
      seedChunk(db, docId, {
        id: chunkId,
        content:
          'Late fees over 5% of monthly rent are presumptively unconscionable under NJ tenant-law precedent. Marini v. Ireland establishes the warranty of habitability.',
        index: 5,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          statute_citation: chunkId, // ← chunk_id as citation
          chunk_id: chunkId,
          reasoning: 'Late fee structure is unconscionable.',
          recommended_action: 'Negotiate cap to 5% of monthly rent.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string; chunk_id: string; statute_citation: string };
      expect(result.severity).toBe('high');
      expect(result.chunk_id).toBe(chunkId);
      // Canonicalised citation: humanised slug, NOT the raw chunk_id.
      expect(result.statute_citation).not.toBe(chunkId);
      expect(result.statute_citation).toMatch(/Late fees/i);
      expect(result.statute_citation).toContain('§5');
    });

    it('accepts a concatenated multi-statute citation when ANY part appears in the chunk body, canonicalising to the matching part', async () => {
      const docId = seedDocument(db, 'late-fees-general');
      const chunkId = 'late-fees-general#section:5';
      seedChunk(db, docId, {
        id: chunkId,
        content:
          'Under NJSA 56:8-1 et seq., unconscionable terms in residential leases are unenforceable. Late fees over 5% of monthly rent trigger this analysis.',
        index: 5,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // Model concatenates a heading-style header + a genuine
          // statute. Only the latter appears in the chunk body.
          statute_citation:
            'Late Fees on Rent — Marini v. Ireland, 56 N.J. 130 (1970); NJSA 56:8-1 et seq.',
          chunk_id: chunkId,
          reasoning: 'Late fee is unconscionable.',
          recommended_action: 'Reduce to a reasonable cap.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string; statute_citation: string };
      expect(result.severity).toBe('high');
      // Canonicalised to the matching part (NJSA 56:8-1 et seq.).
      expect(result.statute_citation).toMatch(/NJSA 56:8-1/i);
      expect(result.statute_citation).not.toMatch(/Marini/);
    });

    it('still rejects a genuinely fabricated citation that is not in body and not a chunk_id (regression guard)', async () => {
      const chunkId = seedTenantLawCorpusChunk(db);
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // Not the chunk_id; not in the body; not a known statute.
          statute_citation: 'NJSA 99:99-99 (totally invented)',
          chunk_id: chunkId,
          reasoning: 'reasoning',
          recommended_action: 'action',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      await expect(
        tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
      ).rejects.toThrow(/statute|citation|grounded/i);
    });
  });

  // Sprint 34.2 — chunk-identity citation forms. Extends 34.1: the model
  // sometimes cites a chunk by its IDENTITY rather than verbatim statute
  // text — either the chunk pointer wrapped in a label (D.1) or the
  // de-slugged chunk title (D.2). Both refer to the already-validated
  // cited chunk, so accept + canonicalise. A citation asserting EXTERNAL
  // authority absent from the chunk (e.g. a real case not in the body)
  // still rejects — that boundary is load-bearing for source-grounding.
  describe('Sprint 34.2 — chunk-identity citation forms', () => {
    it('D.1 — accepts a label-prefixed chunk pointer (chunk_id embedded in the citation)', async () => {
      const docId = seedDocument(db, 'early-termination-general');
      const chunkId = 'early-termination-general#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        content:
          'In a typical New Jersey residential tenancy, early termination is governed by the lease and reasonableness limits apply to any fee.',
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // chunk_id embedded after a humanised label + em-dash.
          statute_citation: `Early Termination — ${chunkId}`,
          chunk_id: chunkId,
          reasoning: 'Three months rent exceeds the enforceable cap.',
          recommended_action: 'Negotiate the early-termination fee down.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string; statute_citation: string };
      expect(result.severity).toBe('high');
      // Canonicalised to the humanised label, not the raw pointer string.
      expect(result.statute_citation).toMatch(/Early termination/i);
      expect(result.statute_citation).toContain('§1');
      expect(result.statute_citation).not.toContain('#section:');
    });

    it('D.2 — accepts the de-slugged chunk title as the citation', async () => {
      const docId = seedDocument(db, 'attorneys-fees-clauses');
      const chunkId = 'attorneys-fees-clauses#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        // Body does NOT contain the literal title phrase, and avoids the
        // word "fees" so the substring (A.2) path cannot match.
        content:
          "Many NJ residential leases shift the landlord's legal costs onto the tenant regardless of who prevails; one-way cost-shifting is disfavored.",
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'medium',
          // The de-slugged chunk name (with an added apostrophe), not a statute.
          statute_citation: "Attorneys' Fees Clauses",
          chunk_id: chunkId,
          reasoning: 'One-way attorney cost-shifting is disfavored.',
          recommended_action: 'Make the clause reciprocal.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string; statute_citation: string };
      expect(result.severity).toBe('medium');
      expect(result.statute_citation).toMatch(/Attorneys fees clauses/i);
      expect(result.statute_citation).toContain('§1');
    });

    it('D.2 tightness — a PARTIAL title is not enough (still rejects)', async () => {
      const docId = seedDocument(db, 'attorneys-fees-clauses');
      const chunkId = 'attorneys-fees-clauses#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        content:
          "Many NJ residential leases shift the landlord's legal costs onto the tenant regardless of who prevails; one-way cost-shifting is disfavored.",
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'low',
          statute_citation: 'Clauses', // partial — not the full de-slugged title
          chunk_id: chunkId,
          reasoning: 'r',
          recommended_action: 'a',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      await expect(
        tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
      ).rejects.toThrow(/statute|citation|grounded/i);
    });

    it('D.3 — accepts an em-dash label+statute concatenation when the statute part is in the body', async () => {
      const docId = seedDocument(db, 'late-fees-general');
      const chunkId = 'late-fees-general#section:5';
      seedChunk(db, docId, {
        id: chunkId,
        // The statute "NJSA 56:8-1 et seq." IS verbatim in the body; the
        // model just joins it to a label with an em-dash (no semicolon).
        content:
          'Late fees over 5% of monthly rent are presumptively unconscionable under NJSA 56:8-1 et seq.',
        index: 5,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // Label — statute joined by an em-dash (A.2 previously split
          // only on ;/&/and, so it never isolated the grounded part).
          statute_citation: 'Late Fees on Rent — NJSA 56:8-1 et seq.',
          chunk_id: chunkId,
          reasoning: 'Late fee structure is unconscionable.',
          recommended_action: 'Negotiate a reasonable cap.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { statute_citation: string };
      // Canonicalised to the grounded statute part; the label is dropped.
      expect(result.statute_citation).toMatch(/NJSA 56:8-1/i);
      expect(result.statute_citation).not.toMatch(/Late Fees on Rent/i);
    });

    it('P3 boundary — external authority absent from the cited chunk still rejects', async () => {
      const docId = seedDocument(db, 'repair-and-deduct');
      const chunkId = 'repair-and-deduct#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        // Body about the repair-and-deduct remedy; does NOT contain "Marini".
        content:
          "When a landlord fails to make repairs that are the landlord's responsibility, the tenant may in some circumstances repair the condition and deduct the reasonable cost from rent.",
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // A real case the model attached to a chunk that doesn't contain
          // it — neither the chunk's identity nor in its body.
          statute_citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
          chunk_id: chunkId,
          reasoning: 'r',
          recommended_action: 'a',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      await expect(
        tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
      ).rejects.toThrow(/statute|citation|grounded/i);
    });
  });

  // Sprint 34.3 — markdown-aware + cross-chunk grounding. The corpus
  // bolds/italicises citations inconsistently, so a verbatim substring
  // check fails when an emphasis marker lands mid-citation (e.g. the
  // body has "*Marini v. Ireland*, 56 N.J. 130 (1970)"). And the model
  // may label one chunk while the citation is verbatim in a DIFFERENT
  // retrieved chunk. Both are grounded in the retrieved context; recover
  // them. A citation in NO retrieved chunk still rejects.
  describe('Sprint 34.3 — markdown-aware + cross-chunk grounding', () => {
    it('E.1 — accepts a citation broken by markdown italics in the chunk body', async () => {
      const docId = seedDocument(db, 'repair-and-deduct');
      const chunkId = 'repair-and-deduct#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        // Italic markers wrap just the case NAME, so "Marini v. Ireland,"
        // is broken by the `*` before the comma — verbatim includes fails.
        content:
          'When a landlord fails to make repairs, the tenant may repair and deduct the cost from rent. The remedy was established in *Marini v. Ireland*, 56 N.J. 130 (1970).',
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          statute_citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
          chunk_id: chunkId,
          reasoning: 'Disclaims the warranty of habitability.',
          recommended_action: 'Strike the AS-IS disclaimer.',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string; statute_citation: string; chunk_id: string };
      expect(result.severity).toBe('high');
      expect(result.statute_citation).toMatch(/Marini v\. Ireland/);
      expect(result.chunk_id).toBe(chunkId);
    });

    it('E.1 — a bold whole-citation still matches (no regression from stripping)', async () => {
      const docId = seedDocument(db, 'habitability-warranty');
      const chunkId = 'habitability-warranty#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        content:
          'A clause that disclaims the warranty is unenforceable per **Marini v. Ireland, 56 N.J. 130 (1970)**.',
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          statute_citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
          chunk_id: chunkId,
          reasoning: 'r',
          recommended_action: 'a',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { severity: string };
      expect(result.severity).toBe('high');
    });

    it('E.2 — accepts a citation verbatim in a DIFFERENT retrieved chunk and re-points chunk_id', async () => {
      const repairDoc = seedDocument(db, 'repair-and-deduct');
      const citedChunkId = 'repair-and-deduct#section:1';
      seedChunk(db, repairDoc, {
        id: citedChunkId,
        content:
          'Repair-and-deduct lets a tenant deduct the reasonable cost of repairs from the next month rent.',
        index: 1,
        level: 'section',
      });
      const habDoc = seedDocument(db, 'habitability-warranty');
      const otherChunkId = 'habitability-warranty#section:1';
      seedChunk(db, habDoc, {
        id: otherChunkId,
        content:
          'The implied warranty of habitability was announced in Marini v. Ireland, 56 N.J. 130 (1970).',
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          // Verbatim in the habitability chunk, but the model labeled the
          // repair-and-deduct chunk.
          statute_citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
          chunk_id: citedChunkId,
          reasoning: 'r',
          recommended_action: 'a',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      const result = (await tool.execute(
        { clause_id: clauseId },
        ctx('Tenant', TENANT_ID),
      )) as { statute_citation: string; chunk_id: string };
      expect(result.statute_citation).toMatch(/Marini v\. Ireland/);
      // Re-pointed to the chunk where the citation actually lives.
      expect(result.chunk_id).toBe(otherChunkId);
    });

    it('P3c boundary — a citation in NO retrieved chunk still rejects (even after emphasis-stripping)', async () => {
      const docId = seedDocument(db, 'repair-and-deduct');
      const chunkId = 'repair-and-deduct#section:1';
      seedChunk(db, docId, {
        id: chunkId,
        // No case named anywhere in the retrieved context.
        content:
          'Repair-and-deduct lets a tenant deduct the reasonable cost of repairs from the next month rent.',
        index: 1,
        level: 'section',
      });
      const { clauseId } = seedSampleLease(db);
      const anthropic = buildAnthropicMock(
        JSON.stringify({
          severity: 'high',
          statute_citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
          chunk_id: chunkId,
          reasoning: 'r',
          recommended_action: 'a',
        }),
      );
      const tool = createGradeClauseSeverityTool(db, anthropic);
      await expect(
        tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
      ).rejects.toThrow(/statute|citation|grounded/i);
    });
  });

  it('throws when Tenant tries to grade a clause on a lease they did not upload', async () => {
    seedTenantLawCorpusChunk(db);
    const { clauseId } = seedSampleLease(db, REVIEWER_ID);
    const anthropic = buildAnthropicMock('{}');
    const tool = createGradeClauseSeverityTool(db, anthropic);

    await expect(
      tool.execute({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow(/own|tenant|access/i);
  });
});

describe('draft_negotiation_email tool', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedWorkspace(db);
    db.prepare(
      `INSERT INTO users (id, email, role, display_name, created_at)
       VALUES (?, ?, 'Creator', 'T', 1)`,
    ).run(TENANT_ID, `${TENANT_ID}@example.com`);
  });

  it('drafts an email via prepare+execute and returns a MutationOutcome', async () => {
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({
        subject: 'Request to revise the security deposit',
        body: 'Dear Landlord, …',
      }),
    );
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const tenantCtx = ctx('Tenant', TENANT_ID);

    // Sprint 13 §2.4: mutating tool with `prepare` — async LLM call
    // runs first, sync execute does the INSERT. The registry wraps
    // execute in a transaction; here we call them directly to unit-test
    // the descriptor.
    const prepared = await tool.prepare?.(
      { clause_id: clauseId, tone: 'polite' },
      tenantCtx,
    );
    const outcome = tool.execute(
      { clause_id: clauseId, tone: 'polite' },
      tenantCtx,
      prepared,
    ) as {
      result: { email_id: string; subject: string };
      compensatingActionPayload: Record<string, unknown>;
    };

    expect(outcome.result.email_id).toBeTypeOf('string');
    expect(outcome.result.subject).toMatch(/security deposit/i);
    expect(outcome.compensatingActionPayload).toHaveProperty('email_id');

    const row = db
      .prepare('SELECT id FROM negotiation_emails WHERE id = ?')
      .get(outcome.result.email_id);
    expect(row).toBeDefined();
  });

  it('compensatingAction deletes the negotiation_emails row by email_id (rollback round-trip)', async () => {
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({ subject: 'subj', body: 'body' }),
    );
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const tenantCtx = ctx('Tenant', TENANT_ID);

    const prepared = await tool.prepare?.({ clause_id: clauseId }, tenantCtx);
    const outcome = tool.execute(
      { clause_id: clauseId },
      tenantCtx,
      prepared,
    ) as {
      result: { email_id: string };
      compensatingActionPayload: Record<string, unknown>;
    };

    expect(tool.compensatingAction).toBeDefined();
    if (!tool.compensatingAction) return;
    tool.compensatingAction(outcome.compensatingActionPayload, tenantCtx);

    const row = db
      .prepare('SELECT id FROM negotiation_emails WHERE id = ?')
      .get(outcome.result.email_id);
    expect(row).toBeUndefined();
  });

  it('throws in prepare when Tenant tries to draft for a lease they did not upload', async () => {
    const { clauseId } = seedSampleLease(db, REVIEWER_ID);
    const anthropic = buildAnthropicMock('{}');
    const tool = createDraftNegotiationEmailTool(db, anthropic);

    expect(tool.prepare).toBeDefined();
    if (!tool.prepare) return;
    await expect(
      tool.prepare({ clause_id: clauseId }, ctx('Tenant', TENANT_ID)),
    ).rejects.toThrow(/own|tenant|access/i);
  });

  it('defaults tone to "polite" when not provided', async () => {
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({ subject: 'subj', body: 'body' }),
    );
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const tenantCtx = ctx('Tenant', TENANT_ID);

    const prepared = await tool.prepare?.({ clause_id: clauseId }, tenantCtx);
    const outcome = tool.execute(
      { clause_id: clauseId },
      tenantCtx,
      prepared,
    ) as { result: { tone: string } };

    expect(outcome.result.tone).toBe('polite');
  });

  it('descriptor declares roles for Tenant + Reviewer + Admin (not Creator-only literal)', () => {
    const anthropic = buildAnthropicMock('{}');
    const tool = createDraftNegotiationEmailTool(db, anthropic);

    expect(tool.roles).toEqual(
      expect.arrayContaining(['Tenant', 'Reviewer', 'Admin']),
    );
  });

  // Phase 10.8 — concern_summary + statute_citation are optional inputs
  // that the chat agent passes from the most-recent grading. They make
  // the email grounded in the specific concern instead of generic
  // boilerplate. The schema accepts them; the tool forwards them into
  // the LLM prompt verbatim.
  it('forwards concern_summary + statute_citation into the LLM prompt when supplied', async () => {
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({ subject: 'subj', body: 'body' }),
    );
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const tenantCtx = ctx('Tenant', TENANT_ID);

    await tool.prepare?.(
      {
        clause_id: clauseId,
        concern_summary:
          'The deposit exceeds the 1.5-month statutory cap and the landlord retains all interest.',
        statute_citation: 'NJ Stat 46:8-19',
      },
      tenantCtx,
    );

    const createMock = anthropic.messages.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledTimes(1);
    const sentContent = createMock.mock.calls[0][0].messages[0].content;
    expect(sentContent).toMatch(
      /CONCERN SUMMARY[\s\S]*deposit exceeds the 1\.5-month statutory cap/,
    );
    expect(sentContent).toMatch(/STATUTE CITATION[\s\S]*NJ Stat 46:8-19/);
  });

  it('declares concern_summary + statute_citation as optional input fields on the schema', () => {
    const anthropic = buildAnthropicMock('{}');
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props.concern_summary).toBeDefined();
    expect(props.statute_citation).toBeDefined();
    // Required is still just clause_id — the new fields are optional.
    expect(tool.inputSchema.required).toEqual(['clause_id']);
  });

  it('strips a chunk_id-shaped statute_citation (defensive against agent confusion)', async () => {
    const { clauseId } = seedSampleLease(db);
    const anthropic = buildAnthropicMock(
      JSON.stringify({ subject: 'subj', body: 'body' }),
    );
    const tool = createDraftNegotiationEmailTool(db, anthropic);
    const tenantCtx = ctx('Tenant', TENANT_ID);

    await tool.prepare?.(
      {
        clause_id: clauseId,
        // Intentionally wrong — looks like a chunk_id, not a real
        // citation. The chat agent occasionally confuses the two.
        statute_citation: 'security-deposit-cap#section:1',
      },
      tenantCtx,
    );

    const createMock = anthropic.messages.create as ReturnType<typeof vi.fn>;
    const sentContent = createMock.mock.calls[0][0].messages[0].content;
    // The bogus value is rejected before reaching the prompt; the "no
    // citation provided" path is taken instead.
    expect(sentContent).not.toMatch(/security-deposit-cap#section:1/);
    expect(sentContent).toMatch(/No statute citation provided/);
  });
});
