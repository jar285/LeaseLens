# Spec — Sprint 5: Hybrid RAG Retrieval + Grounded Chat

**Sprint:** 5  
**Status:** Complete  
**Date:** 2026-04-29  
**Author:** Cascade  

---

## 1. Problem Statement

Sprint 4 ingested, chunked, and embedded the Side Quest Syndicate corpus into SQLite. The embeddings exist in the `chunks` table but no retrieval layer exists yet. As a result, the chat assistant answers entirely from Claude's base knowledge — it has no awareness of the brand's actual style guide, audience profile, content pillars, or calendar.

This sprint wires retrieval to the chat. When a user sends a message, the system:

1. Embeds the query using the same MiniLM model.
2. Runs vector similarity search over the `chunks` table.
3. Runs BM25 keyword scoring over the same chunk corpus.
4. Fuses both ranked lists using Reciprocal Rank Fusion (RRF).
5. Injects the top-k retrieved passages into the system prompt as grounding context.
6. Claude's response is now anchored to the brand's actual documents.

---

## 2. Goals

- **G1** — Hybrid retrieval (vector + BM25 + RRF) over the `chunks` table, fully in-process with no external service.
- **G2** — Retrieved context injected into the system prompt before every chat call.
- **G3** — The BM25 index is built lazily at query time from the loaded chunk records — not persisted to the database and not cached between calls (no new DB table, no module-level state).
- **G4** — The retrieval pipeline is independently testable and decoupled from the chat route.
- **G5** — Zero regressions: all 67 existing tests continue passing.

---

## 3. Non-Goals

- No UI surface for "retrieved sources" (that is Sprint 6/eval territory).
- No persistent BM25 index in SQLite (in-process cache is sufficient for the demo corpus size).
- No re-ranking beyond RRF.
- No streaming of source citations to the client.
- No per-user corpus partitioning.

---

## 4. Architecture

### 4.1 New Files

```
src/lib/rag/
  retrieve.ts          — hybrid search: vector + BM25 + RRF, returns top-k chunks
  bm25.ts              — pure BM25 scorer + index builder (no external deps)
  retrieve.test.ts     — 5 unit tests (seeded in-memory DB)
src/lib/chat/
  system-prompt.ts     — MODIFIED: accepts optional grounding context
```

### 4.2 Modified Files

```
src/app/api/chat/route.ts       — call retrieve() before buildSystemPrompt()
src/lib/chat/system-prompt.ts   — accept RetrievedChunk[] and append context block
src/lib/chat/system-prompt.test.ts — extend for context injection
```

### 4.3 Data Flow

```
User message
     │
     ▼
retrieve(message, db)          ← new
     │  embedBatch([query])     ← reuses Sprint 4 embed.ts
     │  dotSimilarity × N       ← pure math, no deps
     │  BM25 score × N          ← pure math, no deps
     │  reciprocalRankFusion    ← pure math, no deps
     │  → top-k RetrievedChunk[]
     │
     ▼
buildSystemPrompt(role, chunks) ← modified
     │  appends <context> block
     │
     ▼
Anthropic stream
```

---

## 5. Module Contracts

### 5.1 `src/lib/rag/bm25.ts`

```typescript
export interface ChunkRow {
  id:      string;  // chunk id
  content: string;  // plain text content
}

export interface BM25Index {
  avgDocLength: number;
  docCount: number;
  docLengths: Map<string, number>;          // chunkId → word count
  termDocFrequencies: Map<string, number>;  // term → # docs containing term
}

export function buildBM25Index(chunks: ChunkRow[]): BM25Index

export function scoreBM25(
  queryTerms: string[],
  docTokens: string[],
  docLength: number,
  index: BM25Index,
  k1?: number,   // default 1.2
  b?: number,    // default 0.75
): number

export function tokenize(text: string): string[]
```

- `tokenize` lowercases and splits on `\W+`, filters tokens < 2 chars.
- `buildBM25Index` iterates all `ChunkRow` records once to compute doc lengths and term-doc frequencies.
- `scoreBM25` is pure — no side effects, fully deterministic.

### 5.2 `src/lib/rag/retrieve.ts`

```typescript
export interface RetrievedChunk {
  chunkId:    string;
  documentSlug: string;
  heading:    string | null;
  content:    string;
  rrfScore:   number;
  vectorRank: number | null;
  bm25Rank:   number | null;
}

export interface RetrieveOptions {
  vectorTopN?: number;   // default 20
  bm25TopN?:   number;   // default 20
  rrfK?:       number;   // default 60
  maxResults?: number;   // default 5
}

export async function retrieve(
  query: string,
  db: Database.Database,
  opts?: RetrieveOptions,
): Promise<RetrievedChunk[]>
```

