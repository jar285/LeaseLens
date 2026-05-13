// S19.3 — pure derivation of the two synthetic assistant messages
// that bracket a scan: a "Lease uploaded" intro (with 4 chips offering
// the standard scan or off-ramps) and a scan-complete summary (with
// 4 chips offering the next actions on the result).
//
// Both messages are derived solely from the live `toolEvents` stream
// plus the current `activeLease` reference — same single source of
// truth that drives ScanTimeline, RedFlagReport, and the scan-progress
// machine. No new state, no parallel store.
//
// Pure module. No React, no DOM. Tests target the underlying function;
// the React adapter (useScanNarrative) is tested separately.

import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { computeScanNarrative, type NarrativeLease } from './scan-narrative';

const LEASE: NarrativeLease = {
  lease_id: 'lease-abc',
  filename: 'apartment-lease.pdf',
};

function extractEvent(opts: {
  clauseTypes?: string[];
  audit_id?: string;
}): ToolEvent {
  const clauseTypes = opts.clauseTypes ?? [
    'security_deposit',
    'late_fee',
    'sublet',
  ];
  return {
    tool_name: 'extract_clauses',
    input: { lease_id: LEASE.lease_id },
    result: {
      clauses: clauseTypes.map((clause_type, i) => ({
        clause_id: `c${i + 1}`,
        clause_type,
        clause_index: i,
        page_number: i + 1,
      })),
    },
    audit_id: opts.audit_id,
  };
}

function gradeEvent(opts: {
  clause_id: string;
  severity: 'high' | 'medium' | 'low' | 'ok';
  clause_type?: string;
  error?: string;
}): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: opts.clause_id },
    result: opts.error
      ? undefined
      : {
          clause_id: opts.clause_id,
          severity: opts.severity,
          statute_citation: 'NJSA 46:8-1',
          chunk_id: 'chunk-1',
          reasoning: 'r',
          recommended_action: 'a',
          clause_type: opts.clause_type,
        },
    audit_id: undefined,
  };
}

describe('computeScanNarrative — idle states', () => {
  it('returns both null when there is no lease and no events', () => {
    const out = computeScanNarrative({ events: [], lease: null });
    expect(out.intro).toBeNull();
    expect(out.summary).toBeNull();
  });

  it('returns both null when there is no lease, even if scan events somehow leaked in', () => {
    // Defensive: a lease must be present for the narrative to be
    // meaningful. The intro is "Lease uploaded"; if no lease, no
    // intro. The summary references the lease the scan ran against.
    const out = computeScanNarrative({
      events: [extractEvent({})],
      lease: null,
    });
    expect(out.intro).toBeNull();
    expect(out.summary).toBeNull();
  });
});

describe('computeScanNarrative — intro message', () => {
  it('produces an intro when a lease is set and no scan events have fired yet', () => {
    const out = computeScanNarrative({ events: [], lease: LEASE });
    expect(out.intro).not.toBeNull();
    expect(out.intro?.role).toBe('assistant');
    expect(out.intro?.synthetic).toBe(true);
    expect(out.intro?.source).toBe('intro');
    expect(out.intro?.followUpPrompts).toHaveLength(4);
  });

  it('intro id is stable and prefixed with synthetic:intro', () => {
    const out = computeScanNarrative({ events: [], lease: LEASE });
    expect(out.intro?.id).toMatch(/^synthetic:intro:/);
    // Re-running with the same lease returns the same id (idempotent).
    const out2 = computeScanNarrative({ events: [], lease: LEASE });
    expect(out2.intro?.id).toBe(out.intro?.id);
  });

  it('intro body mentions the lease filename in plain English', () => {
    const out = computeScanNarrative({ events: [], lease: LEASE });
    expect(out.intro?.content.toLowerCase()).toContain('apartment-lease.pdf');
    expect(out.intro?.content.toLowerCase()).toMatch(
      /upload|received|found|i can|standard scan/,
    );
  });

  it('intro disappears once any scan tool event has been observed', () => {
    // Once the user clicks "Run standard scan" and the assistant calls
    // extract_clauses, the intro is replaced by the timeline / summary.
    // Keeping it visible would make the chat look stale.
    const out = computeScanNarrative({
      events: [extractEvent({})],
      lease: LEASE,
    });
    expect(out.intro).toBeNull();
  });

  it('intro returns when a re-upload swaps in a new lease before a scan starts', () => {
    const second: NarrativeLease = {
      lease_id: 'lease-second',
      filename: 'second.pdf',
    };
    const out = computeScanNarrative({ events: [], lease: second });
    expect(out.intro).not.toBeNull();
    expect(out.intro?.id).toContain(second.lease_id);
  });
});

