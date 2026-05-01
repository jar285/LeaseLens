import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestEvalReport } from './eval-reports';

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
