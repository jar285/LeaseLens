# Sprint Plan — Sprint 6: AI Eval Harness

**Sprint:** 6  
**Status:** Complete  
**Date:** 2026-04-29  

---

## Prerequisites

Before any implementation step:
1. Confirm Sprint 5 is fully committed (`git log --oneline -1` should show the Sprint 5 commit).
2. Run `npm run test` — must show 77 passing.
3. Run `npm run db:seed` — must show all 5 docs `unchanged, skipping` (corpus already seeded).
4. Verify `.env.local` exists and contains `CONTENTOPS_DB_PATH`.

---

## Task List

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Implement `domain.ts` — core eval types | `src/lib/evals/domain.ts` | Create |
| 2 | Implement `scoring.ts` — pure scoring functions | `src/lib/evals/scoring.ts` | Create |
| 3 | Implement `scoring.test.ts` — 6 unit tests | `src/lib/evals/scoring.test.ts` | Create |
| 4 | Resolve golden set chunk IDs from seeded DB | — | Research |
| 5 | Implement `golden-set.ts` — curated golden cases | `src/lib/evals/golden-set.ts` | Create |
| 6 | Implement `runner.ts` — eval orchestrator | `src/lib/evals/runner.ts` | Create |
| 7 | Implement `reporter.ts` — JSON report writer | `src/lib/evals/reporter.ts` | Create |
| 8 | Implement `runner.test.ts` — 3 integration tests | `src/lib/evals/runner.test.ts` | Create |
| 9 | Replace `scripts/eval-golden.ts` stub with real CLI | `scripts/eval-golden.ts` | Modify |
| 10 | Update `package.json` and `.gitignore` | `package.json`, `.gitignore` | Modify |
| 11 | Final verification: typecheck, lint, test, eval:golden | — | Verify |

---

## Task 1 — `src/lib/evals/domain.ts`

**Goal:** Core types for the eval harness. No runtime logic, pure type definitions.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/domain.ts` — simplified for ContentOps (no cohorts, no tool behaviors, no observation tracking, no live model layer).

```typescript
export interface GoldenCase {
  id: string;
  query: string;
  expectedChunkIds: string[];
  expectedKeywords: string[];
  k: number;
}

export interface EvalScoreDimension {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  passed: boolean;
  details: string | null;
}

export interface EvalScorecard {
  dimensions: EvalScoreDimension[];
  totalScore: number;
  maxScore: number;
  passed: boolean;
}

export interface EvalCaseResult {
  caseId: string;
  query: string;
  retrievedChunkIds: string[];
  scorecard: EvalScorecard;
  passed: boolean;
}

export interface EvalRunReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  caseResults: EvalCaseResult[];
  overallScorecard: EvalScorecard;
  passed: boolean;
  summary: string;
}
```

**Implementation notes:**
- Zero imports, zero runtime code.
- Interfaces only — no classes, no enums, no functions.
- All fields are required; no optional properties.

---

## Task 2 — `src/lib/evals/scoring.ts`

**Goal:** Pure scoring functions with zero side effects. No DB, no embedding, no fs — operates on arrays of strings and numbers only.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/scoring.ts` — replaced funnel/routing/tool dimensions with retrieval-specific metrics.

**Exports:**

```typescript
import type { EvalScorecard, EvalScoreDimension, GoldenCase } from './domain';
import type { RetrievedChunk } from '@/lib/rag/retrieve';

export function precisionAtK(retrieved: string[], expected: string[], k: number): number
export function recallAtK(retrieved: string[], expected: string[]): number
export function meanReciprocalRank(retrieved: string[], expected: string[]): number
export function groundednessScore(retrievedContent: string[], expectedKeywords: string[]): number
export function scoreGoldenCase(goldenCase: GoldenCase, retrievedChunks: RetrievedChunk[]): EvalScorecard
```

**Implementation notes:**

- `precisionAtK`:
  - Slice `retrieved` to first `k` entries.
  - Count how many are in `expected`.
  - Return `hits / k`. If `k === 0`, return `0`.

