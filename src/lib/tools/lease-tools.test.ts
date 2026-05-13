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