describe('computeScanNarrative — scan-complete summary', () => {
  it('returns no summary while the scan is still running (extract done, grades partial)', () => {
    const events: ToolEvent[] = [
      extractEvent({ clauseTypes: ['security_deposit', 'late_fee', 'sublet'] }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      // c2 and c3 not graded yet
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    expect(out.summary).toBeNull();
  });

  it('produces a summary with severity tally once every clause has been attempted', () => {
    const events: ToolEvent[] = [
      extractEvent({
        clauseTypes: [
          'security_deposit',
          'late_fee',
          'sublet',
          'pet',
          'attorneys_fees',
          'early_termination',
          'parking',
        ],
      }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      gradeEvent({
        clause_id: 'c2',
        severity: 'high',
        clause_type: 'late_fee',
      }),
      gradeEvent({ clause_id: 'c3', severity: 'high', clause_type: 'sublet' }),
      gradeEvent({ clause_id: 'c4', severity: 'high', clause_type: 'pet' }),
      gradeEvent({
        clause_id: 'c5',
        severity: 'high',
        clause_type: 'attorneys_fees',
      }),
      gradeEvent({
        clause_id: 'c6',
        severity: 'medium',
        clause_type: 'early_termination',
      }),
      gradeEvent({ clause_id: 'c7', severity: 'low', clause_type: 'parking' }),
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    expect(out.summary).not.toBeNull();
    expect(out.summary?.role).toBe('assistant');
    expect(out.summary?.source).toBe('scan-complete');
    expect(out.summary?.followUpPrompts).toHaveLength(4);
    const c = out.summary?.content ?? '';
    expect(c).toContain('7');
    expect(c).toContain('5'); // high count
    expect(c).toContain('1'); // medium AND low (both 1)
    expect(c.toLowerCase()).toContain('high');
    expect(c.toLowerCase()).toContain('medium');
    expect(c.toLowerCase()).toContain('low');
  });

  it('ok-severity clauses are NOT counted as red flags in the tally', () => {
    const events: ToolEvent[] = [
      extractEvent({ clauseTypes: ['security_deposit', 'late_fee'] }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      gradeEvent({ clause_id: 'c2', severity: 'ok', clause_type: 'late_fee' }),
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    // "I found 1 red flag" — singular, ok-graded clauses excluded.
    expect(out.summary?.content).toMatch(/found\s+\**1\**\s+red flag\b/i);
    expect(out.summary?.content).not.toMatch(/2\**\s+red flags/i);
  });

  it('mentions the top clause categories the user should focus on', () => {
    const events: ToolEvent[] = [
      extractEvent({
        clauseTypes: [
          'security_deposit',
          'attorneys_fees',
          'sublet',
          'pet',
          'early_termination',
        ],
      }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      gradeEvent({
        clause_id: 'c2',
        severity: 'high',
        clause_type: 'attorneys_fees',
      }),
      gradeEvent({ clause_id: 'c3', severity: 'high', clause_type: 'sublet' }),
      gradeEvent({ clause_id: 'c4', severity: 'high', clause_type: 'pet' }),
      gradeEvent({
        clause_id: 'c5',
        severity: 'medium',
        clause_type: 'early_termination',
      }),
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    const c = out.summary?.content ?? '';
    // Top categories sorted by severity then count — high-severity
    // clauses surface first. Tenant-facing label, not raw clause_type.
    expect(c).toMatch(/security deposit/i);
    expect(c).toMatch(/attorneys' fees/i);
  });

  it('summary id is keyed to the latest extract so a re-scan replaces it', () => {
    const events1: ToolEvent[] = [
      extractEvent({
        audit_id: 'extract-1',
        clauseTypes: ['security_deposit'],
      }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
    ];
    const events2: ToolEvent[] = [
      ...events1,
      extractEvent({ audit_id: 'extract-2', clauseTypes: ['late_fee'] }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'medium',
        clause_type: 'late_fee',
      }),
    ];
    const a = computeScanNarrative({ events: events1, lease: LEASE });
    const b = computeScanNarrative({ events: events2, lease: LEASE });
    expect(a.summary?.id).not.toBe(b.summary?.id);
    expect(b.summary?.id).toMatch(/^synthetic:scan-complete:/);
  });
});

describe('computeScanNarrative — scan-fatal variant', () => {
  it('switches the summary to scan-fatal when more than half of the grade attempts errored', () => {
    const events: ToolEvent[] = [
      extractEvent({
        clauseTypes: ['security_deposit', 'late_fee', 'sublet', 'pet'],
      }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      gradeEvent({
        clause_id: 'c2',
        severity: 'high',
        clause_type: 'late_fee',
        error: 'boom',
      }),
      gradeEvent({
        clause_id: 'c3',
        severity: 'high',
        clause_type: 'sublet',
        error: 'boom',
      }),
      gradeEvent({
        clause_id: 'c4',
        severity: 'high',
        clause_type: 'pet',
        error: 'boom',
      }),
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    expect(out.summary?.source).toBe('scan-fatal');
    expect(out.summary?.content.toLowerCase()).toMatch(
      /trouble|couldn.?t|try again/,
    );
    // The fatal variant offers different next-actions.
    const labels = (out.summary?.followUpPrompts ?? []).map((p) => p.label);
    expect(labels.some((l) => /try again/i.test(l))).toBe(true);
  });

  // S20.5 — under the fatal threshold but with at least one error, the
  // summary moves to 'scan-partial' (NEW). Previously this case was
  // bucketed as 'scan-complete' which gave a misleadingly bright
  // success message while the timeline showed skipped clauses.
  it('routes to scan-partial when at least one clause errored but the ratio is below the fatal threshold', () => {
    const events: ToolEvent[] = [
      extractEvent({
        clauseTypes: ['security_deposit', 'late_fee', 'sublet', 'pet'],
      }),
      gradeEvent({
        clause_id: 'c1',
        severity: 'high',
        clause_type: 'security_deposit',
      }),
      gradeEvent({
        clause_id: 'c2',
        severity: 'high',
        clause_type: 'late_fee',
      }),
      gradeEvent({
        clause_id: 'c3',
        severity: 'high',
        clause_type: 'sublet',
        error: 'boom',
      }),
      gradeEvent({
        clause_id: 'c4',
        severity: 'high',
        clause_type: 'pet',
      }),
    ];
    const out = computeScanNarrative({ events, lease: LEASE });
    expect(out.summary?.source).toBe('scan-partial');
  });
});

describe('computeScanNarrative — scan-partial variant', () => {
  function buildEvents(opts: {
    successes: number;
    errors: number;
  }): ToolEvent[] {
    const clauseTypes: string[] = [];
    for (let i = 0; i < opts.successes + opts.errors; i++) {
      clauseTypes.push(i % 2 === 0 ? 'security_deposit' : 'late_fee');
    }
    const events: ToolEvent[] = [extractEvent({ clauseTypes })];
    for (let i = 0; i < opts.successes; i++) {
      events.push(
        gradeEvent({
          clause_id: `c${i + 1}`,
          severity: 'high',
          clause_type: clauseTypes[i],
        }),
      );
    }
    for (let i = 0; i < opts.errors; i++) {
      events.push(
        gradeEvent({
          clause_id: `c${opts.successes + i + 1}`,
          severity: 'high',
          clause_type: clauseTypes[opts.successes + i],
          error: 'boom',
        }),
      );
    }
    return events;
  }

  it('0 errors → scan-complete (unchanged behaviour)', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 4, errors: 0 }),
      lease: LEASE,
    });
    expect(out.summary?.source).toBe('scan-complete');
  });

  it('1 error / 10 attempts → scan-partial (10%, below 50% fatal threshold)', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 9, errors: 1 }),
      lease: LEASE,
    });
    expect(out.summary?.source).toBe('scan-partial');
  });

  it('4 errors / 10 attempts → scan-partial (40%, still below threshold)', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 6, errors: 4 }),
      lease: LEASE,
    });
    expect(out.summary?.source).toBe('scan-partial');
  });

  it('5 errors / 10 attempts → scan-fatal (≥50%)', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 5, errors: 5 }),
      lease: LEASE,
    });
    expect(out.summary?.source).toBe('scan-fatal');
  });

  it('the partial-success summary contains the recommended phrase about manual review', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 9, errors: 1 }),
      lease: LEASE,
    });
    expect(out.summary?.content.toLowerCase()).toContain(
      'may need manual review',
    );
  });

  it('the partial-success summary references the skipped-clause count', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 7, errors: 3 }),
      lease: LEASE,
    });
    // The body should mention "3" (skipped count) somewhere.
    expect(out.summary?.content).toMatch(/\b3\b/);
  });

  it('the partial-success summary offers 4 follow-up prompts including a "review skipped" action', () => {
    const out = computeScanNarrative({
      events: buildEvents({ successes: 9, errors: 1 }),
      lease: LEASE,
    });
    const labels = (out.summary?.followUpPrompts ?? []).map((p) => p.label);
    expect(labels).toHaveLength(4);
    expect(labels.some((l) => /review skipped|skipped clause/i.test(l))).toBe(
      true,
    );
  });
});