- `recallAtK`:
  - Count how many `expected` items appear in `retrieved` (assumed pre-sliced by caller).
  - Return `hits / expected.length`. If `expected.length === 0`, return `1.0`.

- `meanReciprocalRank`:
  - Find the **first** item in `retrieved` that exists in `expected`.
  - Return `1 / (index + 1)`. If none found, return `0`.

- `groundednessScore`:
  - Concatenate all `retrievedContent` into one lowercase string.
  - For each `expectedKeywords`, check if it appears (case-insensitive).
  - Return `matchCount / expectedKeywords.length`. If `expectedKeywords.length === 0`, return `1.0`.

- `scoreGoldenCase`:
  - Map fields: `retrieved` = `chunks.map(c => c.chunkId)`, `retrievedContent` = `chunks.map(c => c.content)`.
  - Compute all 4 dimensions using the mapped arrays.
  - Build `EvalScorecard` using `createScorecard()` helper (same pattern as Ordo's `createEvalScorecard`).

**Pass thresholds (hardcoded in the scorer):**

| Dimension | Pass condition |
|-----------|---------------|
| `precision_at_k` | `score >= 0.4` |
| `recall_at_k` | `score >= 1.0` |
| `mrr` | `score >= 0.5` |
| `groundedness` | `score >= 0.8` |

---

## Task 3 — `src/lib/evals/scoring.test.ts`

**Goal:** 6 unit tests for the pure scoring functions.

```typescript
import { describe, expect, it } from 'vitest';
import {
  precisionAtK,
  recallAtK,
  meanReciprocalRank,
  groundednessScore,
} from './scoring';
```

| # | Test | Setup | Assertion |
|---|------|-------|-----------|
| 1 | `precisionAtK` — perfect retrieval | `retrieved=['a','b'], expected=['a','b'], k=2` | Returns `1.0` |
| 2 | `precisionAtK` — partial retrieval | `retrieved=['a','c','d'], expected=['a','b'], k=3` | Returns `1/3 ≈ 0.333` |
| 3 | `recallAtK` — all expected found | `retrieved=['a','b','c'], expected=['a','b']` | Returns `1.0` |
| 4 | `recallAtK` — some expected missing | `retrieved=['a','c'], expected=['a','b','d']` | Returns `1/3 ≈ 0.333` |
| 5 | `meanReciprocalRank` — hit at position 2 | `retrieved=['x','a','y'], expected=['a','b']` | Returns `0.5` |
| 6 | `groundednessScore` — 2/3 keywords found | `content=['the cat sat'], keywords=['cat','sat','dog']` | Returns `2/3 ≈ 0.667` |

**Implementation notes:**
- Pure functions, no mocking needed.
- Use `toBeCloseTo(value, 2)` for floating-point comparisons.

---

## Task 4 — Resolve Golden Set Chunk IDs

**Goal:** Query the seeded database to find the actual chunk IDs for each corpus document.

**Steps:**
1. Run:
```bash
sqlite3 data/contentops.db "SELECT id, chunk_level, heading FROM chunks WHERE chunk_level IN ('section','passage') ORDER BY id"
```
2. For each golden case query, identify which chunk IDs are the expected relevant results.
3. Record the IDs for use in Task 5.

**Fallback:** If `sqlite3` CLI is unavailable, write a small script `scripts/list-chunks.ts`:
```typescript
import { db } from '@/lib/db';
const rows = db.prepare(
  "SELECT id, chunk_level, heading FROM chunks WHERE chunk_level IN ('section','passage') ORDER BY id"
).all();
console.table(rows);
```
Run with: `tsx --env-file=.env.local scripts/list-chunks.ts`

---

## Task 5 — `src/lib/evals/golden-set.ts`

**Goal:** Curated golden cases covering all 5 corpus documents.

```typescript
import type { GoldenCase } from './domain';

export const GOLDEN_SET: GoldenCase[] = [
  // 5-8 cases, one per corpus document at minimum
  // chunk IDs resolved from Task 4
];
```

**Cases to cover:**

| # | Case ID | Query | Target Doc | Expected Keywords |
|---|---------|-------|------------|-------------------|
| 1 | `brand-voice` | "What is our brand voice?" | `brand-identity` | conversational, knowledgeable, friend |
| 2 | `content-pillars` | "What topics do we cover?" | `content-pillars` | reviews, guides, news |
| 3 | `style-tone` | "What tone should we use in articles?" | `style-guide` | conversational, authority, contractions |
| 4 | `audience-who` | "Who is our target audience?" | `audience-profile` | player, selective, community |
| 5 | `calendar-schedule` | "When are articles published?" | `content-calendar` | weekly, schedule, publish |

Additional cases may be added if the chunk structure reveals natural splits worth testing.

**Implementation notes:**
- `expectedChunkIds` — filled from Task 4 output.
- `expectedKeywords` — verified by grepping the corpus markdown files.
- All cases use `k: 5` (matching `retrieve.ts` default `maxResults`).

---

## Task 6 — `src/lib/evals/runner.ts`

**Goal:** Orchestrator that iterates golden cases, calls `retrieve()`, scores results, and builds a report.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/runner.ts` — stripped down from the Ordo runner's full scenario/checkpoint/seed system to a simple iterate → score → aggregate loop.

```typescript
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { EvalCaseResult, EvalRunReport, EvalScorecard, GoldenCase } from './domain';
import { GOLDEN_SET } from './golden-set';
import { scoreGoldenCase } from './scoring';
import { retrieve } from '@/lib/rag/retrieve';

export async function runGoldenEval(
  db: Database.Database,
  goldenSet: GoldenCase[] = GOLDEN_SET,
): Promise<EvalRunReport>
```

**Implementation notes:**

- **Loop:** For each case, `await retrieve(case.query, db, { maxResults: case.k })`.
- **Score:** `scoreGoldenCase(case, chunks)` returns `EvalScorecard`.
- **Build case result:** `{ caseId, query, retrievedChunkIds, scorecard, passed: scorecard.passed }`.
- **Aggregate:** Build `overallScorecard` by flattening all case dimensions into a single array:
  - `dimensions` = flat list of every per-case dimension (e.g., 5 cases × 4 dims = 20 entries).
  - `totalScore` = sum of all case `totalScore`s.
  - `maxScore` = sum of all case `maxScore`s.
  - `passed` = every case passed.
- **Report:** `{ runId: randomUUID(), startedAt, completedAt, caseResults, overallScorecard, passed, summary }`.
- `summary` is generated by `buildEvalSummary()` from `reporter.ts` or inlined.

---

## Task 7 — `src/lib/evals/reporter.ts`

**Goal:** Serialize eval reports and write them to disk.

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/reporting.ts`.

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunReport } from './domain';

