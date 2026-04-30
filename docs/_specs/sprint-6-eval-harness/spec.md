# Spec — Sprint 6: AI Eval Harness

**Sprint:** 6  
**Status:** Complete  
**Date:** 2026-04-29  
**Author:** Cascade  

---

## 1. Problem Statement

Sprint 5 shipped hybrid RAG retrieval and grounded chat. The assistant now references brand documents, but we have no systematic way to verify:

- **Retrieval quality:** Does the search pipeline return the *right* chunks for a given query?
- **Groundedness:** Does the assistant's response actually reference the retrieved context rather than hallucinating?
- **Regression detection:** If a future sprint alters the prompt, chunking strategy, or retrieval weights, will we know?

Without an eval harness, quality is verified by eyeballing chat responses — that doesn't scale and isn't CI-friendly.

---

## 2. Goals

1. **Golden test suite.** A deterministic eval runner (`scripts/eval-golden.ts`) that executes a set of predefined query/expectation pairs (golden set) against the retrieval pipeline and scores each result.
2. **Retrieval scoring.** For each golden query, verify that expected chunks appear in the top-k results (Precision@k, Recall@k, MRR).
3. **Groundedness scoring.** For each golden query, verify that the system prompt's `<context>` block contains passages relevant to the expected answer — no LLM call required for deterministic evals.
4. **CLI-friendly.** `npm run eval:golden` exits 0 if all golden cases pass, exits 1 otherwise. Produces a JSON report to `data/eval-reports/`.
5. **Extensible.** The domain types and scoring functions are structured so that Sprint 9's cockpit can surface eval health, and future sprints can add live-model evals.

---

## 3. Non-Goals

| # | Non-Goal | Rationale |
|---|----------|-----------|
| 1 | Live-model evals (send query to Claude, judge response) | Requires API spend; deferred to a future "live eval" layer. |
| 2 | Automated eval on every `npm run test` | Golden evals hit the real embedding model (WASM); they run via `npm run eval:golden` separately. |
| 3 | UI for eval results | Sprint 9 cockpit will surface eval health. |
| 4 | Persisting eval runs to SQLite | JSON reports on disk are sufficient for now. |
| 5 | BM25 index persistence | Still rebuilds per query; Sprint 5 confirmed < 1ms for 39 chunks. |

---

## 4. Architecture

### 4.1 New Files

| File | Purpose |
|------|---------|
| `src/lib/evals/domain.ts` | Core types: `GoldenCase`, `EvalScoreDimension`, `EvalScorecard`, `EvalRunReport` |
| `src/lib/evals/scoring.ts` | Pure scoring functions: `precisionAtK`, `recallAtK`, `meanReciprocalRank`, `groundednessScore`, `scoreGoldenCase` |
| `src/lib/evals/golden-set.ts` | The golden dataset: array of `GoldenCase` objects with query, expected chunk IDs, expected keywords |
| `src/lib/evals/runner.ts` | Orchestrator: loads DB, runs each golden case through `retrieve()`, scores results, builds report |
| `src/lib/evals/reporter.ts` | Formats and writes JSON report to `data/eval-reports/` |
| `src/lib/evals/scoring.test.ts` | Unit tests for pure scoring functions |
| `src/lib/evals/runner.test.ts` | Integration tests for the eval runner with in-memory DB and mocked embedder |
| `scripts/eval-golden.ts` | CLI entry point — replaces the existing stub |

### 4.2 Modified Files

| File | Change |
|------|--------|
| `package.json` | Update `eval:golden` script to `tsx --env-file=.env.local scripts/eval-golden.ts` |
| `.gitignore` | Add `data/eval-reports/` to avoid committing generated reports |

### 4.3 Data Flow

```
npm run eval:golden
  → scripts/eval-golden.ts
    → runner.runGoldenEval(db)
      → for each GoldenCase in golden-set:
        → retrieve(query, db)
        → scoreGoldenCase(case, retrievedChunks)
          → precisionAtK, recallAtK, meanReciprocalRank
          → groundednessScore (keyword presence in retrieved content)
      → build EvalRunReport with scorecard
    → reporter.writeReport(report)
    → exit 0 if passed, 1 if failed
```

---

## 5. Module Contracts