**Algorithm (mirrors Ordo's `HybridSearchEngine`):**

1. Embed query: `const [rawQuery] = await embedBatch([query])` → `number[]`. Convert: `const queryVec = Float32Array.from(rawQuery)`.
2. Load all `section` + `passage` chunks from DB with a JOIN to get `document_slug`:
   ```sql
   SELECT c.id, c.heading, c.content, c.embedding, d.slug AS document_slug
   FROM chunks c
   JOIN documents d ON d.id = c.document_id
   WHERE c.chunk_level IN ('section', 'passage')
   ```
3. Deserialise each `embedding` BLOB → `Float32Array` via `bufferToFloat32(row.embedding)` (see §6.1).
4. Compute `dotSimilarity(queryVec, chunkVec)` for each chunk (`Float32Array` × `Float32Array`). Sort descending. Take `vectorTopN`. Build `vectorRanking: Map<id, rank>`.
5. Build BM25 index from loaded chunks (lazy, in-process, not persisted).
6. `tokenize(query)` → query terms. Score each chunk with `scoreBM25`. Sort descending. Take `bm25TopN`. Build `bm25Ranking: Map<id, rank>`.
7. `reciprocalRankFusion([vectorRanking, bm25Ranking], rrfK)` → `Map<id, rrfScore>`.
8. Sort by RRF score descending. Slice to `maxResults`. Return `RetrievedChunk[]`.

**DB coupling:** `retrieve.ts` takes `db` as a parameter — no module-level singleton. This keeps it testable with an in-memory database.

### 5.3 `src/lib/chat/system-prompt.ts` (modified)

```typescript
export function buildSystemPrompt(
  role: Role,
  context?: RetrievedChunk[],
): string
```

When `context` is provided and non-empty, append a `<context>` XML block after the base prompt lines:

```
<context>
The following passages are from the Side Quest Syndicate brand documents.
Use them to ground your response. Cite the source heading when relevant.

[1] Brand Identity > Brand Voice
"We write like a knowledgeable friend..."

[2] Style Guide > Vocabulary Rules
"Avoid 'masterpiece', 'game-changer'..."
</context>
```

Format: `[N] {slug} > {heading}\n"{content}"`  
Max content per passage: **400 chars** (truncate with `…`).  
Max passages: **5** (enforced by `retrieve` default).

---

## 6. Retrieval Quality Considerations

### 6.1 Embedding deserialisation

Sprint 4 stored embeddings as `Buffer.from(new Float32Array(vector).buffer)`. To read back:

```typescript
function bufferToFloat32(buf: Buffer): Float32Array {
  const copy = Buffer.alloc(buf.length);
  buf.copy(copy);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}
```

The `Buffer.copy` step is required — the Buffer from `better-sqlite3` may share memory that is not aligned for `Float32Array` construction on all Node versions. (Pattern taken directly from Ordo's `SQLiteVectorStore.deserializeEmbedding`.)

### 6.2 Dot product vs cosine similarity

Because Sprint 4's `embed.ts` L2-normalises all stored vectors, and the query vector — obtained via `embedBatch` which also applies L2 normalisation — is converted to `Float32Array` before calling `dotSimilarity`, both inputs are unit vectors. Dot product and cosine similarity are therefore equivalent. Using dot product avoids a second square-root calculation.

**Note:** `embedBatch` returns `number[][]`. The conversion `Float32Array.from(rawQuery)` is required before calling `dotSimilarity(Float32Array, Float32Array)`.

### 6.3 BM25 corpus size

The demo corpus is 39 chunks. At this scale, building the BM25 index on every query (~0.1ms) is cheaper than adding a persistence layer. The in-process cache pattern is appropriate and matches Ordo's `InMemoryBM25IndexStore`.

### 6.4 Empty corpus guard

If no chunks exist in the DB (e.g. seed not run), `retrieve` returns `[]` and the system prompt receives no context block. The chat continues to work ungrounded rather than throwing.

---

## 7. `system-prompt.ts` Context Format — Rationale

Using an XML `<context>` wrapper is consistent with Anthropic's recommended pattern for injecting structured data (per Anthropic docs). It clearly delineates retrieved content from instructions and is easy for Claude to parse and cite.

The `[N] slug > heading` label enables Claude to produce citations like *"According to the Style Guide (Vocabulary Rules)…"* without any additional prompt engineering.

---

## 8. Sprint-Local Invariants

- `retrieve.ts` has **no module-level state**. The BM25 index is built inside the function call on every invocation (acceptable: 39 chunks, < 0.1ms).
- The `db` parameter is never imported from `@/lib/db` inside `retrieve.ts` — always injected.
- `bm25.ts` has **zero imports** from the RAG or DB layers — it is pure TypeScript.
- `system-prompt.ts` must remain synchronous — the `context` parameter is pre-resolved by the caller.
- The chat route calls `retrieve(message, db)` before `buildSystemPrompt`. If retrieval throws, the error is caught and the chat proceeds without context (graceful degradation).

---

## 9. Tests

### 9.1 `retrieve.test.ts` — 5 tests

All tests use an in-memory SQLite database (schema from `SCHEMA`) seeded with a small synthetic corpus (2–3 documents, ~6 chunks). All tests must `vi.mock('./embed', () => ({ embedBatch: vi.fn(...) }))` using the same text-derived deterministic vector pattern as `ingest.test.ts` — **never load real WASM**.

1. **returns top-k results for a relevant query** — seed chunks where one chunk's content is identical to the query string (e.g. query `"alpha beta"`, chunk content `"alpha beta …"`). With L2-normalised deterministic mock embeddings this chunk will have the maximum dot product. Assert the first result's `chunkId` matches that chunk.
2. **returns empty array when corpus is empty** — empty DB; assert `retrieve(...)` returns `[]`.
3. **respects maxResults option** — seed 6 chunks; call with `maxResults: 2`; assert `result.length === 2`.
4. **RRF score is non-zero for matched chunks** — assert all returned chunks have `rrfScore > 0`.
5. **document-level chunks are excluded** — seed includes one `document`-level chunk and two `section`-level chunks; assert no result has a `chunkId` matching the document chunk.

### 9.2 `bm25.test.ts` — 3 new tests

6. **tokenize lowercases and filters short tokens** — `tokenize('Hello World a')` returns `['hello', 'world']` (single-char `'a'` dropped).
7. **buildBM25Index computes correct docCount and avgDocLength** — build index from 2 chunks with known word counts; assert `docCount === 2` and `avgDocLength === expected`.
8. **scoreBM25 returns higher score for matching chunk** — two chunks, one contains query term, one does not; assert matching chunk score > non-matching chunk score.

### 9.3 `system-prompt.test.ts` additions — 2 new tests

9. **includes context block when chunks provided** — call `buildSystemPrompt('Creator', mockChunks)`; assert output contains `<context>` and `[1]`.
10. **omits context block when no chunks provided** — call `buildSystemPrompt('Creator')`; assert output does not contain `<context>`.

---

## 10. File-by-File Change Summary

| File | Action | Notes |
|------|--------|-------|
| `src/lib/rag/bm25.ts` | Create | Pure BM25: `tokenize`, `buildBM25Index`, `scoreBM25` |
| `src/lib/rag/retrieve.ts` | Create | Hybrid search: embed → vector → BM25 → RRF |
| `src/lib/rag/bm25.test.ts` | Create | 3 tests for pure BM25 functions |
| `src/lib/rag/retrieve.test.ts` | Create | 5 tests, in-memory DB, mock embedder via `vi.mock('./embed')` |
| `src/lib/chat/system-prompt.ts` | Modify | Accept optional `RetrievedChunk[]`, append `<context>` block |
| `src/lib/chat/system-prompt.test.ts` | Modify | 2 new tests for context injection |
| `src/app/api/chat/route.ts` | Modify | Call `retrieve()` before `buildSystemPrompt()`, wrap in try/catch |

---

## 11. Acceptance Criteria

- [x] `npm run typecheck` — zero errors.
- [x] `npm run lint` — zero errors.
- [x] `npm run test` — 77 tests passing (67 existing + 10 new: 5 retrieve + 3 bm25 + 2 system-prompt).
- [x] Sending "What is our brand voice?" in the chat UI produces a response that references specific language from `brand-identity.md` or `style-guide.md`.
- [x] Sending the same message twice produces the same context chunks (deterministic retrieval).
- [x] If the `chunks` table is empty, the chat still responds (graceful degradation confirmed via `retrieve.test.ts` empty corpus test).

---

## 12. Open Questions

| # | Question | Decision |
|---|----------|----------|
| 1 | Should retrieved sources be streamed to the client for display? | **No** — deferred to Sprint 6 eval harness which will expose retrieval metadata. |
| 2 | Should BM25 index be persisted to SQLite (like Ordo's `SQLiteBM25IndexStore`)? | **No** — 39 chunks rebuilds in < 1ms. Add persistence in Sprint 6 if eval shows latency issues. |
| 3 | Should `retrieve` filter by `chunk_level` or retrieve all levels? | **Only `section` + `passage`** — `document` chunks are too broad for targeted grounding. |

---

## 13. Reference Alignment

| Ordo Component | ContentOps Equivalent | Delta |
|---|---|---|
| `HybridSearchEngine.ts` | `retrieve.ts` | Simplified: no `QueryProcessor`, no `deduplicateBySection`, no `ResultFormatter`. Single function instead of class. |
| `BM25Scorer.ts` | `bm25.ts` `scoreBM25()` | Identical algorithm, different shape (pure functions vs class). |
| `ReciprocalRankFusion.ts` | `retrieve.ts` (inline) | Identical algorithm, inlined to avoid extra file for 10-line function. |
| `dotSimilarity.ts` | `retrieve.ts` (inline) | Same. |
| `SQLiteVectorStore.deserializeEmbedding` | `retrieve.ts` `bufferToFloat32()` | Same buffer-copy pattern. |
| `InMemoryBM25IndexStore` | In-process `Map` inside `retrieve()` | No persistence needed at this corpus size. |
| `ResultFormatter.highlightTerms` | Not implemented | Deferred — no UI source display this sprint. |