export function buildEvalSummary(report: EvalRunReport): string
export function serializeEvalReport(report: EvalRunReport): string
export function writeEvalReport(report: EvalRunReport): void
```

**Implementation notes:**

- `buildEvalSummary`: Returns `"Golden eval: X/Y passed (S/M points)"`.
- `serializeEvalReport`: `JSON.stringify({ version: 1, ...report }, null, 2)`.
- `writeEvalReport`:
  1. `const dir = join(process.cwd(), 'data', 'eval-reports');`
  2. `mkdirSync(dir, { recursive: true });`
  3. `const filename = golden-${report.startedAt.replace(/[:.]/g, '-')}.json;`
  4. `writeFileSync(join(dir, filename), serializeEvalReport(report));`

---

## Task 8 — `src/lib/evals/runner.test.ts`

**Goal:** 3 integration tests for the runner orchestration logic. Uses in-memory DB with mocked embedder.

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { GoldenCase } from './domain';
import { runGoldenEval } from './runner';
```

| # | Test | Setup | Assertion |
|---|------|-------|-----------|
| 1 | Synthetic golden set produces correct report | In-memory DB with 2 synthetic chunks, mock `embedBatch`, 1 golden case with matching chunk ID + keyword | `report.passed === true`, `report.caseResults.length === 1`, scorecard dimensions present |
| 2 | Empty golden set returns passed | In-memory DB, `goldenSet = []` | `report.passed === true`, `report.caseResults === []` |
| 3 | Impossible case fails gracefully | In-memory DB with chunks, golden case expecting non-existent chunk ID | `report.passed === false`, case scorecard shows recall < 1.0 |

