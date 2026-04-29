# Spec QA — Sprint 5: Hybrid RAG Retrieval + Grounded Chat

**Date:** 2026-04-28  
**Reviewer:** Cascade  
**Spec file:** `docs/_specs/sprint-5-rag-retrieval/spec.md`  

---

## Summary

7 issues found across the spec. 3 are **blocking** (would produce incorrect runtime behaviour or a type error), 4 are **advisory** (clarity/completeness gaps that would cause confusion during implementation). All have been fixed in the spec.

---

## Blocking Issues

### B1 — Missing JOIN: `documentSlug` is unreachable from the proposed SQL

**Location:** Section 5.2, Algorithm step 2.

**Problem:** The spec's SQL selects `id, document_id, heading, content, embedding` from `chunks`. But `RetrievedChunk.documentSlug` requires the `slug` column from the `documents` table. `document_id` is a UUID — using it as `documentSlug` would produce nonsense output and break the context block format `[N] {slug} > {heading}`.

**Fix:** Replace the flat `SELECT` with a JOIN:

```sql
SELECT c.id, c.heading, c.content, c.embedding, d.slug AS document_slug
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.chunk_level IN ('section', 'passage')
```

---

### B2 — Type mismatch: `embedBatch` returns `number[][]`, not `Float32Array`

**Location:** Section 5.2, Algorithm step 1. Section 6.2.

**Problem:** The spec says "Embed query → `Float32Array` via `embedBatch([query])`". But `embedBatch` (Sprint 4 `embed.ts`) is typed as `Promise<number[][]>`. If the implementer uses the Ordo-style `dotSimilarity(Float32Array, Float32Array)` signature, this is a type error.

**Fix:** Spec now explicitly describes the two-step conversion required:

```typescript
const [rawQuery] = await embedBatch([query]);  // number[]
const queryVec = Float32Array.from(rawQuery);   // Float32Array for dotSimilarity
```

And clarifies that stored chunk embeddings must also be deserialized with `bufferToFloat32` before calling `dotSimilarity`.

---

### B3 — G3 contradicts Section 8 invariant on BM25 caching

**Location:** Section 2 Goal G3 vs Section 8 invariants.

**Problem:** G3 says the BM25 index is "built lazily at query time and **cached** in-process." Section 8 says "retrieve.ts has **no module-level state**." A cache requires module-level state. The two are mutually exclusive. The correct behaviour per Section 8 is to build fresh on each call (acceptable at 39 chunks, < 0.1ms).

**Fix:** G3 reworded to "built lazily at query time from the loaded chunk records — not persisted to the database and not cached between calls."

---

## Advisory Issues

### A1 — `ChunkRow` type used but never defined

**Location:** Section 5.1, `buildBM25Index(chunks: ChunkRow[])`.

**Problem:** `ChunkRow` is referenced in the `bm25.ts` contract but never defined anywhere in the spec. The implementer would have to infer it.

**Fix:** Added inline definition to Section 5.1:

```typescript
interface ChunkRow {
  id:      string;
  content: string;
}
```

Only `id` and `content` are needed by `buildBM25Index`. `chunk_level` filtering happens in `retrieve.ts` before passing to the BM25 builder.

---

### A2 — No `bm25.test.ts` — missing tests for pure functions and wrong total count

**Location:** Section 9, Acceptance Criteria Section 11.

**Problem:** `bm25.ts` exports three pure, highly testable functions (`tokenize`, `buildBM25Index`, `scoreBM25`) but no unit tests are specified. The spec's test count of "67 + 7 = 74" is also wrong if `bm25.test.ts` is added.

**Fix:** Added `bm25.test.ts` to Section 9 with 3 tests. Updated total to **≥ 77** (67 + 10 new).

New tests:
- `tokenize` lowercases and removes short tokens.
- `buildBM25Index` computes correct `docCount` and `avgDocLength`.
- `scoreBM25` returns higher score for chunk containing the query term.

---

### A3 — `retrieve.test.ts` does not explicitly state it mocks `./embed`

**Location:** Section 9.1.

**Problem:** The spec says tests use "mock embeddings (same pattern as `ingest.test.ts`)" but does not explicitly state that `vi.mock('./embed', ...)` is required. An implementer could write tests that trigger real WASM loading, making the test suite slow and network-dependent.

**Fix:** Added explicit note: all `retrieve.test.ts` tests must `vi.mock('./embed', () => ({ embedBatch: vi.fn(...) }))` using the same text-derived deterministic pattern from `ingest.test.ts`.

---

### A4 — Test 1 "clearly closest chunk" pattern is ambiguous with deterministic mocks

**Location:** Section 9.1, Test 1.

**Problem:** The test description says "seed 3 chunks where one is clearly closest" but does not explain how to guarantee this with text-derived mock embeddings. An implementer using the same mock as `ingest.test.ts` may not know which chunk will rank first.

**Fix:** Test 1 description updated to specify: use identical query text and chunk content (e.g. query `"alpha beta"` and a chunk whose content is `"alpha beta"`) to guarantee maximum cosine similarity = 1.0 for that chunk, making it unambiguously first.

---

## Applied Fixes — Spec Diff Summary

| # | Section | Change |
|---|---------|--------|
| B1 | §5.2 step 2 | SQL replaced with JOIN on `documents` table to get `document_slug` |
| B2 | §5.2 step 1, §6.2 | Clarified `embedBatch` → `number[][]`; added `Float32Array.from()` conversion step |
| B3 | §2 G3 | Removed "cached" — clarified as "built fresh per call, not persisted" |
| A1 | §5.1 | Added `ChunkRow` interface definition |
| A2 | §9, §11 | Added `bm25.test.ts` (3 tests); updated count to ≥ 77 |
| A3 | §9.1 | Explicit `vi.mock('./embed')` requirement added |
| A4 | §9.1 test 1 | Clarified deterministic mock pattern for guaranteed winner |