### 5.1 `domain.ts`

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/domain.ts` — simplified for ContentOps (no cohorts, no tool behaviors, no live model layer yet).

```typescript
export interface GoldenCase {
  id: string;
  query: string;
  expectedChunkIds: string[];       // chunks that MUST appear in top-k
  expectedKeywords: string[];       // keywords that MUST appear in retrieved content
  k: number;                        // top-k to evaluate (default 5)
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

### 5.2 `scoring.ts`

Pure functions, zero side effects. Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/scoring.ts` — simplified to retrieval-specific dimensions instead of funnel/routing/tool dimensions.

```typescript
export function precisionAtK(
  retrieved: string[],
  expected: string[],
  k: number,
): number
// |retrieved ∩ expected| / k

export function recallAtK(
  retrieved: string[],
  expected: string[],
): number
// |retrieved ∩ expected| / |expected|
// Note: `retrieved` is assumed to be pre-sliced to top-k by the caller.

export function meanReciprocalRank(
  retrieved: string[],
  expected: string[],
): number
// 1 / rank of first expected hit in retrieved list (0 if none)

export function groundednessScore(
  retrievedContent: string[],
  expectedKeywords: string[],
): number
// fraction of expectedKeywords found in concatenated retrievedContent

export function scoreGoldenCase(
  goldenCase: GoldenCase,
  retrievedChunks: RetrievedChunk[],
): EvalScorecard
// Computes all 4 dimensions and returns a scorecard
```

**Scoring dimensions per golden case:**

| Dimension ID | Label | Pass Threshold | Description |
|---|---|---|---|
| `precision_at_k` | Precision@K | ≥ 0.4 | At least 40% of top-k results are expected |
| `recall_at_k` | Recall@K | = 1.0 | All expected chunks appear in top-k |
| `mrr` | Mean Reciprocal Rank | ≥ 0.5 | First expected chunk appears in top-2 positions |
| `groundedness` | Groundedness | ≥ 0.8 | ≥ 80% of expected keywords found in retrieved content |

### 5.3 `golden-set.ts`

A curated set of 5–8 golden cases covering each corpus document:

```typescript
// NOTE: chunk IDs below are PLACEHOLDERS. The actual IDs must be resolved
// by querying the seeded database at implementation time, because
// mergeUndersized() in chunk-document.ts may merge small chunks and
// passage-level chunks use a separate index counter.
export const GOLDEN_SET: GoldenCase[] = [
  {
    id: 'brand-voice',
    query: 'What is our brand voice?',
    expectedChunkIds: ['<resolve from DB>'],
    expectedKeywords: ['conversational', 'knowledgeable', 'friend'],
    k: 5,
  },
  {
    id: 'content-pillars',
    query: 'What topics do we cover?',
    expectedChunkIds: ['<resolve from DB>'],
    expectedKeywords: ['reviews', 'guides', 'news'],
    k: 5,
  },
  // ... additional cases for style-guide, audience-profile, content-calendar
];
```

**Important:** The exact chunk IDs **must** be resolved by querying the seeded database during implementation (`SELECT id FROM chunks WHERE chunk_level IN ('section','passage')`) because `mergeUndersized()` in `chunk-document.ts` may alter which IDs survive, and passage-level chunks use a separate index counter. The golden set is a code file (not JSON) so it can be type-checked.

### 5.4 `runner.ts`

```typescript
export async function runGoldenEval(
  db: Database.Database,
  goldenSet?: GoldenCase[],
): Promise<EvalRunReport>
```

- Iterates each golden case.
- Calls `retrieve(case.query, db, { maxResults: case.k })`.
- Calls `scoreGoldenCase(case, chunks)`.
- Aggregates into an `EvalRunReport`.
- Overall pass = every case passes.

### 5.5 `reporter.ts`

Adapted from `docs/_references/ai_mcp_chat_ordo/src/lib/evals/reporting.ts`.

```typescript
export function buildEvalSummary(report: EvalRunReport): string
// Human-readable one-liner: "Golden eval: 5/5 passed (20/20 points)"

export function writeEvalReport(report: EvalRunReport): void
// Creates data/eval-reports/ if needed (mkdirSync recursive), then
// writes JSON to data/eval-reports/golden-<timestamp>.json

export function serializeEvalReport(report: EvalRunReport): string
// JSON.stringify with version field
```

### 5.6 `scripts/eval-golden.ts`

Replaces the existing stub. Loads the real DB, runs the golden eval, writes the report, and exits with the appropriate code.

```typescript
import { db } from '@/lib/db';
import { runGoldenEval } from '@/lib/evals/runner';
import { buildEvalSummary, writeEvalReport } from '@/lib/evals/reporter';

async function main() {
  const report = await runGoldenEval(db);
  writeEvalReport(report);
  console.log(buildEvalSummary(report));
  process.exit(report.passed ? 0 : 1);
}

main();
```

---

## 6. Golden Set Design Rationale

The golden set is designed around the existing 5 corpus documents. Each case:

1. Uses a **natural language query** that a real Creator/Editor would ask.
2. Specifies **expected chunk IDs** — the chunks that *must* appear in the retrieval results for the query to be considered successful.
3. Specifies **expected keywords** — domain-specific terms that *must* appear in the retrieved content to confirm groundedness.
4. Uses `k=5` (the default `maxResults` from `retrieve.ts`).

The chunk IDs will be resolved by querying the seeded database during implementation to ensure they match the actual ingested chunk identifiers.

---

## 7. Sprint-Local Invariants

1. **No LLM calls in deterministic evals.** Golden evals test the retrieval pipeline only. No Anthropic API key required.
2. **Evals use the real embedding model.** Unlike unit tests (which mock `embedBatch`), golden evals run the full WASM embedder to test end-to-end retrieval quality.
3. **Evals are idempotent.** Running `npm run eval:golden` multiple times produces the same results (deterministic embeddings + deterministic BM25).
4. **Reports are gitignored.** `data/eval-reports/` is ephemeral output; the golden set is the source of truth.
5. **Pure scoring functions have zero dependencies on DB or embedding.** They operate on arrays of strings and numbers only.

---

## 8. Tests

### 8.1 Unit Tests — `scoring.test.ts` (6 tests)

| # | Test | Assertion |
|---|------|-----------|
| 1 | `precisionAtK` with perfect retrieval | Returns 1.0 when all top-k are expected |
| 2 | `precisionAtK` with partial retrieval | Returns correct fraction |
| 3 | `recallAtK` returns 1.0 when all expected found | All expected in top-k |
| 4 | `recallAtK` returns < 1.0 when some expected missing | Partial recall |
| 5 | `meanReciprocalRank` returns correct rank | First expected at position 2 → MRR = 0.5 |
| 6 | `groundednessScore` returns correct fraction | 2/3 keywords found → 0.667 |

### 8.2 Integration Tests — `runner.test.ts` (3 tests)

| # | Test | Assertion |
|---|------|-----------|
| 1 | `runGoldenEval` with synthetic golden set and mocked DB produces correct report structure | Verifies runner orchestration: iterates cases, calls scoring, builds report with correct shape. Uses mocked embedder + in-memory DB with synthetic chunks — does NOT test real retrieval quality. |
| 2 | `runGoldenEval` with empty golden set returns passed | Edge case: report.passed = true, caseResults = [] |
| 3 | `runGoldenEval` with impossible case fails gracefully | A case expecting non-existent chunks → case.passed = false, report.passed = false |

### 8.3 Test Totals

- Existing: 77
- New: 9 (6 scoring + 3 runner)
- Target: **≥ 86 passing**

---

## 9. File-by-File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/evals/domain.ts` | Create | Core types for eval harness |
| `src/lib/evals/scoring.ts` | Create | Pure scoring: precision, recall, MRR, groundedness |
| `src/lib/evals/golden-set.ts` | Create | Curated golden cases covering all 5 corpus docs |
| `src/lib/evals/runner.ts` | Create | Orchestrator: run cases, score, build report |
| `src/lib/evals/reporter.ts` | Create | JSON report writer + human-readable summary |
| `src/lib/evals/scoring.test.ts` | Create | 6 unit tests for pure scoring functions |
| `src/lib/evals/runner.test.ts` | Create | 3 integration tests for eval runner |
| `scripts/eval-golden.ts` | Modify | Replace stub with real eval runner |
| `package.json` | Modify | Ensure `eval:golden` script runs `tsx scripts/eval-golden.ts` |
| `.gitignore` | Modify | Add `data/eval-reports/` |

---

## 10. Acceptance Criteria

- [x] `npm run typecheck` — zero errors.
- [x] `npm run lint` — zero errors.
- [x] `npm run test` — 86 tests passing (77 existing + 9 new).
- [x] `npm run eval:golden` — exits 0 with 5/5 golden cases passing (17.0/20.0 points).
- [x] `npm run eval:golden` produces a JSON report in `data/eval-reports/`.
- [x] Golden eval is deterministic: running twice produces the same scores.
- [x] No Anthropic API key required for `npm run eval:golden`.

---

## 11. Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should golden evals run as part of `npm run test`? | **No** — they require the real WASM embedder and seeded DB. Keep them in `npm run eval:golden` separately. |
| 2 | Should we add a live-model eval layer now? | **No** — deferred. The domain types are extensible for it later. |
| 3 | What pass thresholds should we use? | Precision ≥ 0.4, Recall = 1.0, MRR ≥ 0.5, Groundedness ≥ 0.8. These are calibrated to the current 5-doc corpus and can be tightened as the corpus grows. |
| 4 | Should the runner accept a custom DB path? | **Yes** — it takes `db` as a parameter (same pattern as `retrieve()`), but the CLI script uses the real DB from `@/lib/db`. |

---

## 12. Reference Alignment

| Borrowed Pattern | Source | Adaptation |
|---|---|---|
| `EvalScoreDimension`, `EvalScorecard`, `createEvalScorecard` | `_references/ai_mcp_chat_ordo/src/lib/evals/domain.ts` | Simplified: removed cohorts, tool behaviors, observation tracking. Kept dimension/scorecard structure. |
| `scoreEvalExecution` switch-case pattern | `_references/ai_mcp_chat_ordo/src/lib/evals/scoring.ts` | Replaced funnel/routing dimensions with retrieval-specific: precision, recall, MRR, groundedness. |
| `buildEvalRunReport`, `serializeEvalRunReport` | `_references/ai_mcp_chat_ordo/src/lib/evals/reporting.ts` | Same structure: report → scorecard → summary. Simplified for single golden-set layer. |
| `resolveEvalRuntimeConfig` env-based mode switching | `_references/ai_mcp_chat_ordo/src/lib/evals/config.ts` | Not adopted yet — deterministic-only for Sprint 6. Will add env-based live/deterministic switching when live evals are added. |
| `runDeterministicEvalScenario` test pattern | `_references/ai_mcp_chat_ordo/src/lib/evals/runner.retrieval-contracts.test.ts` | Adopted: test calls runner, asserts all required checkpoints pass. |
