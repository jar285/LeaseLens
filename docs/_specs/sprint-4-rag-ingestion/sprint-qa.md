# Sprint QA — Sprint 4: Seed Corpus + RAG Ingestion Foundation

**Date:** 2026-04-28  
**QA pass by:** Agent self-review + Ordo pattern comparison  
**Status:** Issues found and fixed before human review

---

## Issues Found

### Issue 1 — Blocking: `INSERT OR REPLACE` Destroys Document ID, Breaking Chunk DELETE

**Location:** Task 8 step 7

**Problem:** The sprint plan instructed:
```
INSERT OR REPLACE INTO documents (with a new UUID id)
DELETE FROM chunks WHERE document_id = (SELECT id FROM documents WHERE slug = ?)
```

`INSERT OR REPLACE` on a UNIQUE column (`slug`) internally DELETEs the old row and inserts a new one with a freshly generated UUID. The `SELECT id ... WHERE slug = ?` after the replace therefore returns the **new** UUID, but the existing chunks reference the **old** UUID. The DELETE matches zero rows. Old chunks are never deleted and accumulate as orphans on every re-ingest.

**Ordo comparison:** Ordo's `EmbeddingPipeline.indexDocument()` calls `vectorStore.delete(sourceId)` before `vectorStore.upsert(records)`, using a stable `sourceId` that is never regenerated. The document's identity is its `sourceId` (slug), not an internally generated UUID.

**Fix:** Restructure the transaction in Task 8 to:
1. Before the transaction: query `SELECT id FROM documents WHERE slug = ?`.
2. If row exists: use the existing `id` (stable). DELETE old chunks by that id. UPDATE documents row (content, content_hash, title, created_at).
3. If row does not exist: generate a new UUID id. INSERT documents row. No chunk DELETE needed (none exist).
4. INSERT new chunks referencing the stable id in both cases.

This guarantees the document id is never regenerated for an existing document, and chunk DELETE always targets the correct id.

---

### Issue 2 — Minor: Mock Embedder Should Use Text-Derived Vectors, Not All-Zeros

**Location:** Task 9

**Problem:** Plan said "all zeros or a fixed pattern" for the mock. All-zero vectors L2-normalise to a zero-norm (division by zero), producing NaN BLOBs. The embedding stored test (`byteLength === 1536`) would pass even with NaN, but distinct texts would produce identical embeddings — which makes the Sprint 5 retrieval tests unreliable when built on top of this test infrastructure.

**Ordo comparison:** `docs/_references/ai_mcp_chat_ordo/src/adapters/MockEmbedder.ts` uses:
```ts
vec[i] = ((text.charCodeAt(i % text.length) + i) % 100) / 100;
```
followed by `l2Normalize`. This produces text-derived, distinct, unit-norm vectors — deterministic but meaningfully different per input.

**Fix:** Update Task 9 to use a text-derived mock: `vec[i] = ((text.charCodeAt(i % text.length) + i) % 100) / 100`, then L2-normalise. Return `Float32Array` (not `number[]`) to match the BLOB serialisation path.

---

### Issue 3 — Minor: L2 Normalisation Missing Zero-Norm Guard

**Location:** Task 7 (`embed.ts` implementation note)

**Problem:** Plan specified `v[i] / Math.sqrt(v.reduce(...))` with no guard for zero-norm vectors. If a text produces an all-zero embedding (degenerate edge case), `Math.sqrt(0) = 0`, and `v[i] / 0 = NaN`. NaN values would corrupt the BLOB.

**Ordo comparison:** `docs/_references/ai_mcp_chat_ordo/src/core/search/l2Normalize.ts`:
```ts
if (norm === 0) return vec;
```

**Fix:** Add `if (norm === 0) return vec` guard before the division. Updated in Task 7.

---

### Issue 4 — Minor: `chunk_index` Ambiguity (Global vs. Level-Local)

**Location:** Task 5 and Task 8

**Problem:** Task 5 said chunk IDs use level-local indices (`section:0`, `section:1`, `passage:0`) but did not specify what value is stored in the `chunk_index` DB column. If level-local, two chunks can share the same `chunk_index` value under the same `document_id` — breaking any ORDER BY `chunk_index` query in Sprint 5.

**Ordo comparison:** Ordo's `annotateDocumentChunks` assigns `localChunkIndex` globally across all non-document chunks (0, 1, 2...). This makes it a reliable ordering key.

**Fix:** Clarify that `chunk_index` stored in the DB is the **position in the full array** returned by `chunkDocument()` (globally sequential: 0, 1, 2... across all levels for a document). The string `id` still uses level-local index for readability. Updated in Task 5 and Task 8.

---

### Issue 5 — Minor: Async Seed Block Needs Explicit Pattern

**Location:** Task 10

**Problem:** "Make the main block async" was under-specified. The current block uses `if (require.main === module)` — adding `async` directly is a syntax error (`async if`). An async IIFE or top-level await via `tsx` must be used explicitly.

**Fix:** Updated Task 10 to specify wrapping the block in `(async () => { ... })()`.

---

## No Other Issues Found

- Task ordering is correct (schema before tests, chunker before embedder, embedder before ingest). ✓
- All verification commands are present and correct. ✓
- Commit strategy matches task groupings. ✓
- No scope creep — retrieval/BM25/grounded chat correctly excluded. ✓
- In-memory SQLite isolation for ingest tests is correct. ✓
- Five corpus files with content requirements are sufficient for Sprint 5 retrieval testing. ✓
- `slug` derived from filename is deterministic and stable across re-seeds. ✓

---

## Fixes Applied to `sprint.md`

All five issues above were corrected in `sprint.md` before this QA report was written. The plan is clean for human review.
