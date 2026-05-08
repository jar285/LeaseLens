import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLatestEvalReport,
  getLatestLeaseGradingReport,
} from './eval-reports';

const REPORT_FIXTURE = {
  runId: 'run-abc',
  startedAt: '2026-05-01T12-00-00-000Z',
  completedAt: '2026-05-01T12-00-05-000Z',
  caseResults: [
    {
      caseId: 'c1',
      query: 'q1',
      retrievedChunkIds: [],
      scorecard: { dimensions: [], totalScore: 4, maxScore: 5, passed: true },
      passed: true,
    },
    {
      caseId: 'c2',
      query: 'q2',
      retrievedChunkIds: [],
      scorecard: { dimensions: [], totalScore: 3, maxScore: 5, passed: false },
      passed: false,
    },
  ],
  overallScorecard: {
    dimensions: [],
    totalScore: 7,
    maxScore: 10,
    passed: false,
  },
  passed: false,
  summary: 'Golden eval: 1/2 passed (7.0/10.0 points)',
};

describe('getLatestEvalReport', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cockpit-evals-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns null when data/eval-reports/ does not exist', () => {
    expect(getLatestEvalReport()).toBeNull();
  });

  it('returns null when directory exists but has no golden-*.json files', () => {
    mkdirSync(join(tmpRoot, 'data', 'eval-reports'), { recursive: true });
    writeFileSync(join(tmpRoot, 'data', 'eval-reports', 'README.md'), '');
    expect(getLatestEvalReport()).toBeNull();
  });

  it('returns lexicographically-greatest file projected to EvalHealthSnapshot', () => {
    const dir = join(tmpRoot, 'data', 'eval-reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'golden-2025-12-01T12-00-00-000Z.json'),
      JSON.stringify({
        ...REPORT_FIXTURE,
        completedAt: '2025-12-01T12-00-05-000Z',
      }),
    );
    writeFileSync(
      join(dir, 'golden-2026-05-01T12-00-00-000Z.json'),
      JSON.stringify(REPORT_FIXTURE),
    );

    const snapshot = getLatestEvalReport();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.passedCount).toBe(1);
    expect(snapshot?.totalCases).toBe(2);
    expect(snapshot?.totalScore).toBe(7);
    expect(snapshot?.maxScore).toBe(10);
    expect(snapshot?.lastRunAt).toBe('2026-05-01T12-00-05-000Z');
  });
});

// Sprint 14 / Phase 12 — Tier 2 reader.
const LEASE_GRADING_FIXTURE = {
  runId: 'run-tier2-abc',
  startedAt: '2026-05-08T12-00-00-000Z',
  completedAt: '2026-05-08T12-00-30-000Z',
  caseResults: [],
  scorecard: {
    precision: 0.83,
    recall: 0.9,
    f1: 0.86,
    groundedness: 0.92,
    exactMatch: 0.58,
    statuteHitRate: 0.67,
    latencyP50Ms: 1850,
    latencyP95Ms: 4200,
    totalCases: 12,
  },
  summary: 'stub',
};

describe('getLatestLeaseGradingReport', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cockpit-evals-tier2-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns null when data/eval-reports/ does not exist', () => {
    expect(getLatestLeaseGradingReport()).toBeNull();
  });

  it('returns null when only Tier 1 (golden-*.json) reports exist', () => {
    const dir = join(tmpRoot, 'data', 'eval-reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'golden-2026-05-08T12-00-00-000Z.json'),
      JSON.stringify({}),
    );
    expect(getLatestLeaseGradingReport()).toBeNull();
  });

  it('returns the lexicographically-greatest lease-grading-*.json projected to LeaseGradingSnapshot', () => {
    const dir = join(tmpRoot, 'data', 'eval-reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'lease-grading-2026-05-01T00-00-00-000Z.json'),
      JSON.stringify({
        ...LEASE_GRADING_FIXTURE,
        completedAt: '2026-05-01T00-00-30-000Z',
      }),
    );
    writeFileSync(
      join(dir, 'lease-grading-2026-05-08T12-00-00-000Z.json'),
      JSON.stringify(LEASE_GRADING_FIXTURE),
    );
    // A Tier 1 report alongside should be ignored.
    writeFileSync(
      join(dir, 'golden-2026-05-08T12-00-00-000Z.json'),
      JSON.stringify({}),
    );

    const snap = getLatestLeaseGradingReport();
    expect(snap).not.toBeNull();
    expect(snap?.precision).toBe(0.83);
    expect(snap?.recall).toBe(0.9);
    expect(snap?.f1).toBe(0.86);
    expect(snap?.groundedness).toBe(0.92);
    expect(snap?.statuteHitRate).toBe(0.67);
    expect(snap?.exactMatch).toBe(0.58);
    expect(snap?.totalCases).toBe(12);
    expect(snap?.latencyP50Ms).toBe(1850);
    expect(snap?.latencyP95Ms).toBe(4200);
    expect(snap?.lastRunAt).toBe('2026-05-08T12-00-30-000Z');
  });
});
