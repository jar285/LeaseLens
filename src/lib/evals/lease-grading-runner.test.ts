// Sprint 14 / Phase 11 — hermetic test for the Tier 2 runner.
//
// Shape-level assertions: 2-case run produces a scorecard with the
// expected fields, classifier metrics flip correctly, and the runner
// surfaces tool errors as `errorMessage` (not a thrown exception).
// Avoids real Anthropic calls — the fake client returns deterministic
// JSON envelopes the runner can parse.

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestSampleLease, runSeed, SAMPLE_LEASE_ID } from '@/db/seed';
import type { AnthropicLike } from '@/lib/tools/lease-tools';

// Embedder mock — same path golden-set.test uses. Avoids spinning up
// the actual transformer model in the test runtime.
vi.mock('@/lib/rag/embed', async () => {
  const m = await import('@/lib/test/embed-mock');
  return m.buildEmbedderMock();
});

// Retrieval mock — returns a deterministic chunk set so validateGrading's
// "chunk_id in retrieved set" check is testable independent of embedder
// behaviour. The test injects what chunks should come back per call.
vi.mock('@/lib/rag/retrieve', () => ({
  retrieve: vi.fn(),
}));

import { ingestCorpus } from '@/lib/rag/ingest';
import { retrieve } from '@/lib/rag/retrieve';
import { createTestDb } from '@/lib/test/db';
import type { LeaseGradingCase } from './lease-cases';
import { runLeaseGradingEval } from './lease-grading-runner';

const NJ_CORPUS_DIR = `${process.cwd()}/src/corpus/nj-tenant-law`;

function buildAnthropicMock(envelopes: Array<Record<string, unknown>>): {
  client: AnthropicLike;
  callCount: () => number;
} {
  let i = 0;
  const client: AnthropicLike = {
    messages: {
      create: vi.fn().mockImplementation(async () => {
        const env = envelopes[i] ?? envelopes[envelopes.length - 1];
        i += 1;
        return {
          content: [{ type: 'text', text: JSON.stringify(env) }],
        };
      }),
    },
  };
  return { client, callCount: () => i };
}

describe('runLeaseGradingEval', () => {
  let db: Database.Database;

  beforeEach(async () => {
    db = createTestDb();
    runSeed(db);
    await ingestCorpus(db, NJ_CORPUS_DIR);
    await ingestSampleLease(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs 2 cases through the grading tool and returns a scorecard with all metrics', async () => {
    // Stub retrieval so validateGrading's chunk_id-in-retrieved-set
    // check is deterministic. The mocked Anthropic returns the same
    // chunk_id, so validation passes for both cases.
    vi.mocked(retrieve).mockResolvedValue([
      {
        chunkId: 'security-deposit-cap#section:1',
        documentSlug: 'security-deposit-cap',
        heading: 'Statutory cap',
        content:
          'Under New Jersey law, a residential landlord may not collect a security deposit greater than 1.5 times the monthly rent. NJ Stat 46:8-21.2.',
        rrfScore: 0.9,
        vectorRank: 0,
        bm25Rank: 0,
      },
    ]);

    // Mock returns a high-severity grading citing a real chunk, then an
    // ok grading. Runner should compute precision=1.0, recall=1.0 for
    // case A (high → red flag, expected red flag) and case B
    // (ok → not red flag, expected not red flag) — both correct.
    const cases: LeaseGradingCase[] = [
      {
        id: 'security-cap-test',
        clauseIndex: 3, // SECURITY DEPOSIT in the seeded sample lease
        description: 'security deposit over cap',
        expectedSeverity: 'high',
        expectedStatutePrefix: 'NJ Stat 46:8',
      },
      {
        id: 'rent-test',
        clauseIndex: 1, // RENT — a clean clause
        description: 'rent amount only',
        expectedSeverity: 'ok',
        expectedStatutePrefix: '',
      },
    ];

    const { client } = buildAnthropicMock([
      {
        severity: 'high',
        // A real chunk_id from the seeded corpus.
        chunk_id: 'security-deposit-cap#section:1',
        // The retriever will surface that chunk's content; a substring
        // of its actual text. validateGrading checks verbatim.
        statute_citation: 'NJ Stat 46:8-21.2',
        reasoning: '2 months exceeds the statutory 1.5 cap.',
        recommended_action: 'Negotiate down to 1.5 months.',
      },
      {
        severity: 'ok',
        chunk_id: 'security-deposit-cap#section:1',
        statute_citation: 'NJ Stat 46:8-21.2',
        reasoning: 'Standard rent amount.',
        recommended_action: 'No action.',
      },
    ]);

    const report = await runLeaseGradingEval(db, {
      anthropic: client,
      cases,
    });

    expect(report.caseResults).toHaveLength(2);
    expect(report.scorecard.totalCases).toBe(2);
    expect(report.scorecard.precision).toBe(1);
    expect(report.scorecard.recall).toBe(1);
    expect(report.scorecard.f1).toBe(1);
    expect(report.scorecard.exactMatch).toBe(1);
    // Both cases completed without a tool error (validateGrading
    // accepted both citations because we used a real chunk_id +
    // a citation substring that appears in that chunk).
    expect(report.scorecard.groundedness).toBe(1);
    // Exactly 1 case had a non-empty expectedStatutePrefix; that
    // case's actual citation matched.
    expect(report.scorecard.statuteHitRate).toBe(1);
    expect(report.summary).toMatch(/2 cases/);
  });

  it('marks ungrounded citations as errors and rolls them into groundedness', async () => {
    // Stub retrieval to return a real chunk; the mock Anthropic
    // returns a DIFFERENT chunk_id → validateGrading throws.
    vi.mocked(retrieve).mockResolvedValue([
      {
        chunkId: 'security-deposit-cap#section:1',
        documentSlug: 'security-deposit-cap',
        heading: 'Statutory cap',
        content: 'NJ security deposit law content',
        rrfScore: 0.9,
        vectorRank: 0,
        bm25Rank: 0,
      },
    ]);

    const cases: LeaseGradingCase[] = [
      {
        id: 'ungrounded-test',
        clauseIndex: 3,
        description: 'tool returns a chunk_id not in retrieval set',
        expectedSeverity: 'high',
        expectedStatutePrefix: 'NJ Stat 46:8',
      },
    ];

    const { client } = buildAnthropicMock([
      {
        severity: 'high',
        // Fabricated chunk_id — validateGrading should reject this.
        chunk_id: 'made-up-chunk#section:99',
        statute_citation: 'NJ Stat 46:8-21.2',
        reasoning: 'r',
        recommended_action: 'a',
      },
    ]);

    const report = await runLeaseGradingEval(db, {
      anthropic: client,
      cases,
    });

    expect(report.caseResults).toHaveLength(1);
    expect(report.caseResults[0].actualSeverity).toBe('error');
    expect(report.caseResults[0].errorMessage).toMatch(/chunk_id|grounded/i);
    expect(report.scorecard.groundedness).toBe(0); // 0/1 cases completed
  });

  it('looks up sample lease via the SAMPLE_LEASE_ID seed constant', () => {
    // The runner needs the sample lease to be seeded in the workspace.
    // This sanity-asserts the seed produced the expected lease row.
    const lease = db
      .prepare('SELECT id FROM leases WHERE id = ?')
      .get(SAMPLE_LEASE_ID);
    expect(lease).toBeDefined();
  });
});