**Implementation notes:**

- Mock `@/lib/rag/embed` (same pattern as `retrieve.test.ts`): `vi.mock('@/lib/rag/embed', ...)`.
- Use `createTestDb()` from `@/lib/db/test-helpers` to create schema.
- Seed 2-3 synthetic chunks with deterministic embeddings.
- Pass custom `goldenSet` to `runGoldenEval(db, goldenSet)`.

---

## Task 9 — Replace `scripts/eval-golden.ts`

**Goal:** Replace the existing stub with the real CLI entry point.

```typescript
import { db } from '@/lib/db';
import { GOLDEN_SET } from '@/lib/evals/golden-set';
import { writeEvalReport, buildEvalSummary } from '@/lib/evals/reporter';
import { runGoldenEval } from '@/lib/evals/runner';

async function main() {
  console.log(`Running golden eval (${GOLDEN_SET.length} cases)...`);
  const report = await runGoldenEval(db);
  writeEvalReport(report);
  console.log(buildEvalSummary(report));
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Golden eval failed:', err);
  process.exit(1);
});
```

---

## Task 10 — Update `package.json` and `.gitignore`

**`package.json`:**
- Update `eval:golden` script from `tsx scripts/eval-golden.ts` to `tsx --env-file=.env.local scripts/eval-golden.ts`.

**`.gitignore`:**
- Add `data/eval-reports/` line.

---

## Task 11 — Final Verification

Run in sequence:

```bash
npm run typecheck
npm run lint
npm run test
npm run eval:golden
```

**Expected:**
- typecheck: 0 errors
- lint: 0 errors, 0 fixes applied
- test: **≥ 86 tests passing** (77 existing + 9 new)
- eval:golden: exits 0, all golden cases pass, JSON report written to `data/eval-reports/`

**Verify determinism:**
- Run `npm run eval:golden` twice — scores must be identical.

---

## Completion Checklist

- [x] `src/lib/evals/domain.ts` created — all 5 interfaces exported
- [x] `src/lib/evals/scoring.ts` created — `precisionAtK`, `recallAtK`, `meanReciprocalRank`, `groundednessScore`, `scoreGoldenCase` exported
- [x] `src/lib/evals/scoring.test.ts` created — 6 tests passing
- [x] Golden set chunk IDs resolved from seeded database
- [x] `src/lib/evals/golden-set.ts` created — 5 golden cases covering all corpus docs
- [x] `src/lib/evals/runner.ts` created — `runGoldenEval` exported
- [x] `src/lib/evals/reporter.ts` created — `buildEvalSummary`, `serializeEvalReport`, `writeEvalReport` exported
- [x] `src/lib/evals/runner.test.ts` created — 3 tests passing
- [x] `scripts/eval-golden.ts` replaced — real CLI with exit code
- [x] `package.json` updated — `eval:golden` includes `--env-file=.env.local`
- [x] `.gitignore` updated — `data/eval-reports/` added
- [x] `tsconfig.json` updated — `scripts/**/*.ts` added to include
- [x] `npm run typecheck` — 0 errors
- [x] `npm run lint` — 0 errors
- [x] `npm run test` — 86 passing (77 existing + 9 new)
- [x] `npm run eval:golden` — exits 0, 5/5 passed (17.0/20.0 points), report written
- [x] Determinism verified — two runs produce identical scores

---

## Commit Strategy

```
feat(s6): AI eval harness with golden retrieval tests

- Add domain.ts: GoldenCase, EvalScoreDimension, EvalScorecard, EvalRunReport
- Add scoring.ts: precisionAtK, recallAtK, MRR, groundednessScore
- Add golden-set.ts: 5+ curated cases covering all corpus documents
- Add runner.ts: iterate golden cases through retrieve(), score, build report
- Add reporter.ts: JSON report writer with mkdirSync + serialize
- Replace eval-golden.ts stub with real CLI (exit 0/1)
- 86+ tests passing (9 new: 6 scoring + 3 runner)
- npm run eval:golden exits 0 with full pass
```
